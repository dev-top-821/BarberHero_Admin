import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/api-utils";
import {
  ACTIVE_BOOKING_STATUSES,
  BookedInterval,
  dateOnlyToUTCStartOfDay,
  dayOfWeekFromUTCDate,
  generateAvailableSlots,
  hhmmToMinutes,
  isValidHHmm,
} from "@/lib/calendar";

// Public: guests pick a date/time before the register wall on payment.
// Query: ?date=YYYY-MM-DD&serviceIds=a,b,c
//
// `serviceIds` is required so we can compute the actual appointment duration
// — without it the endpoint would return 30-min start times that don't
// correspond to bookable windows for longer services.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const serviceIdsParam = searchParams.get("serviceIds");

  if (!dateStr) {
    return errorResponse("INVALID_INPUT", "Date parameter is required");
  }

  let dateUTC: Date;
  try {
    dateUTC = dateOnlyToUTCStartOfDay(dateStr);
  } catch {
    return errorResponse("INVALID_INPUT", "Date must be in YYYY-MM-DD format");
  }

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

  // Build the bookable window for the date: weekly slot, optionally narrowed
  // (or fully closed) by an AvailabilityException for that specific date.
  const dayOfWeek = dayOfWeekFromUTCDate(dateUTC);

  const [weekly, exception, settings] = await Promise.all([
    prisma.availabilitySlot.findFirst({
      where: { barberProfileId: id, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true },
    }),
    prisma.availabilityException.findUnique({
      where: { barberProfileId_date: { barberProfileId: id, date: dateUTC } },
      select: { isClosed: true, startTime: true, endTime: true },
    }),
    prisma.barberSettings.findUnique({
      where: { barberProfileId: id },
      select: { minBookingNoticeHours: true, slotGranularityMinutes: true },
    }),
  ]);

  if (!weekly && !exception) {
    return jsonResponse({ date: dateStr, availableSlots: [] });
  }
  if (exception?.isClosed) {
    return jsonResponse({ date: dateStr, availableSlots: [] });
  }

  // Exception with explicit hours overrides the weekly slot for this date.
  // Otherwise fall back to the weekly slot.
  const windowStart =
    !exception?.isClosed && exception?.startTime ? exception.startTime : weekly?.startTime;
  const windowEnd =
    !exception?.isClosed && exception?.endTime ? exception.endTime : weekly?.endTime;

  if (!windowStart || !windowEnd || !isValidHHmm(windowStart) || !isValidHHmm(windowEnd)) {
    return jsonResponse({ date: dateStr, availableSlots: [] });
  }

  // Pull all bookings overlapping the date and compute their HH:mm intervals.
  // Status filter excludes COMPLETED/CANCELLED — only live bookings should
  // hold a slot.
  const dayStart = new Date(dateUTC);
  const dayEnd = new Date(dateUTC.getTime() + 24 * 60 * 60 * 1000);

  const existingBookings = await prisma.booking.findMany({
    where: {
      barberId: id,
      date: { gte: dayStart, lt: dayEnd },
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
    },
    select: { startTime: true, endTime: true },
  });

  const bookedIntervals: BookedInterval[] = existingBookings
    .filter((b) => isValidHHmm(b.startTime) && isValidHHmm(b.endTime))
    .map((b) => ({
      startMinutes: hhmmToMinutes(b.startTime),
      endMinutes: hhmmToMinutes(b.endTime),
    }));

  const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
  const granularityMinutes = settings?.slotGranularityMinutes ?? 30;
  const earliestStartUtcMs = Date.now() + minNoticeHours * 60 * 60 * 1000;

  const availableSlots = generateAvailableSlots({
    windowStart,
    windowEnd,
    durationMinutes,
    granularityMinutes,
    bookings: bookedIntervals,
    earliestStartUtcMs,
    dateUTCStartMs: dateUTC.getTime(),
  });

  return jsonResponse({
    date: dateStr,
    durationMinutes,
    granularityMinutes,
    availableSlots,
  });
}
