"use server";

import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
  await prisma.barberProfile.update({
    where: { id: barberId },
    data: { status: "APPROVED" },
  });
  revalidatePath("/admin/barbers");
  revalidatePath(`/admin/barbers/${barberId}`);
}

export async function rejectBarber(barberId: string) {
  await requireAdmin();
  await prisma.barberProfile.update({
    where: { id: barberId },
    data: { status: "REJECTED" },
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

  const statusMap = {
    UNDER_REVIEW: "UNDER_REVIEW",
    RESOLVE_REFUND: "RESOLVED_REFUNDED",
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

export async function toggleUserBlock(userId: string, isCurrentlyBlocked: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isBlocked: !isCurrentlyBlocked },
  });
  revalidatePath("/admin/users");
}
