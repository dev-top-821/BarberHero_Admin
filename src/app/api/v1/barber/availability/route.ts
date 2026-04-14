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
      select: { id: true },
    });

    if (!profile) {
      return errorResponse("NOT_FOUND", "Barber profile not found", 404);
    }

    const slots = await prisma.availabilitySlot.findMany({
      where: { barberProfileId: profile.id },
      orderBy: { dayOfWeek: "asc" },
    });

    return jsonResponse({ slots });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}

export async function PUT(request: NextRequest) {
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

    const { slots } = await request.json();

    // Replace all availability slots
    await prisma.$transaction([
      prisma.availabilitySlot.deleteMany({
        where: { barberProfileId: profile.id },
      }),
      ...slots.map(
        (slot: { dayOfWeek: string; startTime: string; endTime: string; isActive: boolean }) =>
          prisma.availabilitySlot.create({
            data: {
              barberProfileId: profile.id,
              dayOfWeek: slot.dayOfWeek as never,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isActive: slot.isActive,
            },
          })
      ),
    ]);

    const updatedSlots = await prisma.availabilitySlot.findMany({
      where: { barberProfileId: profile.id },
      orderBy: { dayOfWeek: "asc" },
    });

    return jsonResponse({ slots: updatedSlots });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
