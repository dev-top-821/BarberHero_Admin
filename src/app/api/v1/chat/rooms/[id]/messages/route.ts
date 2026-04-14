import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const after = searchParams.get("after");

    const messages = await prisma.chatMessage.findMany({
      where: {
        chatRoomId: id,
        ...(after && { createdAt: { gt: new Date(after) } }),
      },
      include: { sender: { select: { id: true, fullName: true, profilePhoto: true } } },
      orderBy: { createdAt: "asc" },
    });

    return jsonResponse({ messages });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const { content } = await request.json();

    const message = await prisma.chatMessage.create({
      data: {
        chatRoomId: id,
        senderId: auth.id,
        content,
      },
      include: { sender: { select: { id: true, fullName: true } } },
    });

    // TODO: Send FCM push notification to other participant

    return jsonResponse({ message }, 201);
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
