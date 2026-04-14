import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, isAuthError, jsonResponse, errorResponse } from "@/lib/api-utils";

const DAYS_MAP: Record<number, string> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

function generateTimeSlots(start: string, end: string, intervalMin: number): string[] {
  const slots: string[] = [];
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  let current = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (current < endMinutes) {
    const h = Math.floor(current / 60).toString().padStart(2, "0");
    const m = (current % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    current += intervalMin;
  }

  return slots;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");

    if (!dateStr) {
      return errorResponse("INVALID_INPUT", "Date parameter is required");
    }

    const date = new Date(dateStr);
    const dayOfWeek = DAYS_MAP[date.getDay()];

    // Get barber's availability for this day
    const slot = await prisma.availabilitySlot.findFirst({
      where: {
        barberProfileId: id,
        dayOfWeek: dayOfWeek as never,
        isActive: true,
      },
    });

    if (!slot) {
      return jsonResponse({ date: dateStr, availableSlots: [] });
    }

    // Get existing bookings for this date
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await prisma.booking.findMany({
      where: {
        barberId: id,
        date: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ["CANCELLED"] },
      },
      select: { startTime: true },
    });

    const bookedTimes = new Set(existingBookings.map((b) => b.startTime));

    // Generate available slots (30-min intervals)
    const allSlots = generateTimeSlots(slot.startTime, slot.endTime, 30);
    const availableSlots = allSlots.filter((s) => !bookedTimes.has(s));

    // Check minimum booking notice
    const settings = await prisma.barberSettings.findUnique({
      where: { barberProfileId: id },
      select: { minBookingNoticeHours: true },
    });

    const now = new Date();
    const minNoticeMs = (settings?.minBookingNoticeHours ?? 2) * 60 * 60 * 1000;

    const filteredSlots = availableSlots.filter((slotTime) => {
      const [h, m] = slotTime.split(":").map(Number);
      const slotDate = new Date(dateStr);
      slotDate.setHours(h, m, 0, 0);
      return slotDate.getTime() - now.getTime() >= minNoticeMs;
    });

    return jsonResponse({ date: dateStr, availableSlots: filteredSlots });
  } catch {
    return errorResponse("SERVER_ERROR", "An unexpected error occurred", 500);
  }
}
