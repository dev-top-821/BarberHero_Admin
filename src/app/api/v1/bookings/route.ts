import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, PLATFORM_FEE_PENCE } from "@/lib/stripe";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";
import { redactPhonesByStatus } from "@/lib/booking-privacy";

// GET /api/v1/bookings — List bookings for current user (customer or barber)
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where =
      auth.role === "CUSTOMER"
        ? { customerId: auth.id }
        : { barber: { userId: auth.id } };

    const bookings = await prisma.booking.findMany({
      where: {
        ...where,
        ...(status && { status: status as never }),
      },
      include: {
        customer: { select: { fullName: true, profilePhoto: true, phone: true } },
        barber: {
          include: {
            user: { select: { fullName: true, profilePhoto: true, phone: true } },
          },
        },
        services: { include: { service: true } },
        verificationCode: auth.role === "CUSTOMER" ? { select: { code: true, isUsed: true } } : false,
      },
      orderBy: { date: "desc" },
    });

    // Phone numbers are hidden from both parties until the barber marks
    // himself on the way (client decision in Docs/M3 — masked calling
    // deferred in favour of a simple visibility gate).
    const redacted = bookings.map(redactPhonesByStatus);

    return jsonResponse({ bookings: redacted });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

// POST /api/v1/bookings — Create a booking (customer only)
// Creates a manual-capture Stripe PaymentIntent so funds are authorized but
// not charged until the barber verifies completion. The client confirms the
// PaymentIntent using the returned client_secret.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "CUSTOMER");
  if (roleErr) return roleErr;

  try {
    const { barberId, serviceIds, date, startTime, address, latitude, longitude } =
      await request.json();

    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true },
    });

    if (services.length === 0) {
      return errorResponse("INVALID_REQUEST", "No valid services selected", 400);
    }

    const serviceTotalInPence = services.reduce((sum, s) => sum + s.priceInPence, 0);
    const chargeInPence = serviceTotalInPence + PLATFORM_FEE_PENCE;

    const booking = await prisma.booking.create({
      data: {
        customerId: auth.id,
        barberId,
        date: new Date(date),
        startTime,
        address,
        latitude,
        longitude,
        totalInPence: serviceTotalInPence,
        services: {
          create: services.map((s) => ({
            serviceId: s.id,
            priceInPence: s.priceInPence,
          })),
        },
      },
      include: {
        services: { include: { service: true } },
        barber: { select: { userId: true } },
        customer: { select: { fullName: true } },
      },
    });

    // Create PaymentIntent with manual capture — funds are authorized on the
    // card but not captured until the barber marks the booking complete.
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: chargeInPence,
        currency: "gbp",
        capture_method: "manual",
        metadata: { bookingId: booking.id, customerId: auth.id },
      });
    } catch {
      // Roll back the booking if Stripe rejects — otherwise we'd have a
      // PENDING booking with no payment intent.
      await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
      return errorResponse("STRIPE_ERROR", "Could not initialise payment", 502);
    }

    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        stripePaymentIntentId: paymentIntent.id,
        amountInPence: chargeInPence,
        platformFeeInPence: PLATFORM_FEE_PENCE,
        barberAmountInPence: serviceTotalInPence,
        status: "HELD",
      },
    });

    void sendPushToUser(booking.barber.userId, {
      title: "New booking request",
      body: `${booking.customer.fullName} requested a booking on ${booking.startTime}.`,
      data: { type: "booking_request", bookingId: booking.id },
    });

    return jsonResponse(
      { booking, stripeClientSecret: paymentIntent.client_secret },
      201
    );
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
