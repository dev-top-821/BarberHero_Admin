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
  adminNote?: string
) {
  const admin = await requireAdmin();

  // Refund path: issue Stripe refund / cancel, reverse the wallet pending
  // credit (if applicable), close the booking, push both parties.
  if (action === "RESOLVE_REFUND") {
    await issueRefundForReport(reportId, admin.sub, adminNote);
    revalidatePath("/admin/disputes");
    return;
  }

  const statusMap = {
    UNDER_REVIEW: "UNDER_REVIEW",
    RESOLVE_NO_REFUND: "RESOLVED_NO_REFUND",
    REJECT: "REJECTED",
  } as const;

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: statusMap[action],
      adminNote: adminNote || undefined,
      resolvedById: action === "UNDER_REVIEW" ? null : admin.sub,
      resolvedAt: action === "UNDER_REVIEW" ? null : new Date(),
    },
  });

  revalidatePath("/admin/disputes");
}

async function issueRefundForReport(
  reportId: string,
  adminId: string,
  adminNote: string | undefined
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

  if (payment.status === "HELD") {
    // Pre-capture — free release of the hold.
    await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
  } else if (payment.status === "PENDING_RELEASE") {
    await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
    });
  } else {
    throw new Error(`Cannot refund a payment in status ${payment.status}`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", refundedAt: now, refundReason: reason },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });

    // Only reverse wallet if we'd actually credited pending — HELD payments
    // never touched the wallet.
    if (payment.status === "PENDING_RELEASE") {
      const wallet = await tx.wallet.upsert({
        where: { barberProfileId: booking.barber.id },
        create: {
          barberProfileId: booking.barber.id,
          pendingInPence: 0,
          availableInPence: 0,
        },
        update: {
          pendingInPence: { decrement: payment.barberAmountInPence },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND_REVERSAL",
          amountInPence: payment.barberAmountInPence,
          bookingId: booking.id,
          description: `Refund — ${reason}`,
        },
      });
    }

    // Close this report + any other open refund-requested reports on this
    // booking so admin doesn't have to resolve duplicates.
    await tx.report.update({
      where: { id: reportId },
      data: {
        status: "RESOLVED_REFUNDED",
        adminNote: reason,
        resolvedById: adminId,
        resolvedAt: now,
      },
    });
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
  });

  void sendPushToUser(booking.customerId, {
    title: "Refund issued",
    body: "Your refund has been processed. It should appear on your card within a few days.",
    data: { type: "booking_status", bookingId: booking.id, status: "CANCELLED" },
  });
  void sendPushToUser(booking.barber.userId, {
    title: "Booking refunded",
    body: "The customer's dispute was resolved with a refund.",
    data: { type: "booking_status", bookingId: booking.id, status: "CANCELLED" },
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
