import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

// GET /api/v1/chat/rooms — List chat rooms for the current user.
// Response shape per room:
//   { id, customer, barber, lastMessage, unreadCount,
//     peerLastReadAt, createdAt }
// unreadCount = messages authored by the other party after this user's
// lastRead timestamp. peerLastReadAt powers "Seen" markers on the
// conversation screen.
//
// Rooms are a persistent thread per (barber, customer) pair, not per
// booking — so there's no booking-status-based archiving here. A thread
// stays visible for as long as the relationship exists.
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [{ customerId: auth.id }, { barber: { userId: auth.id } }],
      },
      include: {
        customer: { select: { id: true, fullName: true, profilePhoto: true } },
        barber: {
          select: {
            userId: true,
            user: { select: { id: true, fullName: true, profilePhoto: true } },
          },
        },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    // Per-room unread counts. Cheap aggregate per room (scale is small);
    // when it matters, fold into the raw SQL above.
    const unreadCounts = await Promise.all(
      rooms.map(async (r) => {
        const isCustomer = r.customerId === auth.id;
        const lastRead = isCustomer
          ? r.customerLastReadAt
          : r.barberLastReadAt;
        return prisma.chatMessage.count({
          where: {
            chatRoomId: r.id,
            senderId: { not: auth.id },
            ...(lastRead && { createdAt: { gt: lastRead } }),
          },
        });
      })
    );

    const flat = rooms.map((r, i) => {
      const isCustomer = r.customerId === auth.id;
      // Peer's read timestamp drives the "Seen" marker client-side.
      const peerLastReadAt = isCustomer
        ? r.barberLastReadAt
        : r.customerLastReadAt;
      return {
        id: r.id,
        createdAt: r.createdAt,
        unreadCount: unreadCounts[i],
        peerLastReadAt,
        customer: r.customer
          ? {
              id: r.customer.id,
              fullName: r.customer.fullName,
              profilePhoto: r.customer.profilePhoto,
            }
          : null,
        barber: r.barber?.user
          ? {
              id: r.barber.user.id,
              fullName: r.barber.user.fullName,
              profilePhoto: r.barber.user.profilePhoto,
            }
          : null,
        lastMessage: r.messages[0] ?? null,
      };
    });

    return jsonResponse({ rooms: flat });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
