import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

// POST /api/v1/bookings/:id/verify — Enter verification code (barber only)
// TODO: Full Stripe capture implementation in M3
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { code } = await request.json();

    const verification = await prisma.verificationCode.findUnique({
      where: { bookingId: id },
    });

    if (!verification) {
      return errorResponse("NOT_FOUND", "Verification code not found", 404);
    }

    if (verification.isUsed) {
      return errorResponse("ALREADY_USED", "Code has already been used");
    }

    if (verification.code !== code) {
      return errorResponse("INVALID_CODE", "Invalid verification code");
    }

    // Mark code as used, complete booking
    const [, updatedBooking] = await prisma.$transaction([
      prisma.verificationCode.update({
        where: { id: verification.id },
        data: { isUsed: true },
      }),
      prisma.booking.update({
        where: { id },
        data: { status: "COMPLETED" },
        select: { customerId: true },
      }),
    ]);

    // TODO: Capture Stripe payment, credit barber wallet

    void sendPushToUser(updatedBooking.customerId, {
      title: "Appointment completed",
      body: "Thanks! Tap to leave a review.",
      data: { type: "booking_status", bookingId: id, status: "COMPLETED" },
    });

    return jsonResponse({ success: true });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
