import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";
import { redactPhonesByStatus } from "@/lib/booking-privacy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: { select: { fullName: true, profilePhoto: true, phone: true } },
        barber: {
          include: {
            user: { select: { fullName: true, profilePhoto: true, phone: true } },
          },
        },
        services: { include: { service: true } },
        payment: true,
        verificationCode: auth.role === "CUSTOMER"
          ? { select: { code: true, isUsed: true } }
          : { select: { isUsed: true } },
      },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    return jsonResponse({ booking: redactPhonesByStatus(booking) });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
