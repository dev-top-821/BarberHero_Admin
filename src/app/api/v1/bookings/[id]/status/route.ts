import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";

const STATUS_TITLES: Record<string, string> = {
  CONFIRMED: "Booking confirmed",
  ON_THE_WAY: "Your barber is on the way",
  STARTED: "Your appointment has started",
  COMPLETED: "Appointment completed",
  CANCELLED: "Booking cancelled",
};

// PATCH /api/v1/bookings/:id/status — Update booking status (barber only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { id } = await params;
    const { status } = await request.json();

    const validTransitions: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["ON_THE_WAY", "CANCELLED"],
      ON_THE_WAY: ["STARTED"],
      STARTED: ["COMPLETED"],
    };

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { status: true, customerId: true },
    });

    if (!booking) {
      return errorResponse("NOT_FOUND", "Booking not found", 404);
    }

    const allowed = validTransitions[booking.status] ?? [];
    if (!allowed.includes(status)) {
      return errorResponse(
        "INVALID_TRANSITION",
        `Cannot transition from ${booking.status} to ${status}`
      );
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });

    // On CONFIRMED: generate verification code and charge platform fee
    if (status === "CONFIRMED") {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await prisma.verificationCode.create({
        data: { bookingId: id, code },
      });
      // TODO: Create chat room, charge platform fee
    }

    const title = STATUS_TITLES[status];
    if (title) {
      void sendPushToUser(booking.customerId, {
        title,
        body:
          status === "CONFIRMED"
            ? "Your booking has been accepted by the barber."
            : status === "CANCELLED"
            ? "The barber cancelled this booking."
            : "Tap to view your booking.",
        data: { type: "booking_status", bookingId: id, status },
      });
    }

    return jsonResponse({ booking: updated });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
