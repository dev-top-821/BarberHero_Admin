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

// POST /api/v1/bookings/:id/confirm-payment — customer-only.
//
// Called by the customer app immediately after the Stripe PaymentSheet
// succeeds. It verifies with Stripe that the manual-capture hold is
// actually in place (PaymentIntent → requires_capture), then promotes the
// Payment FAILED → HELD and notifies the barber. THIS is the moment the
// barber first learns about / can act on the booking (signed flow §5.4).
//
// The `payment_intent.amount_capturable_updated` webhook does the same
// thing as a backup if this call is lost. Both share the FAILED→HELD
// updateMany so the barber is pushed exactly once.
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
        customerId: true,
        startTime: true,
        customer: { select: { fullName: true } },
        barber: { select: { userId: true } },
        payment: {
          select: { id: true, status: true, stripePaymentIntentId: true },
        },
      },
    });
    if (!booking) return errorResponse("NOT_FOUND", "Booking not found", 404);
    if (booking.customerId !== auth.id) {
      return errorResponse("FORBIDDEN", "Not your booking", 403);
    }
    const payment = booking.payment;
    if (!payment) {
      return errorResponse("INVALID_STATE", "No payment on this booking", 409);
    }

    // Already past the pre-auth marker — idempotent success for the
    // good states; reject the terminal ones.
    if (payment.status !== "FAILED") {
      if (
        payment.status === "HELD" ||
        payment.status === "PENDING_RELEASE" ||
        payment.status === "RELEASED"
      ) {
        return jsonResponse({ authorized: true });
      }
      return errorResponse(
        "INVALID_STATE",
        `Payment is ${payment.status}`,
        409
      );
    }

    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    } catch {
      return errorResponse("STRIPE_ERROR", "Could not verify payment", 502);
    }

    if (pi.status !== "requires_capture") {
      // Card not authorized yet (e.g. still requires_action / failed).
      // Leave the booking hidden from the barber; the client can retry.
      return jsonResponse({ authorized: false, paymentIntentStatus: pi.status });
    }

    // Authorized. Promote FAILED → HELD; the winner of this transition
    // (this call or the webhook) is the one that pushes the barber.
    const promoted = await prisma.payment.updateMany({
      where: { id: payment.id, status: "FAILED" },
      data: { status: "HELD" },
    });

    if (promoted.count === 1) {
      void sendPushToUser(booking.barber.userId, {
        title: "New booking request",
        body: `${booking.customer.fullName} requested a booking on ${booking.startTime}.`,
        data: { type: "booking_request", bookingId: id },
      });
    }

    return jsonResponse({ authorized: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
