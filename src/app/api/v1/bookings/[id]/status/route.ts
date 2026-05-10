import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";
import { mirrorRoom } from "@/lib/chat-firestore";

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

    // Status PATCH only handles transitions the barber drives manually from
    // the dashboard. Two transitions are deliberately omitted:
    //
    //   ON_THE_WAY → STARTED   driven by /bookings/:id/verify (code entry).
    //                          Letting it happen here would skip the Stripe
    //                          capture + wallet pending-credit, leaving the
    //                          payment HELD forever.
    //   STARTED    → COMPLETED driven by /cron/release-held-payments after
    //                          the 24h hold elapses. Closing it earlier
    //                          would also skip the EARNING + PLATFORM_FEE
    //                          ledger writes.
    const validTransitions: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["ON_THE_WAY", "CANCELLED"],
    };

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        status: true,
        customerId: true,
        date: true,
        startTime: true,
      },
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

    // ON_THE_WAY unlocks phone visibility (see booking-privacy.ts) and
    // is otherwise a free toggle, so a barber could spam-flip to read
    // the customer's number 6 hours before the booking. Refuse if more
    // than 60 minutes before the scheduled start.
    if (status === "ON_THE_WAY") {
      const [hh, mm] = booking.startTime.split(":").map((s) => Number.parseInt(s, 10));
      const scheduledStart = new Date(booking.date);
      scheduledStart.setUTCHours(hh, mm, 0, 0);
      const minutesUntilStart =
        (scheduledStart.getTime() - Date.now()) / (60 * 1000);
      if (minutesUntilStart > 60) {
        return errorResponse(
          "TOO_EARLY",
          "You can only go on the way within an hour of the booking start time.",
          409,
        );
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });

    // On CONFIRMED: generate the arrival code + open the chat room.
    // Both are idempotent via the unique bookingId index, so a retry
    // won't blow up.
    if (status === "CONFIRMED") {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await prisma.verificationCode.create({
        data: { bookingId: id, code },
      });
      const room = await prisma.chatRoom
        .create({ data: { bookingId: id } })
        .catch(() => {
          // Room may already exist if an earlier call half-succeeded —
          // the unique constraint will catch it and we ignore.
          return null;
        });
      if (room) {
        // Mirror room metadata to Firestore so the rooms list snapshot
        // listener picks it up on both sides immediately.
        const full = await prisma.booking.findUnique({
          where: { id },
          select: { customerId: true, barber: { select: { userId: true } } },
        });
        if (full) {
          await mirrorRoom({
            roomId: room.id,
            customerId: full.customerId,
            barberId: full.barber.userId,
            createdAt: room.createdAt,
          });
        }
      }
    }

    const title = STATUS_TITLES[status];
    if (title) {
      void sendPushToUser(booking.customerId, {
        title,
        body:
          status === "CONFIRMED"
            ? "Your booking has been accepted. Don't share your verification code until the barber arrives at your address."
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
