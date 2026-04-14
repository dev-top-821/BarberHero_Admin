import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

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
            customer: { select: { id: true, fullName: true, profilePhoto: true } },
            barber: {
              select: { user: { select: { id: true, fullName: true, profilePhoto: true } } },
            },
          },
        },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse({ rooms });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
