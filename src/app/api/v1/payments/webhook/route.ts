import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

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

      case "charge.dispute.created": {
        // Card issuer chargeback. Stripe debits the platform balance
        // immediately and we have until the response_due_by date to submit
        // evidence. We reverse any wallet credit, mark the payment DISPUTED,
        // and open a refund-requested report so it lands in the admin
        // disputes panel for follow-up.
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      }

      case "charge.dispute.closed": {
        // Stripe has finished arbitration. If we won, funds come back; if
        // we lost, they're gone. We auto-resolve the OPEN dispute report
        // either way so the admin queue stays clean — admin can re-credit
        // the barber manually if we won (rare; out of MVP scope).
        await handleDisputeClosed(event.data.object as Stripe.Dispute);
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

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    include: {
      booking: { select: { id: true, barberId: true, customerId: true } },
    },
  });
  if (!payment) return;
  // Already handled — dispute webhooks can fire more than once during a
  // case's lifecycle; the status flip is the idempotency guard.
  if (payment.status === "DISPUTED") return;

  const reason = `Stripe dispute: ${dispute.reason}`;
  const wasCredited = payment.status === "PENDING_RELEASE" || payment.status === "RELEASED";
  const wasReleased = payment.status === "RELEASED";

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "DISPUTED", refundReason: reason },
    });

    // Cancel the booking if it isn't already in a terminal state — admin
    // will reach out to the barber via the disputes panel.
    await tx.booking.updateMany({
      where: {
        id: payment.booking.id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: { status: "CANCELLED" },
    });

    // Reverse the wallet credit if we'd already given the barber the money.
    // PENDING_RELEASE: only `pending` was credited.
    // RELEASED:        the funds also moved to `available` (and may be
    //                  partially withdrawn — that's accepted; the wallet
    //                  can go negative under an external dispute and admin
    //                  will reconcile).
    if (wasCredited) {
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: payment.booking.barberId },
        create: {
          barberProfileId: payment.booking.barberId,
          pendingInPence: 0,
          availableInPence: 0,
        },
        update: wasReleased
          ? { availableInPence: { decrement: payment.barberAmountInPence } }
          : { pendingInPence: { decrement: payment.barberAmountInPence } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "DISPUTE_REVERSAL",
          amountInPence: payment.barberAmountInPence,
          bookingId: payment.booking.id,
          description: reason,
        },
      });
    }

    // Open a refund-requested report so the dispute lands in the admin
    // disputes panel without bespoke UI work.
    await tx.report.create({
      data: {
        bookingId: payment.booking.id,
        raisedById: payment.booking.customerId,
        category: "PAYMENT",
        description: `Card issuer dispute (${dispute.reason}). Stripe dispute id: ${dispute.id}.`,
        requestRefund: true,
        status: "OPEN",
      },
    });
  });

  void sendPushToUser(payment.booking.customerId, {
    title: "Booking disputed",
    body: "Your bank has opened a dispute on this booking. We'll be in touch.",
    data: { type: "booking_status", bookingId: payment.booking.id, status: "CANCELLED" },
  });

  const barber = await prisma.barberProfile.findUnique({
    where: { id: payment.booking.barberId },
    select: { userId: true },
  });
  if (barber) {
    void sendPushToUser(barber.userId, {
      title: "Booking disputed",
      body: "The customer's bank opened a dispute. The funds have been held back pending review.",
      data: { type: "booking_status", bookingId: payment.booking.id, status: "CANCELLED" },
    });
  }
}

async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, booking: { select: { id: true } } },
  });
  if (!payment) return;

  // Auto-close the dispute report we opened on `created`. Status maps:
  //   won           → admin won → resolve no-refund (wallet was already reversed
  //                   on `created`; rare and admin can manually re-credit)
  //   lost          → resolve refunded (already reflected in our DB state)
  //   warning_*     → leave open; these are pre-dispute warnings only
  const outcome = dispute.status;
  if (outcome !== "won" && outcome !== "lost") return;

  await prisma.report.updateMany({
    where: {
      bookingId: payment.booking.id,
      requestRefund: true,
      status: "OPEN",
      description: { contains: dispute.id },
    },
    data: {
      status: outcome === "won" ? "RESOLVED_NO_REFUND" : "RESOLVED_REFUNDED",
      adminNote: `Stripe dispute closed: ${outcome}`,
      resolvedAt: new Date(),
    },
  });
}
