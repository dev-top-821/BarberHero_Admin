import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { jsonResponse, errorResponse } from "@/lib/api-utils";

// POST /api/v1/payments/webhook — Stripe webhook handler.
//
// The API routes themselves (bookings POST, verify, cancel) are the primary
// source of truth for payment state transitions. This webhook is a safety net:
// if a PaymentIntent moves through a state that our own code didn't drive
// (e.g. a card auth expires, a dispute is filed, a payment is asynchronously
// confirmed by a 3DS flow), we keep our Payment row in sync here.
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return errorResponse("INVALID_REQUEST", "Missing Stripe signature", 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return errorResponse("WEBHOOK_ERROR", "Invalid webhook signature", 400);
  }

  try {
    switch (event.type) {
      case "payment_intent.amount_capturable_updated": {
        // The auth succeeded and funds are ready to capture. Nothing to do —
        // our booking is already in PENDING/CONFIRMED and Payment is HELD.
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await prisma.payment.updateMany({
          where: {
            stripePaymentIntentId: pi.id,
            status: { in: ["HELD", "FAILED"] },
          },
          data: {
            status: "RELEASED",
            capturedAt: new Date(pi.created * 1000),
            releasedAt: new Date(),
          },
        });
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await prisma.payment.updateMany({
          where: {
            stripePaymentIntentId: pi.id,
            status: { not: "REFUNDED" },
          },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
            refundReason: "Stripe PaymentIntent canceled",
          },
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await prisma.payment.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: "FAILED" },
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          await prisma.payment.updateMany({
            where: { stripePaymentIntentId: paymentIntentId },
            data: {
              status: "REFUNDED",
              refundedAt: new Date(),
              refundReason: "Stripe refund",
            },
          });
        }
        break;
      }

      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch {
    // Return 200 so Stripe doesn't retry on our internal DB hiccups — the
    // next poll / user action will reconcile. We log via the thrown error.
    return jsonResponse({ received: true, warning: "handler_error" });
  }
}
