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

// POST /api/v1/admin/bookings/:id/refund
//
// Admin-only. Called from the disputes panel after reviewing a report
// where the customer requested a refund. Handles BOTH phases:
//
//  - HELD           → paymentIntents.cancel (pre-capture; free release).
//  - PENDING_RELEASE → refunds.create       (post-capture, within hold).
//
// On success: rolls back the wallet pending credit (for PENDING_RELEASE),
// marks the payment REFUNDED, closes any open refund-requested reports,
// cancels the booking, and pushes both parties.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { adminNote } = await request.json().catch(() => ({}));

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        payment: true,
        barber: { select: { userId: true, id: true } },
      },
    });
    if (!booking) return errorResponse("NOT_FOUND", "Booking not found", 404);
    const payment = booking.payment;
    if (!payment) {
      return errorResponse("INVALID_STATE", "No payment on this booking", 409);
    }

    const reason = typeof adminNote === "string" && adminNote.trim()
      ? adminNote.trim()
      : "Refund issued by admin";

    if (payment.status === "HELD") {
      // Pre-capture — cancel the intent, which releases the authorisation.
      try {
        await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
      } catch {
        return errorResponse("STRIPE_ERROR", "Could not release payment", 502);
      }
    } else if (payment.status === "PENDING_RELEASE") {
      // Post-capture, within 24h hold — full refund from platform balance.
      try {
        await stripe.refunds.create({
          payment_intent: payment.stripePaymentIntentId,
        });
      } catch {
        return errorResponse("STRIPE_ERROR", "Could not refund payment", 502);
      }
    } else {
      return errorResponse(
        "INVALID_STATE",
        `Cannot refund a payment in status ${payment.status}`,
        409
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUNDED", refundedAt: now, refundReason: reason },
      });

      await tx.booking.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      // Only reverse the wallet pending credit if we actually captured —
      // HELD payments never touched the wallet.
      if (payment.status === "PENDING_RELEASE") {
        const wallet = await tx.wallet.upsert({
          where: { barberProfileId: booking.barber.id },
          create: {
            barberProfileId: booking.barber.id,
            pendingInPence: 0,
            availableInPence: 0,
          },
          update: {
            pendingInPence: { decrement: payment.barberAmountInPence },
          },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND_REVERSAL",
            amountInPence: payment.barberAmountInPence,
            bookingId: id,
            description: `Refund — ${reason}`,
          },
        });
      }

      // Close any open refund-requested reports for this booking.
      await tx.report.updateMany({
        where: {
          bookingId: id,
          requestRefund: true,
          status: "OPEN",
        },
        data: {
          status: "RESOLVED_REFUNDED",
          adminNote: reason,
          resolvedById: auth.id,
          resolvedAt: now,
        },
      });
    });

    void sendPushToUser(booking.customerId, {
      title: "Refund issued",
      body: "Your refund has been processed. It should appear on your card within a few days.",
      data: { type: "booking_status", bookingId: id, status: "CANCELLED" },
    });
    void sendPushToUser(booking.barber.userId, {
      title: "Booking refunded",
      body: "The customer's dispute was resolved with a refund.",
      data: { type: "booking_status", bookingId: id, status: "CANCELLED" },
    });

    return jsonResponse({ success: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
