import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "ADMIN");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: { select: { fullName: true, email: true, phone: true } },
        barber: { include: { user: { select: { fullName: true, email: true } } } },
        services: { include: { service: true } },
        payment: true,
        verificationCode: { select: { code: true, isUsed: true } },
      },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    return jsonResponse({ booking });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
