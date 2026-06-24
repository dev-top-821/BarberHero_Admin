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
import { recordCapturedTip } from "@/lib/tips";

// POST /api/v1/bookings/:id/tip/confirm — Customer calls this right after the
// Stripe sheet succeeds for a tip. Verifies the PaymentIntent actually captured
// (Stripe is the source of truth, not the client's word), then credits the
// barber. This is the fast path; the `payment_intent.succeeded` webhook settles
// the same tip as a backup, and recordCapturedTip is idempotent so the two
// never double-pay.
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
    const { tipId } = await request.json();
    if (typeof tipId !== "string") {
      return errorResponse("INVALID_REQUEST", "tipId is required", 400);
    }

    const tip = await prisma.tip.findUnique({
      where: { id: tipId },
      select: {
        id: true,
        bookingId: true,
        customerId: true,
        status: true,
        stripePaymentIntentId: true,
      },
    });
    if (!tip || tip.bookingId !== id) {
      return errorResponse("NOT_FOUND", "Tip not found", 404);
    }
    if (tip.customerId !== auth.id) {
      return errorResponse("FORBIDDEN", "Not your tip", 403);
    }
    // Already settled (e.g. the webhook beat us here) — nothing to do.
    if (tip.status === "CAPTURED") {
      return jsonResponse({ success: true, status: "CAPTURED" });
    }

    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(tip.stripePaymentIntentId);
    } catch {
      return errorResponse(
        "STRIPE_ERROR",
        "Could not verify the tip with Stripe",
        502
      );
    }

    if (pi.status !== "succeeded") {
      return errorResponse(
        "PAYMENT_NOT_COMPLETE",
        `The tip payment is not complete (status: ${pi.status}).`,
        409
      );
    }

    await recordCapturedTip(tip.stripePaymentIntentId);
    return jsonResponse({ success: true, status: "CAPTURED" });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
