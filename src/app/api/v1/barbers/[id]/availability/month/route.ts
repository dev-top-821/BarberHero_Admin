import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import {
  ACTIVE_BOOKING_STATUSES,
  BookedInterval,
  dayOfWeekFromUTCDate,
  generateAvailableSlots,
  hhmmToMinutes,
  isValidHHmm,
} from "@/lib/calendar";

// Public: powers the customer booking calendar's per-date colour coding
// (available / unavailable) without a round trip per day. Reuses the same
// weekly-schedule/exception/booking logic as the single-day endpoint, just
// batched for the whole month.
// Query: ?month=YYYY-MM&serviceIds=a,b,c
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const monthStr = searchParams.get("month");
  const serviceIdsParam = searchParams.get("serviceIds");

  const monthMatch = monthStr ? /^(\d{4})-(\d{2})$/.exec(monthStr) : null;
  if (!monthMatch) {
    return errorResponse("INVALID_INPUT", "month must be in YYYY-MM format");
  }
  const year = Number(monthMatch[1]);
  const monthIndex = Number(monthMatch[2]) - 1;

  const serviceIds = (serviceIdsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (serviceIds.length === 0) {
    return errorResponse(
      "INVALID_INPUT",
      "At least one serviceId is required to compute available slots"
    );
  }

  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, barberProfileId: id, isActive: true },
    select: { id: true, durationMinutes: true },
  });

  if (services.length !== serviceIds.length) {
    return errorResponse(
      "INVALID_INPUT",
      "One or more services were not found for this barber",
      404
    );
  }

  const durationMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);

  const monthStartUTC = new Date(Date.UTC(year, monthIndex, 1));
  const monthEndUTC = new Date(Date.UTC(year, monthIndex + 1, 1));
  const daysInMonth = (monthEndUTC.getTime() - monthStartUTC.getTime()) / 86_400_000;

  const [weeklySlots, exceptions, settings, existingBookings] = await Promise.all([
    prisma.availabilitySlot.findMany({
      where: { barberProfileId: id, isActive: true },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.availabilityException.findMany({
      where: { barberProfileId: id, date: { gte: monthStartUTC, lt: monthEndUTC } },
      select: { date: true, isClosed: true, startTime: true, endTime: true },
    }),
    prisma.barberSettings.findUnique({
      where: { barberProfileId: id },
      select: { minBookingNoticeHours: true, slotGranularityMinutes: true },
    }),
    prisma.booking.findMany({
      where: {
        barberId: id,
        date: { gte: monthStartUTC, lt: monthEndUTC },
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
      select: { date: true, startTime: true, endTime: true },
    }),
  ]);

  const weeklyByDay = new Map(weeklySlots.map((w) => [w.dayOfWeek, w]));
  const exceptionByDateKey = new Map(
    exceptions.map((e) => [e.date.toISOString().slice(0, 10), e])
  );
  const bookingsByDateKey = new Map<string, BookedInterval[]>();
  for (const b of existingBookings) {
    if (!isValidHHmm(b.startTime) || !isValidHHmm(b.endTime)) continue;
    const key = b.date.toISOString().slice(0, 10);
    const list = bookingsByDateKey.get(key) ?? [];
    list.push({ startMinutes: hhmmToMinutes(b.startTime), endMinutes: hhmmToMinutes(b.endTime) });
    bookingsByDateKey.set(key, list);
  }

  const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
  const granularityMinutes = settings?.slotGranularityMinutes ?? 30;
  const earliestStartUtcMs = Date.now() + minNoticeHours * 60 * 60 * 1000;

  const days: { date: string; hasAvailability: boolean }[] = [];

  for (let d = 0; d < daysInMonth; d++) {
    const dateUTC = new Date(monthStartUTC.getTime() + d * 86_400_000);
    const dateKey = dateUTC.toISOString().slice(0, 10);
    const dayOfWeek = dayOfWeekFromUTCDate(dateUTC);
    const weekly = weeklyByDay.get(dayOfWeek);
    const exception = exceptionByDateKey.get(dateKey);

    if (!weekly && !exception) {
      days.push({ date: dateKey, hasAvailability: false });
      continue;
    }
    if (exception?.isClosed) {
      days.push({ date: dateKey, hasAvailability: false });
      continue;
    }

    const windowStart =
      !exception?.isClosed && exception?.startTime ? exception.startTime : weekly?.startTime;
    const windowEnd =
      !exception?.isClosed && exception?.endTime ? exception.endTime : weekly?.endTime;

    if (!windowStart || !windowEnd || !isValidHHmm(windowStart) || !isValidHHmm(windowEnd)) {
      days.push({ date: dateKey, hasAvailability: false });
      continue;
    }

    const slots = generateAvailableSlots({
      windowStart,
      windowEnd,
      durationMinutes,
      granularityMinutes,
      bookings: bookingsByDateKey.get(dateKey) ?? [],
      earliestStartUtcMs,
      dateUTCStartMs: dateUTC.getTime(),
    });

    days.push({ date: dateKey, hasAvailability: slots.length > 0 });
  }

  return jsonResponse({ month: monthStr, durationMinutes, days });
}
