import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "CUSTOMER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { rating, comment } = await request.json();

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { customerId: true, barberId: true, status: true },
    });

    if (!booking || booking.customerId !== auth.id) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    if (booking.status !== "COMPLETED") {
      return errorResponse("INVALID_STATUS", "Can only review completed bookings");
    }

    const review = await prisma.review.create({
      data: {
        customerId: auth.id,
        barberProfileId: booking.barberId,
        rating,
        comment,
      },
    });

    return jsonResponse({ review }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
