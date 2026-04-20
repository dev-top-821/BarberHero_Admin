import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        status: true,
        customerId: true,
        barber: { select: { userId: true } },
        payment: true,
      },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    // Only customer or barber of this booking can cancel
    const isCustomer = booking.customerId === auth.id;
    const isBarber = booking.barber.userId === auth.id;
    if (!isCustomer && !isBarber) {
      return errorResponse("FORBIDDEN", "You cannot cancel this booking", 403);
    }

    const cancellable = ["PENDING", "CONFIRMED"];
    if (!cancellable.includes(booking.status)) {
      return errorResponse("INVALID_STATUS", "This booking cannot be cancelled");
    }

    // Release the Stripe hold. Before capture, cancelling the PaymentIntent
    // is free and releases the authorization immediately. After capture a
    // refund would be required — but cancellable states (PENDING/CONFIRMED)
    // precede capture, so we only need the cancel path here.
    const payment = booking.payment;
    if (payment && payment.status === "HELD") {
      try {
        await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
      } catch {
        return errorResponse("STRIPE_ERROR", "Could not release payment hold", 502);
      }
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          refundedAt: new Date(),
          refundReason: isCustomer ? "Cancelled by customer" : "Cancelled by barber",
        },
      });
    }

    await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    const otherUserId = isCustomer ? booking.barber.userId : booking.customerId;
    void sendPushToUser(otherUserId, {
      title: "Booking cancelled",
      body: isCustomer
        ? "The customer cancelled this booking."
        : "The barber cancelled this booking.",
      data: { type: "booking_status", bookingId: id, status: "CANCELLED" },
    });

    return jsonResponse({ message: "Booking cancelled" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
