import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendPushToUser } from "@/lib/push";

export type DisputeRefundResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Single source of truth for an admin-approved refund (dispute resolution
 * or a direct admin booking refund).
 *
 * Policy — confirmed by the client in the May-2026 feedback round, and it
 * SUPERSEDES the earlier "8 May: platform forfeits the £4.99 on a full
 * admin refund" note:
 *
 *   • The customer is refunded the SERVICE amount only.
 *   • BarberHero KEEPS the £4.99 platform fee.
 *   • The barber receives £0 for this booking — any wallet credit is
 *     reversed in full.
 *   • The booking moves to a terminal state (CANCELLED) so it leaves the
 *     "Active" tab in both apps. The customer can still leave a review
 *     (see bookings/[id]/review).
 *
 * Before this existed, three call sites (admin actions, the disputes API
 * route, the booking-refund API route) each did their own thing — that
 * divergence is exactly what produced the "barber still shows £3.43
 * pending / partial refund" bug. Every refund path now funnels here.
 */
export async function refundBookingForDispute(opts: {
  bookingId: string;
  adminId: string;
  adminNote?: string;
  // When the refund is triggered from a specific dispute, pass its id so
  // we can drop an audit-log event onto that report's timeline.
  reportId?: string;
}): Promise<DisputeRefundResult> {
  const { bookingId, adminId } = opts;
  const reason =
    opts.adminNote?.trim() || "Refund issued by admin (dispute approved)";

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      barber: { select: { id: true, userId: true } },
    },
  });
  if (!booking) {
    return { ok: false, code: "NOT_FOUND", message: "Booking not found" };
  }
  const payment = booking.payment;
  if (!payment) {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: "No payment on this booking",
    };
  }
  if (payment.status === "REFUNDED") {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: "Payment already refunded",
    };
  }

  // What the customer gets back = the barber's portion. The £4.99 fee
  // (payment.platformFeeInPence) stays with the platform.
  const serviceAmount = payment.barberAmountInPence;
  const feeLabel = `£${(payment.platformFeeInPence / 100).toFixed(2)}`;
  const refundLabel = `£${(serviceAmount / 100).toFixed(2)}`;

  // ── Stripe leg ──
  try {
    if (payment.status === "HELD") {
      // Authorized but not captured. Capture ONLY the £4.99 fee — Stripe
      // auto-releases the rest of the hold, so the customer is charged
      // just the fee, the platform keeps it, and the barber gets nothing.
      // The wallet was never credited for a HELD payment.
      await stripe.paymentIntents.capture(
        payment.stripePaymentIntentId,
        { amount_to_capture: payment.platformFeeInPence },
        { idempotencyKey: `dispute-feecap-${payment.id}` }
      );
    } else if (
      payment.status === "PENDING_RELEASE" ||
      payment.status === "RELEASED"
    ) {
      // Full gross was already captured. Refund the service portion and
      // keep the £4.99 we captured.
      await stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: serviceAmount,
        },
        { idempotencyKey: `dispute-refund-${payment.id}` }
      );
    } else if (payment.status === "DISPUTED") {
      // A card-issuer chargeback already pulled the funds and reversed the
      // wallet via the webhook — nothing left to move at Stripe.
    } else {
      return {
        ok: false,
        code: "INVALID_STATE",
        message: `Cannot refund a payment in status ${payment.status}`,
      };
    }
  } catch {
    return { ok: false, code: "STRIPE_ERROR", message: "Refund failed at Stripe" };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        refundedAt: now,
        refundReason: reason,
        // HELD path captures the fee now; stamp capturedAt so the ledger
        // and Stripe agree.
        ...(payment.status === "HELD" ? { capturedAt: now } : {}),
      },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });

    // Reverse the barber's credit so they net £0. Only PENDING_RELEASE /
    // RELEASED ever touched the wallet (HELD never did; DISPUTED was
    // already reversed by the chargeback webhook).
    if (
      payment.status === "PENDING_RELEASE" ||
      payment.status === "RELEASED"
    ) {
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barber.id },
        create: {
          barberProfileId: booking.barber.id,
          pendingInPence: 0,
          availableInPence: 0,
        },
        update:
          payment.status === "RELEASED"
            ? { availableInPence: { decrement: serviceAmount } }
            : { pendingInPence: { decrement: serviceAmount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND_REVERSAL",
          amountInPence: serviceAmount,
          bookingId: booking.id,
          description: `Refund — ${reason}`,
        },
      });
    }

    // Close this report + any other still-open report on the booking so
    // the admin doesn't have to resolve duplicates.
    await tx.report.updateMany({
      where: {
        bookingId: booking.id,
        status: { in: ["OPEN", "UNDER_REVIEW"] },
      },
      data: {
        status: "RESOLVED_REFUNDED",
        adminNote: reason,
        resolvedById: adminId,
        resolvedAt: now,
        refundedAmountInPence: serviceAmount,
      },
    });
    if (opts.reportId) {
      await tx.reportEvent.create({
        data: {
          reportId: opts.reportId,
          toStatus: "RESOLVED_REFUNDED",
          description: `Service refunded ${refundLabel} — ${feeLabel} platform fee kept`,
          actorId: adminId,
        },
      });
    }
  });

  void sendPushToUser(booking.customerId, {
    title: "Refund issued",
    body: `${refundLabel} has been refunded to your card. The ${feeLabel} service fee is non-refundable.`,
    data: { type: "booking_status", bookingId: booking.id, status: "CANCELLED" },
  });
  void sendPushToUser(booking.barber.userId, {
    title: "Booking refunded",
    body: "A dispute on this booking was approved. The booking has been cancelled.",
    data: { type: "booking_status", bookingId: booking.id, status: "CANCELLED" },
  });

  return { ok: true };
}
