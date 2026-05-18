import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, PLATFORM_FEE_PENCE, MIN_BOOKING_PENCE } from "@/lib/stripe";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { redactPhonesByStatus } from "@/lib/booking-privacy";
import { toPublicPhotoUrl } from "@/lib/storage";
import { TERMS_VERSION } from "@/lib/legal";
import {
  ACTIVE_BOOKING_STATUSES,
  dateOnlyToUTCStartOfDay,
  dayOfWeekFromUTCDate,
  hhmmToMinutes,
  intervalsOverlap,
  isValidHHmm,
  minutesToHHmm,
} from "@/lib/calendar";

// GET /api/v1/bookings — List bookings for current user (customer or barber)
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // The barber must never see a booking whose card hasn't been
    // authorized yet (signed flow §5.4: customer pays first). A freshly
    // created booking's Payment is FAILED until the hold is confirmed,
    // so gate the barber's list on the payment being past that marker.
    // The customer always sees their own bookings regardless of payment
    // state so they can complete or retry the payment.
    const where =
      auth.role === "CUSTOMER"
        ? { customerId: auth.id }
        : {
            barber: { userId: auth.id },
            payment: { is: { status: { not: "FAILED" as const } } },
          };

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

    // Resolve photo hosts fresh so booking cards show the other party's
    // photo instead of a placeholder initial.
    const withPhotos = redacted.map((b) => ({
      ...b,
      customer: {
        ...b.customer,
        profilePhoto: toPublicPhotoUrl(b.customer.profilePhoto, request),
      },
      barber: {
        ...b.barber,
        user: {
          ...b.barber.user,
          profilePhoto: toPublicPhotoUrl(b.barber.user.profilePhoto, request),
        },
      },
    }));

    return jsonResponse({ bookings: withPhotos });
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

    if (typeof date !== "string" || typeof startTime !== "string" || !isValidHHmm(startTime)) {
      return errorResponse("INVALID_REQUEST", "date (YYYY-MM-DD) and startTime (HH:mm) are required", 400);
    }
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return errorResponse("INVALID_REQUEST", "serviceIds must be a non-empty array", 400);
    }

    let dateUTC: Date;
    try {
      dateUTC = dateOnlyToUTCStartOfDay(date);
    } catch {
      return errorResponse("INVALID_REQUEST", "date must be in YYYY-MM-DD format", 400);
    }

    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, barberProfileId: barberId, isActive: true },
    });

    if (services.length !== serviceIds.length) {
      return errorResponse("INVALID_REQUEST", "One or more services were not found for this barber", 400);
    }

    const durationMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    const startMinutes = hhmmToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;
    const endTime = minutesToHHmm(endMinutes);

    // Validate the slot still fits inside the barber's availability for that
    // date — protects against a stale UI submitting a slot that has since
    // been closed via an exception or moved by the barber.
    const dayOfWeek = dayOfWeekFromUTCDate(dateUTC);
    const [weekly, exception, settings] = await Promise.all([
      prisma.availabilitySlot.findFirst({
        where: { barberProfileId: barberId, dayOfWeek, isActive: true },
        select: { startTime: true, endTime: true },
      }),
      prisma.availabilityException.findUnique({
        where: { barberProfileId_date: { barberProfileId: barberId, date: dateUTC } },
        select: { isClosed: true, startTime: true, endTime: true },
      }),
      prisma.barberSettings.findUnique({
        where: { barberProfileId: barberId },
        select: { minBookingNoticeHours: true },
      }),
    ]);

    if (exception?.isClosed) {
      return errorResponse("SLOT_UNAVAILABLE", "Barber is closed on this date", 409);
    }

    const windowStart = !exception?.isClosed && exception?.startTime ? exception.startTime : weekly?.startTime;
    const windowEnd = !exception?.isClosed && exception?.endTime ? exception.endTime : weekly?.endTime;

    if (!windowStart || !windowEnd) {
      return errorResponse("SLOT_UNAVAILABLE", "Barber has no availability on this date", 409);
    }
    if (
      startMinutes < hhmmToMinutes(windowStart) ||
      endMinutes > hhmmToMinutes(windowEnd)
    ) {
      return errorResponse("SLOT_UNAVAILABLE", "Selected time falls outside the barber's hours", 409);
    }

    // Minimum booking notice.
    const minNoticeMs = (settings?.minBookingNoticeHours ?? 2) * 60 * 60 * 1000;
    const slotStartUtcMs = dateUTC.getTime() + startMinutes * 60_000;
    if (slotStartUtcMs - Date.now() < minNoticeMs) {
      return errorResponse("SLOT_UNAVAILABLE", "Slot is inside the barber's minimum booking notice", 409);
    }

    // Duration-aware conflict check against live bookings.
    const dayStart = new Date(dateUTC);
    const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000);
    const sameDayBookings = await prisma.booking.findMany({
      where: {
        barberId,
        date: { gte: dayStart, lt: dayEnd },
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
      select: { startTime: true, endTime: true },
    });

    const conflict = sameDayBookings.some((b) =>
      isValidHHmm(b.startTime) &&
      isValidHHmm(b.endTime) &&
      intervalsOverlap(startMinutes, endMinutes, hhmmToMinutes(b.startTime), hhmmToMinutes(b.endTime))
    );
    if (conflict) {
      return errorResponse("SLOT_UNAVAILABLE", "Selected time overlaps an existing booking", 409);
    }

    const serviceTotalInPence = services.reduce((sum, s) => sum + s.priceInPence, 0);
    if (serviceTotalInPence < MIN_BOOKING_PENCE) {
      return errorResponse(
        "BELOW_MINIMUM",
        `Booking total must be at least £${(MIN_BOOKING_PENCE / 100).toFixed(2)}`,
        400
      );
    }
    const chargeInPence = serviceTotalInPence + PLATFORM_FEE_PENCE;

    const customer = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { email: true, termsAcceptedAt: true, termsVersion: true },
    });

    // Terms & Conditions + Privacy Policy must be accepted at the current
    // version before a booking/payment can be created (client request,
    // May-2026 — legal/security before go-live). The app collects this on
    // the payment screen; this is the server-side enforcement.
    if (
      !customer?.termsAcceptedAt ||
      customer.termsVersion !== TERMS_VERSION
    ) {
      return errorResponse(
        "TERMS_NOT_ACCEPTED",
        "Please accept the Terms & Conditions and Privacy Policy to continue.",
        403
      );
    }

    const booking = await prisma.booking.create({
      data: {
        customerId: auth.id,
        barberId,
        date: dateUTC,
        startTime,
        endTime,
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
    //
    // payment_method_types: ["card"] is intentional. With manual capture +
    // no explicit types, Stripe auto-includes whatever's enabled in the
    // dashboard (Amazon Pay, Revolut Pay, etc.) and then filters out the
    // ones that don't support manual capture *at PaymentSheet load time*.
    // That async filter caused the sheet to hang showing alternative-
    // method icons while the card form never rendered. Forcing card-only
    // makes the sheet open instantly with the card input, and matches the
    // app's hold-funds business model (only cards reliably support manual
    // capture for the 24h hold window).
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: chargeInPence,
          currency: "gbp",
          capture_method: "manual",
          payment_method_types: ["card"],
          // Stripe sends an auto-receipt to this address once the charge is
          // captured. Per client decision 8 May 2026 — auto-receipts (not
          // custom branded PDFs) are the MVP path. Requires "Email customers
          // for successful payments" to be enabled in the live Stripe
          // dashboard (Settings → Customer emails).
          ...(customer?.email ? { receipt_email: customer.email } : {}),
          metadata: { bookingId: booking.id, customerId: auth.id },
        },
        // Booking id is unique per call — protects against double-charging if
        // the client retries POST /bookings on a flaky network.
        { idempotencyKey: `booking-create-${booking.id}` }
      );
    } catch {
      // Roll back the booking if Stripe rejects — otherwise we'd have a
      // PENDING booking with no payment intent.
      await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
      return errorResponse("STRIPE_ERROR", "Could not initialise payment", 502);
    }

    // IMPORTANT (signed flow §5.4): the customer "books AND pays" BEFORE
    // the barber sees the request. The PaymentIntent above is only
    // *created* here — the card isn't authorized until the client
    // confirms it via the returned client_secret.
    //
    // So the Payment starts as FAILED, meaning "awaiting card
    // authorization / not a usable payment yet". It is promoted to HELD
    // only once Stripe confirms the manual-capture hold is in place —
    // driven by POST /bookings/:id/confirm-payment (fast path) and the
    // `payment_intent.amount_capturable_updated` webhook (backup). The
    // barber is notified, and the booking becomes visible to them, at
    // that moment — never before. (Reusing the existing FAILED enum
    // value keeps this a no-migration change; nothing auto-acts on a
    // FAILED manual-capture PI before it is authorized.)
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        stripePaymentIntentId: paymentIntent.id,
        amountInPence: chargeInPence,
        platformFeeInPence: PLATFORM_FEE_PENCE,
        barberAmountInPence: serviceTotalInPence,
        status: "FAILED",
      },
    });

    return jsonResponse(
      { booking, stripeClientSecret: paymentIntent.client_secret },
      201
    );
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
