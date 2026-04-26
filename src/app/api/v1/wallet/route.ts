import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { MIN_WITHDRAWAL_PENCE, WITHDRAWAL_FEE_PENCE } from "@/lib/wallet";

// Returns the next Monday at 09:00 UTC strictly after `now`. Matches the
// schedule of /api/v1/cron/weekly-payouts so the wallet UI can show an
// accurate "Next auto-payout" line.
function nextWeeklyPayoutAt(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(9, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Sun … 1 Mon … 6 Sat
  let daysUntilMonday = (1 - day + 7) % 7;
  if (daysUntilMonday === 0 && now.getTime() >= d.getTime()) {
    daysUntilMonday = 7;
  }
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { barberProfileId: profile.id },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
        withdrawalRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            amountInPence: true,
            feeInPence: true,
            netInPence: true,
            status: true,
            bankReference: true,
            createdAt: true,
            processedAt: true,
          },
        },
      },
    });

    return jsonResponse({
      wallet,
      nextAutoPayoutAt: nextWeeklyPayoutAt(new Date()).toISOString(),
      withdrawalFeeInPence: WITHDRAWAL_FEE_PENCE,
      minWithdrawalInPence: MIN_WITHDRAWAL_PENCE,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
