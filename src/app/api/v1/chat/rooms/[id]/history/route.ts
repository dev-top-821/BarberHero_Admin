import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  isAuthError,
  jsonResponse,
  errorResponse,
} from "@/lib/api-utils";

// GET /api/v1/chat/rooms/:id/history?before=<iso>&limit=<n>
// Paginates older messages from Postgres for users scrolling past the
// Firestore real-time window (Firestore caches the recent N — Postgres
// holds full history). Returns messages in ascending order so the client
// can prepend them to the current list.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limitParam = parseInt(searchParams.get("limit") ?? "", 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : DEFAULT_LIMIT;

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

    // Fetch the page in DESC order so `take: limit` gives us the newest
    // entries strictly before the cursor, then reverse to ascending for
    // the client.
    const page = await prisma.chatMessage.findMany({
      where: {
        chatRoomId: id,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      include: { sender: { select: { id: true, fullName: true, profilePhoto: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const messages = page.reverse();
    const hasMore = page.length === limit;

    return jsonResponse({ messages, hasMore });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
