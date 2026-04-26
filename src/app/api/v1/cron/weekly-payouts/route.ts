import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

const MIN_AUTO_PAYOUT_PENCE = 1000; // £10 — same floor as the manual withdraw.

// POST /api/v1/cron/weekly-payouts
//
// Scheduled worker — runs every Monday at 09:00 UTC. Sweeps every wallet with
// available >= MIN_AUTO_PAYOUT_PENCE and complete bank details, creates a
// WithdrawalRequest, debits the wallet, writes a PAYOUT ledger row, and
// pushes the barber. Wallets with an in-flight (REQUESTED/PROCESSING)
// request are skipped — auto-payout never queues two on top of each other.
//
// Same protection model as the other crons: x-cron-secret header.
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return errorResponse("NOT_CONFIGURED", "CRON_SECRET not set", 503);
  }
  if (request.headers.get("x-cron-secret") !== expected) {
    return errorResponse("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  try {
    const wallets = await prisma.wallet.findMany({
      where: {
        availableInPence: { gte: MIN_AUTO_PAYOUT_PENCE },
        barberProfile: {
          bankAccountName: { not: null },
          bankSortCode: { not: null },
          bankAccountNumber: { not: null },
        },
      },
      include: {
        barberProfile: {
          select: {
            id: true,
            user: { select: { id: true } },
            bankAccountName: true,
            bankSortCode: true,
            bankAccountNumber: true,
          },
        },
        withdrawalRequests: {
          where: { status: { in: ["REQUESTED", "PROCESSING"] } },
          select: { id: true },
          take: 1,
        },
      },
      take: 200,
    });

    let createdCount = 0;
    let skippedInflight = 0;

    for (const wallet of wallets) {
      if (wallet.withdrawalRequests.length > 0) {
        skippedInflight += 1;
        continue;
      }

      const profile = wallet.barberProfile;
      if (
        !profile.bankAccountName ||
        !profile.bankSortCode ||
        !profile.bankAccountNumber
      ) {
        continue;
      }

      const amountInPence = wallet.availableInPence;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { availableInPence: { decrement: amountInPence } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "PAYOUT",
              amountInPence,
              description: "Weekly auto-payout",
            },
          });
          await tx.withdrawalRequest.create({
            data: {
              walletId: wallet.id,
              amountInPence,
              feeInPence: 0,
              netInPence: amountInPence,
              bankAccountName: profile.bankAccountName!,
              bankSortCode: profile.bankSortCode!,
              bankAccountNumber: profile.bankAccountNumber!,
            },
          });
        });

        createdCount += 1;

        void sendPushToUser(profile.user.id, {
          title: "Weekly payout queued",
          body: `£${(amountInPence / 100).toFixed(2)} is on its way to your bank. Expect it within 2 business days.`,
          data: { type: "withdrawal", status: "REQUESTED" },
        });
      } catch {
        // Skip — next Monday's run will pick this wallet up again.
        continue;
      }
    }

    return jsonResponse({
      eligible: wallets.length,
      created: createdCount,
      skippedInflight,
      at: new Date().toISOString(),
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
