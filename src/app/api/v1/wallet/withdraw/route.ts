import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

// TODO (M3+): plug into Stripe Connect / real bank transfer. For now this
// just debits the ledger — payout is processed off-app by admin.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { amountInPence } = await request.json();

    if (typeof amountInPence !== "number" || amountInPence <= 0) {
      return errorResponse("INVALID_INPUT", "Amount must be positive");
    }

    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { wallet: true },
    });
    if (!profile?.wallet) {
      return errorResponse("NOT_FOUND", "Wallet not found", 404);
    }

    // Only available funds can be withdrawn — pending funds are still in
    // the 24h release hold.
    if (amountInPence > profile.wallet.availableInPence) {
      return errorResponse("INSUFFICIENT_FUNDS", "Insufficient available balance");
    }

    const feeInPence = 150; // £1.50 withdrawal fee
    const netAmount = amountInPence - feeInPence;
    if (netAmount <= 0) {
      return errorResponse(
        "AMOUNT_TOO_LOW",
        `Minimum withdrawal is £${((feeInPence + 1) / 100).toFixed(2)}`
      );
    }

    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: profile.wallet.id },
        data: { availableInPence: { decrement: amountInPence } },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: profile.wallet.id,
          type: "INSTANT_WITHDRAWAL",
          amountInPence: netAmount,
          description: "Instant withdrawal",
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: profile.wallet.id,
          type: "WITHDRAWAL_FEE",
          amountInPence: feeInPence,
          description: "Withdrawal fee",
        },
      }),
    ]);

    return jsonResponse({
      success: true,
      feeInPence,
      newAvailableInPence: profile.wallet.availableInPence - amountInPence,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
