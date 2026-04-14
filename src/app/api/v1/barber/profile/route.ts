import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      include: {
        user: { select: { fullName: true, email: true, phone: true, profilePhoto: true } },
        services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
        photos: { orderBy: { order: "asc" } },
        settings: true,
        wallet: { select: { balanceInPence: true } },
      },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    return jsonResponse({ profile });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  try {
    const body = await request.json();
    const { bio, experience, address, latitude, longitude } = body;

    const profile = await prisma.barberProfile.update({
      where: { userId: auth.id },
      data: {
        ...(bio !== undefined && { bio }),
        ...(experience !== undefined && { experience }),
        ...(address !== undefined && { address }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
      },
    });

    return jsonResponse({ profile });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
