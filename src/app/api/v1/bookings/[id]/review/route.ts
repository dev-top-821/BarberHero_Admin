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
      select: {
        customerId: true,
        barberId: true,
        status: true,
        payment: { select: { status: true } },
      },
    });

    if (!booking || booking.customerId !== auth.id) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    // A completed booking is reviewable; so is any refunded booking
    // (client decision, May-2026 feedback round — customers may still
    // leave a review after a dispute refund).
    const isRefunded = booking.payment?.status === "REFUNDED";
    if (booking.status !== "COMPLETED" && !isRefunded) {
      return errorResponse(
        "INVALID_STATUS",
        "You can only review a completed or refunded booking"
      );
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
