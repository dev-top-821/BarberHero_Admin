import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

// POST /api/v1/bookings/:id/complete
//
// Customer-driven early completion. Lets the customer skip the 24h dispute
// window if they're satisfied: funds are released to the barber's wallet
// immediately, the booking flips to COMPLETED, and the customer is sent to
// the review screen client-side.
//
// Mirrors the wallet/ledger transaction in cron/release-held-payments. The
// only differences are:
//   - no `heldUntil` filter (the customer is choosing to release early)
//   - the actor is the customer, not the cron
//
// Once completed this way, the dispute window is gone — the customer cannot
// later request a refund without going through admin support. Document this
// explicitly in the client confirm dialog.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "CUSTOMER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerId: true,
        barberId: true,
      },
    });
    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }
    if (booking.customerId !== auth.id) {
      return errorResponse("FORBIDDEN", "Not your booking", 403);
    }
    if (booking.status !== "STARTED") {
      return errorResponse(
        "INVALID_STATE",
        `Cannot complete a booking in status ${booking.status}`,
        409
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { bookingId: id },
    });
    if (!payment) {
      return errorResponse("INVALID_STATE", "No payment on this booking", 409);
    }
    if (payment.status !== "PENDING_RELEASE") {
      return errorResponse(
        "INVALID_STATE",
        `Cannot release a payment in status ${payment.status}`,
        409
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Identical to cron/release-held-payments — flip pending → available
      // and write the EARNING + PLATFORM_FEE ledger rows.
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barberId },
        create: {
          barberProfileId: booking.barberId,
          pendingInPence: 0,
          availableInPence: payment.barberAmountInPence,
        },
        update: {
          pendingInPence: { decrement: payment.barberAmountInPence },
          availableInPence: { increment: payment.barberAmountInPence },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "EARNING",
          amountInPence: payment.barberAmountInPence,
          bookingId: booking.id,
          description: "Booking completed by customer — funds released",
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "PLATFORM_FEE",
          amountInPence: payment.platformFeeInPence,
          bookingId: booking.id,
          description: "Platform fee",
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "RELEASED", releasedAt: now },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "COMPLETED" },
      });
    });

    // Push the barber so they see the funds-released notification straight
    // away. Customer doesn't need a push — they triggered the action.
    const barber = await prisma.barberProfile.findUnique({
      where: { id: booking.barberId },
      select: { userId: true },
    });
    if (barber) {
      const pounds = (payment.barberAmountInPence / 100).toFixed(2);
      void sendPushToUser(barber.userId, {
        title: "Funds released",
        body: `£${pounds} is now available in your wallet — customer marked the booking complete.`,
        data: {
          type: "booking_status",
          bookingId: booking.id,
          status: "COMPLETED",
        },
      });
    }

    return jsonResponse({ success: true, status: "COMPLETED" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
