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

const GRACE_PERIOD_MS = 30 * 60 * 1000; // 30 minutes after scheduled start.

// POST /api/v1/bookings/:id/no-show
//
// Customer-initiated. Only works when:
//   - booking is still CONFIRMED (barber never entered the arrival code),
//   - the scheduled start time is at least 30 minutes in the past,
//   - payment is still HELD (pre-capture; funds never moved).
//
// Path is symmetrical to the existing /cancel flow but gated on the
// grace period. If the barber DID enter the code, status would be STARTED
// and the customer would use the report → admin-refund path instead.
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
      include: {
        payment: true,
        barber: { select: { userId: true } },
      },
    });
    if (!booking) return errorResponse("NOT_FOUND", "Booking not found", 404);
    if (booking.customerId !== auth.id) {
      return errorResponse("FORBIDDEN", "Not your booking", 403);
    }
    if (booking.status !== "CONFIRMED") {
      return errorResponse(
        "INVALID_STATE",
        "No-show can only be reported on confirmed bookings",
        409
      );
    }

    // Combine booking.date (midnight) with booking.startTime ("HH:mm") to
    // get the actual scheduled moment.
    const [h, m] = booking.startTime.split(":").map(Number);
    const scheduled = new Date(booking.date);
    scheduled.setHours(h, m, 0, 0);
    const earliest = new Date(scheduled.getTime() + GRACE_PERIOD_MS);
    if (Date.now() < earliest.getTime()) {
      return errorResponse(
        "TOO_EARLY",
        "Please wait until 30 minutes after the scheduled start.",
        409
      );
    }

    const payment = booking.payment;
    if (!payment || payment.status !== "HELD") {
      return errorResponse(
        "INVALID_STATE",
        "Payment is no longer in a cancellable state",
        409
      );
    }

    // Cancel the PaymentIntent — pre-capture, so no money has moved.
    try {
      await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
    } catch {
      return errorResponse("STRIPE_ERROR", "Could not release payment", 502);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          refundedAt: now,
          refundReason: "Customer reported no-show",
        },
      });
      await tx.booking.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    });

    void sendPushToUser(booking.barber.userId, {
      title: "Booking cancelled",
      body: "The customer reported no-show. The hold has been released.",
      data: { type: "booking_status", bookingId: id, status: "CANCELLED" },
    });

    return jsonResponse({ success: true, status: "CANCELLED" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
