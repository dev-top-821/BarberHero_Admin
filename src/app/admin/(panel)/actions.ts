"use server";

import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendPushToUser } from "@/lib/push";
import { revalidatePath } from "next/cache";

const MIN_REJECT_REASON_CHARS = 10;

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) throw new Error("Unauthorized");
  const payload = verifyAccessToken(token);
  if (payload.role !== "ADMIN") throw new Error("Forbidden");
  return payload;
}

export async function toggleBarberBlock(barberId: string, currentStatus: string) {
  await requireAdmin();
  const newStatus = currentStatus === "BLOCKED" ? "APPROVED" : "BLOCKED";
  await prisma.barberProfile.update({
    where: { id: barberId },
    data: { status: newStatus },
  });
  revalidatePath("/admin/barbers");
  revalidatePath(`/admin/barbers/${barberId}`);
}

export async function approveBarber(barberId: string) {
  await requireAdmin();
  const barber = await prisma.barberProfile.update({
    where: { id: barberId },
    data: { status: "APPROVED", rejectionReason: null },
    include: { user: { select: { id: true } } },
  });
  void sendPushToUser(barber.user.id, {
    title: "You're approved!",
    body: "Your barber application has been approved. You can now start accepting bookings.",
    data: { type: "application_status", status: "APPROVED" },
  });
  revalidatePath("/admin/barbers");
  revalidatePath(`/admin/barbers/${barberId}`);
}

export async function rejectBarber(barberId: string, reason: string) {
  await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < MIN_REJECT_REASON_CHARS) {
    throw new Error(
      `Please provide a rejection reason of at least ${MIN_REJECT_REASON_CHARS} characters.`
    );
  }
  const barber = await prisma.barberProfile.update({
    where: { id: barberId },
    data: { status: "REJECTED", rejectionReason: trimmed },
    include: { user: { select: { id: true } } },
  });
  void sendPushToUser(barber.user.id, {
    title: "Application update",
    body: "Your application was not approved. Open the app for details.",
    data: { type: "application_status", status: "REJECTED" },
  });
  revalidatePath("/admin/barbers");
  revalidatePath(`/admin/barbers/${barberId}`);
}

