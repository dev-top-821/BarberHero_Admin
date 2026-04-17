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
}

export async function toggleUserBlock(userId: string, isCurrentlyBlocked: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isBlocked: !isCurrentlyBlocked },
  });
  revalidatePath("/admin/users");
}
