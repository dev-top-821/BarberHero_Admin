import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { availabilitySchema } from "@/lib/validators/availability";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

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
}

export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  const profile = await prisma.barberProfile.findUnique({
    where: { userId: auth.id },
    select: { id: true },
  });

  if (!profile) {
    return errorResponse("NOT_FOUND", "Barber profile not found", 404);
  }

  const parsed = availabilitySchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { slots } = parsed.data;

  await prisma.$transaction([
    prisma.availabilitySlot.deleteMany({
      where: { barberProfileId: profile.id },
    }),
    ...slots.map((slot) =>
      prisma.availabilitySlot.create({
        data: {
          barberProfileId: profile.id,
          dayOfWeek: slot.dayOfWeek,
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
}
