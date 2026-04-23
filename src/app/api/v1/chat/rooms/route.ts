import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

// GET /api/v1/chat/rooms — List chat rooms for the current user.
// Response shape per room:
//   { id, bookingId, customer, barber, lastMessage, unreadCount,
//     peerLastReadAt, createdAt }
// unreadCount = messages authored by the other party after this user's
// lastRead timestamp. peerLastReadAt powers "Seen" markers on the
// conversation screen.
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        booking: {
          OR: [
            { customerId: auth.id },
            { barber: { userId: auth.id } },
          ],
        },
      },
      include: {
        booking: {
          select: {
            customerId: true,
            customer: { select: { id: true, fullName: true, profilePhoto: true } },
            barber: {
              select: {
                userId: true,
                user: { select: { id: true, fullName: true, profilePhoto: true } },
              },
            },
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
        const isCustomer = r.booking.customerId === auth.id;
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
      const isCustomer = r.booking.customerId === auth.id;
      // Peer's read timestamp drives the "Seen" marker client-side.
      const peerLastReadAt = isCustomer
        ? r.barberLastReadAt
        : r.customerLastReadAt;
      return {
        id: r.id,
        bookingId: r.bookingId,
        createdAt: r.createdAt,
        unreadCount: unreadCounts[i],
        peerLastReadAt,
        customer: r.booking.customer
          ? {
              id: r.booking.customer.id,
              fullName: r.booking.customer.fullName,
              profilePhoto: r.booking.customer.profilePhoto,
            }
          : null,
        barber: r.booking.barber?.user
          ? {
              id: r.booking.barber.user.id,
              fullName: r.booking.barber.user.fullName,
              profilePhoto: r.booking.barber.user.profilePhoto,
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
