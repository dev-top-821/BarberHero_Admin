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

const HOLD_DURATION_MS = 24 * 60 * 60 * 1000;

// POST /api/v1/bookings/:id/verify — Barber enters the customer's 4-digit
// arrival code.
//
// Semantics (client spec): code entry is the start-of-service trigger.
//   - Stripe PaymentIntent is captured (funds move to platform balance).
//   - Booking flips PENDING/CONFIRMED → STARTED.
//   - Payment flips HELD → PENDING_RELEASE with heldUntil = now + 24h.
//   - Wallet.pendingInPence += barberAmount (not spendable yet).
//   - A release cron collapses pending → available after 24h.
//   - During that 24h window the customer can file a report + request a
//     refund via /bookings/:id/report; admin resolves it from the disputes
//     panel.
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

    // Capture first — if Stripe fails, we don't want to touch the DB.
    try {
      await stripe.paymentIntents.capture(payment.stripePaymentIntentId);
    } catch {
      return errorResponse("STRIPE_ERROR", "Could not capture payment", 502);
    }

    const now = new Date();
    const heldUntil = new Date(now.getTime() + HOLD_DURATION_MS);

    const [, updatedBooking] = await prisma.$transaction(async (tx) => {
      await tx.verificationCode.update({
        where: { id: verification.id },
        data: { isUsed: true },
      });

      const booking = await tx.booking.update({
        where: { id },
        data: { status: "STARTED" },
        select: { customerId: true, barberId: true },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PENDING_RELEASE",
          capturedAt: now,
          heldUntil,
        },
      });

      // Upsert wallet — first earning creates it on demand.
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barberId },
        create: {
          barberProfileId: booking.barberId,
          pendingInPence: payment.barberAmountInPence,
        },
        update: {
          pendingInPence: { increment: payment.barberAmountInPence },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "PENDING_CREDIT",
          amountInPence: payment.barberAmountInPence,
          bookingId: id,
          description: "Service started — pending release",
        },
      });

      return [null, booking] as const;
    });

    // Get the barber's userId for the push.
    const barber = await prisma.barberProfile.findUnique({
      where: { id: updatedBooking.barberId },
      select: { userId: true },
    });

    const pounds = (payment.barberAmountInPence / 100).toFixed(2);

    if (barber) {
      void sendPushToUser(barber.userId, {
        title: "Service started",
        body: `£${pounds} added to your wallet as pending. It will be released in 24 hours.`,
        data: { type: "booking_status", bookingId: id, status: "STARTED" },
      });
    }
    void sendPushToUser(updatedBooking.customerId, {
      title: "Your appointment has started",
      body: "You can report an issue within 24 hours if anything goes wrong.",
      data: { type: "booking_status", bookingId: id, status: "STARTED" },
    });

    return jsonResponse({
      success: true,
      status: "STARTED",
      heldUntil: heldUntil.toISOString(),
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
