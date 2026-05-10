import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, requireRole, jsonResponse, errorResponse } from "@/lib/api-utils";
import { exceptionSchema } from "@/lib/validators/availability";
import { dateOnlyToUTCStartOfDay } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  const profile = await prisma.barberProfile.findUnique({
    where: { userId: auth.id },
    select: { id: true },
  });
  if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

  // Hide past exceptions from the calendar — they are no longer actionable.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const exceptions = await prisma.availabilityException.findMany({
    where: { barberProfileId: profile.id, date: { gte: today } },
    orderBy: { date: "asc" },
  });

  return jsonResponse({ exceptions });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;
  const roleErr = requireRole(auth, "BARBER");
  if (roleErr) return roleErr;

  const profile = await prisma.barberProfile.findUnique({
    where: { userId: auth.id },
    select: { id: true },
  });
  if (!profile) return errorResponse("NOT_FOUND", "Barber profile not found", 404);

  const parsed = exceptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { date, isClosed, startTime, endTime, reason } = parsed.data;
  const dateUTC = dateOnlyToUTCStartOfDay(date);

  // Upsert so a barber can edit the same date without first deleting it.
  const exception = await prisma.availabilityException.upsert({
    where: { barberProfileId_date: { barberProfileId: profile.id, date: dateUTC } },
    create: {
      barberProfileId: profile.id,
      date: dateUTC,
      isClosed,
      startTime: isClosed ? null : startTime ?? null,
      endTime: isClosed ? null : endTime ?? null,
      reason: reason ?? null,
    },
    update: {
      isClosed,
      startTime: isClosed ? null : startTime ?? null,
      endTime: isClosed ? null : endTime ?? null,
      reason: reason ?? null,
    },
  });

  return jsonResponse({ exception }, 201);
}
