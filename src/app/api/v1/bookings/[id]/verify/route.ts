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

    // Stripe — not our local Payment.status — is the source of truth for
    // whether the hold can be captured. A stray/late webhook can drift
    // the mirror (e.g. to FAILED), which is exactly what produced the
    // "Cannot capture a payment in status Failed" error while Stripe
    // still showed "authorised, not captured". Decide from the live
    // PaymentIntent instead.
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    } catch {
      return errorResponse(
        "STRIPE_ERROR",
        "Could not verify the payment with Stripe",
        502
      );
    }

    if (payment.status === "REFUNDED" || payment.status === "DISPUTED") {
      return errorResponse(
        "INVALID_STATE",
        `This booking's payment is ${payment.status.toLowerCase()} and cannot be captured.`,
        409
      );
    }

    if (pi.status === "requires_capture") {
      try {
        await stripe.paymentIntents.capture(
          payment.stripePaymentIntentId,
          undefined,
          { idempotencyKey: `pi-capture-${payment.id}` }
        );
      } catch {
        return errorResponse("STRIPE_ERROR", "Could not capture payment", 502);
      }
    } else if (pi.status === "succeeded") {
      // Already captured at Stripe (an earlier attempt captured but our
      // DB write was lost). Don't capture again — fall through and
      // reconcile our records.
    } else {
      return errorResponse(
        "PAYMENT_NOT_AUTHORIZED",
        `The customer's payment is not authorised (status: ${pi.status}). Ask them to complete the payment again before entering the code.`,
        409
      );
    }

    // Guard against double-crediting if a previous run already moved the
    // wallet (would only happen under webhook/DB drift — the used-code
    // check above blocks the normal repeat).
    const alreadyCredited =
      payment.status === "PENDING_RELEASE" || payment.status === "RELEASED";

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

      // Don't downgrade an already-RELEASED payment, and only move the
      // wallet once.
      if (!alreadyCredited) {
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
      }

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
