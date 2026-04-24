import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

const MIN_WITHDRAWAL_PENCE = 1000; // £10
const WITHDRAWAL_FEE_PENCE = 0;    // Free at MVP — platform absorbs bank cost.

// POST /api/v1/wallet/withdraw
//
// Tier-B manual-payout flow. Creates a WithdrawalRequest row and debits
// the wallet's `available` bucket. Admin later marks it paid (or failed)
// from the disputes panel.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { amountInPence } = await request.json();
    if (typeof amountInPence !== "number" || !Number.isInteger(amountInPence)) {
      return errorResponse("INVALID_INPUT", "amountInPence must be an integer");
    }
    if (amountInPence < MIN_WITHDRAWAL_PENCE) {
      return errorResponse(
        "AMOUNT_TOO_LOW",
        `Minimum withdrawal is £${(MIN_WITHDRAWAL_PENCE / 100).toFixed(2)}`
      );
    }

    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: {
        bankAccountName: true,
        bankSortCode: true,
        bankAccountNumber: true,
        wallet: true,
      },
    });
    if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    if (!profile.wallet) return errorResponse("NOT_FOUND", "Wallet not found", 404);

    if (!profile.bankAccountName || !profile.bankSortCode || !profile.bankAccountNumber) {
      return errorResponse(
        "BANK_DETAILS_MISSING",
        "Add your bank details before requesting a withdrawal",
        409
      );
    }

    if (amountInPence > profile.wallet.availableInPence) {
      return errorResponse("INSUFFICIENT_FUNDS", "Insufficient available balance");
    }

    // One request at a time — stops a barber queuing up multiple withdrawals
    // before the admin has processed the first.
    const inflight = await prisma.withdrawalRequest.findFirst({
      where: {
        walletId: profile.wallet.id,
        status: { in: ["REQUESTED", "PROCESSING"] },
      },
      select: { id: true },
    });
    if (inflight) {
      return errorResponse(
        "WITHDRAWAL_IN_PROGRESS",
        "You already have a withdrawal in progress",
        409
      );
    }

    const feeInPence = WITHDRAWAL_FEE_PENCE;
    const netInPence = amountInPence - feeInPence;
    if (netInPence <= 0) {
      return errorResponse(
        "AMOUNT_TOO_LOW",
        `Minimum withdrawal is £${((feeInPence + 100) / 100).toFixed(2)}`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: profile.wallet!.id },
        data: { availableInPence: { decrement: amountInPence } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: profile.wallet!.id,
          type: "INSTANT_WITHDRAWAL",
          amountInPence: netInPence,
          description: "Withdrawal requested",
        },
      });
      if (feeInPence > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: profile.wallet!.id,
            type: "WITHDRAWAL_FEE",
            amountInPence: feeInPence,
            description: "Withdrawal fee",
          },
        });
      }
      return tx.withdrawalRequest.create({
        data: {
          walletId: profile.wallet!.id,
          amountInPence,
          feeInPence,
          netInPence,
          bankAccountName: profile.bankAccountName!,
          bankSortCode: profile.bankSortCode!,
          bankAccountNumber: profile.bankAccountNumber!,
        },
      });
    });

    return jsonResponse({ withdrawal: result }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
