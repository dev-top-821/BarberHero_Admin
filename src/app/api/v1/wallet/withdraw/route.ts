import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

// TODO: Full implementation in M3 — actual bank transfer via Stripe
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { amountInPence } = await request.json();

    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { wallet: true },
    });

    if (!profile?.wallet) {
      return errorResponse("NOT_FOUND", "Wallet not found", 404);
    }

    if (amountInPence > profile.wallet.balanceInPence) {
      return errorResponse("INSUFFICIENT_FUNDS", "Insufficient wallet balance");
    }

    const feeInPence = 150; // £1.50 withdrawal fee
    const netAmount = amountInPence - feeInPence;

    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: profile.wallet.id },
        data: { balanceInPence: { decrement: amountInPence } },
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
      newBalanceInPence: profile.wallet.balanceInPence - amountInPence,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
