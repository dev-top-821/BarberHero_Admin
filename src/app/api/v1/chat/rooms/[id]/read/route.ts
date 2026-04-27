import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";
import { mirrorRead } from "@/lib/chat-firestore";

// POST /api/v1/chat/rooms/:id/read
// Stamps the current user's lastRead time to now — caller must be a
// participant of the room. Drives unread counts + "Seen" markers.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const room = await prisma.chatRoom.findUnique({
      where: { id },
      select: {
        booking: {
          select: { customerId: true, barber: { select: { userId: true } } },
        },
      },
    });
    if (!room) return errorResponse("NOT_FOUND", "Chat room not found", 404);

    const isCustomer = room.booking.customerId === auth.id;
    const isBarber = room.booking.barber.userId === auth.id;
    if (!isCustomer && !isBarber) {
      return errorResponse("FORBIDDEN", "Not a participant", 403);
    }

    const now = new Date();
    await prisma.chatRoom.update({
      where: { id },
      data: isCustomer
        ? { customerLastReadAt: now }
        : { barberLastReadAt: now },
    });

    // Mirror to Firestore so the peer's "Seen" marker + the user's own
    // unread badge update live across both clients.
    await mirrorRead(id, auth.id, isCustomer, now);

    return jsonResponse({ lastReadAt: now.toISOString() });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
