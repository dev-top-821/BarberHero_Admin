import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  authenticateRequest,
  isAuthError,
  requireRole,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

// POST /api/v1/bookings/:id/verify — Enter verification code (barber only)
//
// On success: captures the previously-authorized Stripe PaymentIntent,
// credits the barber's wallet with (amount - platform fee), and flips the
// booking to COMPLETED.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { code } = await request.json();

    const verification = await prisma.verificationCode.findUnique({
      where: { bookingId: id },
    });

    if (!verification) {
      return errorResponse("NOT_FOUND", "Verification code not found", 404);
    }

    if (verification.isUsed) {
      return errorResponse("ALREADY_USED", "Code has already been used");
    }

    if (verification.code !== code) {
      return errorResponse("INVALID_CODE", "Invalid verification code");
    }

    const payment = await prisma.payment.findUnique({
      where: { bookingId: id },
    });

    if (!payment) {
      return errorResponse("INVALID_STATE", "No payment on this booking", 409);
    }

    if (payment.status !== "HELD") {
      return errorResponse(
        "INVALID_STATE",
        `Cannot capture a payment in status ${payment.status}`,
        409
      );
    }

    // Capture the authorized PaymentIntent. If Stripe rejects, abort — we
    // don't want to complete the booking without money in hand.
    try {
      await stripe.paymentIntents.capture(payment.stripePaymentIntentId);
    } catch {
      return errorResponse("STRIPE_ERROR", "Could not capture payment", 502);
    }

    const now = new Date();

    // Use a transaction so verification, booking, payment, wallet and ledger
    // entry all move together — a partial commit would leave the wallet
    // out of sync with the captured funds.
    const [, updatedBooking] = await prisma.$transaction(async (tx) => {
      await tx.verificationCode.update({
        where: { id: verification.id },
        data: { isUsed: true },
      });
      const booking = await tx.booking.update({
        where: { id },
        data: { status: "COMPLETED" },
        select: { customerId: true, barberId: true },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "RELEASED",
          capturedAt: now,
          releasedAt: now,
        },
      });

      // Upsert wallet on first earning, then credit and write ledger.
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barberId },
        create: {
          barberProfileId: booking.barberId,
          balanceInPence: payment.barberAmountInPence,
        },
        update: {
          balanceInPence: { increment: payment.barberAmountInPence },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "EARNING",
          amountInPence: payment.barberAmountInPence,
          bookingId: id,
          description: "Booking completed",
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "PLATFORM_FEE",
          amountInPence: payment.platformFeeInPence,
          bookingId: id,
          description: "Platform fee",
        },
      });

      return [null, booking] as const;
    });

    void sendPushToUser(updatedBooking.customerId, {
      title: "Appointment completed",
      body: "Thanks! Tap to leave a review.",
      data: { type: "booking_status", bookingId: id, status: "COMPLETED" },
    });

    return jsonResponse({ success: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
