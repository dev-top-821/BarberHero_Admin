import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const { isOnline } = await request.json();

    const profile = await prisma.barberProfile.update({
      where: { userId: auth.id },
      data: { isOnline: Boolean(isOnline) },
      select: { isOnline: true },
    });

    return jsonResponse({ isOnline: profile.isOnline });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
