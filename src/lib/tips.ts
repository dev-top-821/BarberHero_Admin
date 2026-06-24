import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

// Settlement helpers for customer tips (see prisma `Tip` model).
//
// A tip is a standalone Stripe PaymentIntent charged after a service is
// completed. Both the client confirm endpoint and the Stripe webhook drive the
// same settlement, so the crediting MUST be idempotent — these helpers use the
// Tip.status flip as the single source of truth for "already paid".

// Idempotently settle a captured tip: flip PENDING → CAPTURED exactly once
// (atomic guard), credit the barber's `available` wallet balance, write a TIP
// ledger row, and push the barber. Whoever wins the status flip (confirm
// endpoint or webhook) does the credit; the loser no-ops — the barber is never
// paid twice. Tips go 100% to the barber (no platform fee) and skip the 24h
// hold (a voluntary gratuity has no service to dispute).
export async function recordCapturedTip(
  stripePaymentIntentId: string
): Promise<void> {
  const tip = await prisma.tip.findUnique({
    where: { stripePaymentIntentId },
    select: {
      id: true,
      status: true,
      amountInPence: true,
      barberProfileId: true,
      bookingId: true,
    },
  });
  if (!tip || tip.status !== "PENDING") return;

  const credited = await prisma.$transaction(async (tx) => {
    const flip = await tx.tip.updateMany({
      where: { id: tip.id, status: "PENDING" },
      data: { status: "CAPTURED", capturedAt: new Date() },
    });
    // Another caller already settled this tip — back off without crediting.
    if (flip.count !== 1) return false;

    const wallet = await tx.wallet.upsert({
      where: { barberProfileId: tip.barberProfileId },
      create: {
        barberProfileId: tip.barberProfileId,
        availableInPence: tip.amountInPence,
      },
      update: {
        availableInPence: { increment: tip.amountInPence },
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "TIP",
        amountInPence: tip.amountInPence,
        bookingId: tip.bookingId,
        description: "Customer tip",
      },
    });
    return true;
  });

  if (!credited) return;

  const barber = await prisma.barberProfile.findUnique({
    where: { id: tip.barberProfileId },
    select: { userId: true },
  });
  if (barber) {
    const pounds = (tip.amountInPence / 100).toFixed(2);
    void sendPushToUser(barber.userId, {
      title: "You received a tip \u{1F389}",
      body: `A customer left you a £${pounds} tip — it's available in your wallet now.`,
      data: { type: "tip", bookingId: tip.bookingId },
    });
  }
}

// Mark a tip's PaymentIntent as failed (card declined / customer abandoned the
// sheet). Only moves a PENDING tip — never disturbs one already CAPTURED.
export async function markTipFailed(
  stripePaymentIntentId: string
): Promise<void> {
  await prisma.tip.updateMany({
    where: { stripePaymentIntentId, status: "PENDING" },
    data: { status: "FAILED" },
  });
}
