import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const [totalBarbers, pendingBarbers, totalBookings, totalCustomers, recentBookings] =
      await Promise.all([
        prisma.barberProfile.count(),
        prisma.barberProfile.count({ where: { status: "PENDING" } }),
        prisma.booking.count(),
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.booking.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            customer: { select: { fullName: true } },
            barber: { include: { user: { select: { fullName: true } } } },
          },
        }),
      ]);

    return jsonResponse({
      stats: { totalBarbers, pendingBarbers, totalBookings, totalCustomers },
      recentBookings,
    });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