export async function resolveDispute(
  reportId: string,
  action: "UNDER_REVIEW" | "RESOLVE_REFUND" | "RESOLVE_NO_REFUND" | "REJECT",
  adminNote?: string,
  // Optional partial refund — pence. Falls back to the full booking
  // total when omitted. Ignored unless action === "RESOLVE_REFUND".
  refundAmountInPence?: number,
) {
  const admin = await requireAdmin();

  // Refund path: issue Stripe refund / cancel, reverse the wallet pending
  // credit (if applicable), close the booking, push both parties.
  if (action === "RESOLVE_REFUND") {
    await issueRefundForReport(reportId, admin.sub, adminNote, refundAmountInPence);
    revalidatePath("/admin/disputes");
    revalidatePath(`/admin/disputes/${reportId}`);
    return;
  }

  const statusMap = {
    UNDER_REVIEW: "UNDER_REVIEW",
    RESOLVE_NO_REFUND: "RESOLVED_NO_REFUND",
    REJECT: "REJECTED",
  } as const;

  const newStatus = statusMap[action];

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reportId },
      data: {
        status: newStatus,
        adminNote: adminNote || undefined,
        resolvedById: action === "UNDER_REVIEW" ? null : admin.sub,
        resolvedAt: action === "UNDER_REVIEW" ? null : new Date(),
      },
    });
    await tx.reportEvent.create({
      data: {
        reportId,
        toStatus: newStatus,
        description:
          action === "UNDER_REVIEW"
            ? "Marked under review"
            : action === "RESOLVE_NO_REFUND"
            ? "Resolved without refund"
            : "Dispute rejected",
        actorId: admin.sub,
      },
    });
  });

  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${reportId}`);
}

// Block / unblock a barber straight from the dispute detail page so the
// admin doesn't have to navigate away mid-investigation. Mirrors the
// existing toggleBarberBlock contract but keyed by reportId so the page
// doesn't have to know the barber's profile id.
export async function blockBarberFromReport(reportId: string) {
  const admin = await requireAdmin();
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      booking: {
        select: { barber: { select: { id: true, status: true } } },
      },
    },
  });
  if (!report) throw new Error("Report not found");

  const current = report.booking.barber.status;
  const newStatus = current === "BLOCKED" ? "APPROVED" : "BLOCKED";
  await prisma.barberProfile.update({
    where: { id: report.booking.barber.id },
    data: { status: newStatus },
  });

  await prisma.reportEvent.create({
    data: {
      reportId,
      description: newStatus === "BLOCKED" ? "Barber blocked from dispute" : "Barber unblocked from dispute",
      actorId: admin.sub,
    },
  });

  revalidatePath("/admin/barbers");
  revalidatePath(`/admin/disputes/${reportId}`);
}

async function issueRefundForReport(
  reportId: string,
  adminId: string,
  adminNote: string | undefined,
  refundAmountInPence: number | undefined
) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      booking: {
        include: {
          payment: true,
          barber: { select: { id: true, userId: true } },
        },
      },
    },
  });
  if (!report) throw new Error("Report not found");

  const booking = report.booking;
  const payment = booking.payment;
  if (!payment) throw new Error("No payment on this booking");

  const reason = adminNote?.trim() || "Refund issued by admin";

  // Resolve the refund amount. Default = full booking total. Bound to
  // [1p, payment.amountInPence]. Pre-capture (HELD) refunds are
  // always full because Stripe cancel doesn't take a partial amount.
  const requested = refundAmountInPence ?? payment.amountInPence;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error("Refund amount must be a positive whole number of pence.");
  }
  if (requested > payment.amountInPence) {
    throw new Error("Refund amount cannot exceed the booking total.");
  }
  const isPartial = requested < payment.amountInPence;
  if (isPartial && payment.status === "HELD") {
    throw new Error(
      "Partial refunds aren't supported on uncaptured payments — capture first or refund in full."
    );
  }

  // Per-pence share that came out of the barber's portion vs the
  // platform fee. Proportional split keeps the wallet ledger honest on
  // partial refunds: a £15 refund on a £30 booking returns £15 × (barber/total)
  // from pending and £15 × (fee/total) from the fee bucket.
  const barberShare = Math.round(
    (requested * payment.barberAmountInPence) / payment.amountInPence
  );

  if (payment.status === "HELD") {
    // Pre-capture — free release of the hold (full refund only).
    await stripe.paymentIntents.cancel(
      payment.stripePaymentIntentId,
      undefined,
      { idempotencyKey: `pi-cancel-${payment.id}` }
    );
  } else if (payment.status === "PENDING_RELEASE") {
    await stripe.refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount: isPartial ? requested : undefined,
      },
      {
        idempotencyKey: isPartial
          ? `pi-refund-${payment.id}-${requested}`
          : `pi-refund-${payment.id}`,
      }
    );
  } else {
    throw new Error(`Cannot refund a payment in status ${payment.status}`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // On partial refund the booking stays open — only mark CANCELLED on
    // a full refund.
    await tx.payment.update({
      where: { id: payment.id },
      data: isPartial
        ? { refundReason: reason }
        : { status: "REFUNDED", refundedAt: now, refundReason: reason },
    });

    if (!isPartial) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED" },
      });
    }

    // Only reverse wallet if we'd actually credited pending — HELD payments
    // never touched the wallet.
    if (payment.status === "PENDING_RELEASE" && barberShare > 0) {
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barber.id },
        create: {
          barberProfileId: booking.barber.id,
          pendingInPence: 0,
          availableInPence: 0,
        },
        update: {
          pendingInPence: { decrement: barberShare },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND_REVERSAL",
          amountInPence: barberShare,
          bookingId: booking.id,
          description: isPartial
            ? `Partial refund (£${(requested / 100).toFixed(2)}) — ${reason}`
            : `Refund — ${reason}`,
        },
      });
    }

    await tx.report.update({
      where: { id: reportId },
      data: {
        status: "RESOLVED_REFUNDED",
        adminNote: reason,
        resolvedById: adminId,
        resolvedAt: now,
        refundedAmountInPence: requested,
      },
    });
    await tx.reportEvent.create({
      data: {
        reportId,
        toStatus: "RESOLVED_REFUNDED",
        description: isPartial
          ? `Partial refund of £${(requested / 100).toFixed(2)} of £${(payment.amountInPence / 100).toFixed(2)}`
          : `Full refund of £${(requested / 100).toFixed(2)}`,
        actorId: adminId,
      },
    });
    // Close this report + any other open refund-requested reports on this
    // booking so admin doesn't have to resolve duplicates. Only do this on
    // a FULL refund — partial refunds leave the booking intact, so other
    // reports might still be valid follow-ups.
    if (!isPartial) {
      await tx.report.updateMany({
        where: {
          bookingId: booking.id,
          status: { in: ["OPEN", "UNDER_REVIEW"] },
          id: { not: reportId },
        },
        data: {
          status: "RESOLVED_REFUNDED",
          adminNote: reason,
          resolvedById: adminId,
          resolvedAt: now,
        },
      });
    }
  });

  const amountLabel = `£${(requested / 100).toFixed(2)}`;
  void sendPushToUser(booking.customerId, {
    title: isPartial ? "Partial refund issued" : "Refund issued",
    body: `${amountLabel} has been refunded. It should appear on your card within a few days.`,
    data: { type: "booking_status", bookingId: booking.id, status: isPartial ? booking.status : "CANCELLED" },
  });
  void sendPushToUser(booking.barber.userId, {
    title: isPartial ? "Partial refund issued" : "Booking refunded",
    body: isPartial
      ? `${amountLabel} was refunded to the customer.`
      : "The customer's dispute was resolved with a refund.",
    data: { type: "booking_status", bookingId: booking.id, status: isPartial ? booking.status : "CANCELLED" },
  });
}

export async function toggleUserBlock(userId: string, isCurrentlyBlocked: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isBlocked: !isCurrentlyBlocked },
  });
  revalidatePath("/admin/users");
}

const MIN_BANK_REFERENCE_CHARS = 4;
const MIN_FAILURE_REASON_CHARS = 10;

export async function markWithdrawalProcessing(withdrawalId: string) {
  const admin = await requireAdmin();
  const existing = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });
  if (!existing) throw new Error("Withdrawal not found");
  if (existing.status !== "REQUESTED") {
    throw new Error(`Cannot move ${existing.status} → PROCESSING`);
  }
  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: { status: "PROCESSING", processedById: admin.sub },
  });
  revalidatePath("/admin/withdrawals");
}

export async function markWithdrawalPaid(
  withdrawalId: string,
  bankReference: string,
  adminNote?: string
) {
  const admin = await requireAdmin();
  const ref = (bankReference ?? "").trim();
  if (ref.length < MIN_BANK_REFERENCE_CHARS) {
    throw new Error(
      `Bank reference is required (at least ${MIN_BANK_REFERENCE_CHARS} characters).`
    );
  }

  const existing = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      wallet: {
        include: {
          barberProfile: { select: { user: { select: { id: true } } } },
        },
      },
    },
  });
  if (!existing) throw new Error("Withdrawal not found");
  if (existing.status !== "REQUESTED" && existing.status !== "PROCESSING") {
    throw new Error(`Cannot mark ${existing.status} as paid.`);
  }

  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      status: "COMPLETED",
      bankReference: ref,
      adminNote: adminNote?.trim() || existing.adminNote,
      processedById: admin.sub,
      processedAt: new Date(),
    },
  });

  void sendPushToUser(existing.wallet.barberProfile.user.id, {
    title: "Withdrawal sent",
    body: `£${(existing.netInPence / 100).toFixed(2)} has been sent to your bank. Expect it within 2 business days.`,
    data: {
      type: "withdrawal",
      withdrawalId,
      status: "COMPLETED",
    },
  });

  revalidatePath("/admin/withdrawals");
}

export async function markWithdrawalFailed(
  withdrawalId: string,
  reason: string
) {
  const admin = await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < MIN_FAILURE_REASON_CHARS) {
    throw new Error(
      `Please provide a failure reason of at least ${MIN_FAILURE_REASON_CHARS} characters.`
    );
  }

  const existing = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      wallet: {
        include: {
          barberProfile: { select: { user: { select: { id: true } } } },
        },
      },
    },
  });
  if (!existing) throw new Error("Withdrawal not found");
  if (existing.status === "COMPLETED" || existing.status === "FAILED") {
    throw new Error(`Cannot fail a ${existing.status} withdrawal.`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Reverse the wallet debit — available balance restored, with a
    // WITHDRAWAL_REVERSAL ledger row so the history explains the swing.
    await tx.wallet.update({
      where: { id: existing.walletId },
      data: { availableInPence: { increment: existing.amountInPence } },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: existing.walletId,
        type: "WITHDRAWAL_REVERSAL",
        amountInPence: existing.amountInPence,
        description: `Withdrawal failed: ${trimmed}`,
      },
    });
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: "FAILED",
        adminNote: trimmed,
        processedById: admin.sub,
        processedAt: now,
      },
    });
  });

  void sendPushToUser(existing.wallet.barberProfile.user.id, {
    title: "Withdrawal failed",
    body: `We couldn't process your £${(existing.amountInPence / 100).toFixed(2)} withdrawal. Funds are back in your available balance.`,
    data: {
      type: "withdrawal",
      withdrawalId,
      status: "FAILED",
    },
  });

  revalidatePath("/admin/withdrawals");
}
