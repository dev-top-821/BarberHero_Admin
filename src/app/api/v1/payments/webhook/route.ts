import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

// POST /api/v1/payments/webhook — Stripe webhook handler
// TODO: Full implementation in M3
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return errorResponse("INVALID_REQUEST", "Missing Stripe signature", 400);
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    switch (event.type) {
      case "payment_intent.succeeded":
        // TODO: Handle successful payment
        break;
      case "payment_intent.payment_failed":
        // TODO: Handle failed payment
        break;
      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch {
    return errorResponse("WEBHOOK_ERROR", "Webhook processing failed", 400);
  }
}
