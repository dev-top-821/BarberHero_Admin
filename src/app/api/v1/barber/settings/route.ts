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
      select: { settings: true },
    });

    return jsonResponse({ settings: profile?.settings });
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
    const profile = await prisma.barberProfile.findUnique({
      where: { userId: auth.id },
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const { serviceRadiusMiles, minBookingNoticeHours } = await request.json();

    const settings = await prisma.barberSettings.update({
      where: { barberProfileId: profile.id },
      data: {
        ...(serviceRadiusMiles !== undefined && { serviceRadiusMiles }),
        ...(minBookingNoticeHours !== undefined && { minBookingNoticeHours }),
      },
    });

    return jsonResponse({ settings });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
