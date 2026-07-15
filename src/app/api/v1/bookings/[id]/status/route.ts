import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { sendPushToUser } from "@/lib/push";
import { mirrorRoom } from "@/lib/chat-firestore";
import { londonWallClockToUTC } from "@/lib/calendar";

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
    // than 60 minutes before the scheduled start (London wall-clock —
    // setUTCHours interprets HH:mm as UTC and pushes the window 1 hour
    // late during BST, which was blocking barbers who'd arrived early).
    if (status === "ON_THE_WAY") {
      const scheduledStart = londonWallClockToUTC(booking.date, booking.startTime);
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

    // On CONFIRMED: generate the arrival code + attach the booking to this
    // barber/customer pair's persistent chat room (find-or-create — the
    // same two people re-booking each other reuse one thread).
    if (status === "CONFIRMED") {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await prisma.verificationCode.create({
        data: { bookingId: id, code },
      });

      const full = await prisma.booking.findUnique({
        where: { id },
        select: { customerId: true, barberId: true, barber: { select: { userId: true } } },
      });

      if (full) {
        const pairKey = { barberId: full.barberId, customerId: full.customerId };
        let room = await prisma.chatRoom.findUnique({
          where: { barberId_customerId: pairKey },
        });
        let isNewRoom = false;

        if (!room) {
          room = await prisma.chatRoom
            .create({ data: pairKey })
            .catch(() => null);
          if (room) {
            isNewRoom = true;
          } else {
            // Lost a create race — another concurrent CONFIRMED call
            // created it first. Fetch what's there now.
            room = await prisma.chatRoom.findUnique({ where: { barberId_customerId: pairKey } });
          }
        }

        if (room) {
          await prisma.booking.update({ where: { id }, data: { chatRoomId: room.id } });
          // Only mirror on first creation — mirrorRoom unconditionally
          // resets lastMessage/lastMessageAt, which would wipe an
          // existing thread's preview if called again on reuse.
          if (isNewRoom) {
            await mirrorRoom({
              roomId: room.id,
              customerId: full.customerId,
              barberId: full.barber.userId,
              createdAt: room.createdAt,
            });
          }
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
