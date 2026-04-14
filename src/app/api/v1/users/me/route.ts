import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        profilePhoto: true,
        role: true,
        createdAt: true,
        barberProfile: {
          select: { id: true, status: true, isOnline: true },
        },
      },
    });

    if (!user) {
      return errorResponse("NOT_FOUND", "User not found", 404);
    }

    return jsonResponse({ user });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { fullName, phone, profilePhoto } = body;

    const user = await prisma.user.update({
      where: { id: auth.id },
      data: {
        ...(fullName && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(profilePhoto !== undefined && { profilePhoto }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        profilePhoto: true,
        role: true,
      },
    });

    return jsonResponse({ user });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
