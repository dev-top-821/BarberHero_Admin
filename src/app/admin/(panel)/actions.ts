"use server";

import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { refundBookingForDispute } from "@/lib/refunds";
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
    // Approved barbers should be immediately bookable without an extra
    // manual step, so default them online.
    data: { status: "APPROVED", rejectionReason: null, isOnline: true },
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
) {
  const admin = await requireAdmin();

  // Refund path: refund the service amount (platform keeps the £4.99),
  // zero the barber's wallet for this booking, cancel the booking, push
  // both parties. All refund logic lives in one place — see
  // refundBookingForDispute in @/lib/refunds.
  if (action === "RESOLVE_REFUND") {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { bookingId: true },
    });
    if (!report) throw new Error("Report not found");

    const result = await refundBookingForDispute({
      bookingId: report.bookingId,
      adminId: admin.sub,
      adminNote,
      reportId,
    });
    if (!result.ok) throw new Error(result.message);

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
