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

// Tip bounds (pence). The floor keeps Stripe's per-transaction fee from eating
// the whole gratuity; the ceiling is a sanity guard against a fat-fingered
// amount. Mirror these in the app's tip sheet.
const MIN_TIP_PENCE = 100; // £1
const MAX_TIP_PENCE = 20000; // £200

// POST /api/v1/bookings/:id/tip — Customer leaves an optional tip after the
// service is completed.
//
// The booking charge is already captured by completion time, so the tip is a
// SEPARATE PaymentIntent with immediate (automatic) capture — there's no
// service left to hold funds against. It's card-only for the same reason the
// booking sheet is (see bookings/route.ts §payment_method_types): forcing the
// method makes the Stripe sheet open straight onto the card form instead of
// hanging on async alternative-method filtering. The customer confirms it with
// the returned client_secret, then calls POST /bookings/:id/tip/confirm; the
// `payment_intent.succeeded` webhook is the backup that credits the barber.
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
    const { amountInPence } = await request.json();

    if (
      typeof amountInPence !== "number" ||
      !Number.isInteger(amountInPence) ||
      amountInPence < MIN_TIP_PENCE ||
      amountInPence > MAX_TIP_PENCE
    ) {
      return errorResponse(
        "INVALID_REQUEST",
        `Tip must be between £${(MIN_TIP_PENCE / 100).toFixed(2)} and £${(
          MAX_TIP_PENCE / 100
        ).toFixed(2)}.`,
        400
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, customerId: true, barberId: true },
    });
    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }
    if (booking.customerId !== auth.id) {
      return errorResponse("FORBIDDEN", "Not your booking", 403);
    }
    // Tipping is a post-service gesture — only once the booking is done.
    if (booking.status !== "COMPLETED") {
      return errorResponse(
        "INVALID_STATE",
        "You can only tip after the service is completed.",
        409
      );
    }

    // One tip per booking. A previous PENDING attempt (declined / abandoned
    // sheet) doesn't block a retry — only a successful CAPTURED tip does.
    const alreadyTipped = await prisma.tip.findFirst({
      where: { bookingId: id, status: "CAPTURED" },
      select: { id: true },
    });
    if (alreadyTipped) {
      return errorResponse(
        "ALREADY_TIPPED",
        "You've already tipped this booking.",
        409
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { email: true },
    });

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInPence,
        currency: "gbp",
        payment_method_types: ["card"],
        // Auto-receipt to the customer once the tip captures (same MVP path as
        // the booking charge — requires "Email customers for successful
        // payments" enabled in the live Stripe dashboard).
        ...(customer?.email ? { receipt_email: customer.email } : {}),
        // `type: "tip"` lets the shared webhook tell a tip PI apart from a
        // booking PI (which has no `type`) and route it to the tip credit.
        metadata: {
          type: "tip",
          bookingId: booking.id,
          customerId: auth.id,
          barberProfileId: booking.barberId,
        },
      });
    } catch {
      return errorResponse(
        "STRIPE_ERROR",
        "Could not initialise the tip payment",
        502
      );
    }

    const tip = await prisma.tip.create({
      data: {
        bookingId: booking.id,
        customerId: auth.id,
        barberProfileId: booking.barberId,
        stripePaymentIntentId: paymentIntent.id,
        amountInPence,
        status: "PENDING",
      },
    });

    return jsonResponse(
      { tipId: tip.id, stripeClientSecret: paymentIntent.client_secret },
      201
    );
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
