import { DayOfWeek } from "@/generated/prisma/enums";

// HH:mm parsing/formatting. We store times as strings so a "09:30" slot
// always means 09:30 in the barber's local context — no DST surprises.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHmm(value: string): boolean {
  return HHMM_RE.test(value);
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Date-only strings ("YYYY-MM-DD") must be anchored to UTC midnight, otherwise
// `new Date("2026-04-28").getDay()` returns the day in the *server's* local
// timezone — a UK production server reports Tuesday, a US-east server reports
// Monday. Keeping the anchor in UTC keeps the calendar consistent regardless
// of where the API is deployed.
export function dateOnlyToUTCStartOfDay(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

const DAYS_BY_UTC_INDEX: Record<number, DayOfWeek> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

export function dayOfWeekFromUTCDate(date: Date): DayOfWeek {
  return DAYS_BY_UTC_INDEX[date.getUTCDay()];
}

// Half-open interval comparison — a booking ending at 10:00 does not collide
// with one starting at 10:00.
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface BookedInterval {
  startMinutes: number;
  endMinutes: number;
}

export interface GenerateSlotsArgs {
  windowStart: string;        // HH:mm — barber's available window start
  windowEnd: string;          // HH:mm — barber's available window end
  durationMinutes: number;    // total minutes of selected services
  granularityMinutes: number; // step between candidate slots
  bookings: BookedInterval[]; // existing scheduled bookings
  // Earliest UTC ms a slot may start at (min-booking-notice cutoff).
  earliestStartUtcMs: number;
  // UTC ms for the calendar date at 00:00 — used to convert HH:mm into UTC.
  dateUTCStartMs: number;
}

// Returns HH:mm slot start times that:
//   - fit entirely inside the window (start + duration <= windowEnd)
//   - don't overlap any existing booking
//   - respect the minimum-notice cutoff
export function generateAvailableSlots(args: GenerateSlotsArgs): string[] {
  const { windowStart, windowEnd, durationMinutes, granularityMinutes,
    bookings, earliestStartUtcMs, dateUTCStartMs } = args;

  if (durationMinutes <= 0 || granularityMinutes <= 0) return [];

  const winStart = hhmmToMinutes(windowStart);
  const winEnd = hhmmToMinutes(windowEnd);
  if (winStart >= winEnd) return [];

  const lastStart = winEnd - durationMinutes;
  const out: string[] = [];

  for (let t = winStart; t <= lastStart; t += granularityMinutes) {
    const slotEnd = t + durationMinutes;

    const slotStartUtcMs = dateUTCStartMs + t * 60_000;
    if (slotStartUtcMs < earliestStartUtcMs) continue;

    const conflicts = bookings.some((b) =>
      intervalsOverlap(t, slotEnd, b.startMinutes, b.endMinutes)
    );
    if (conflicts) continue;

    out.push(minutesToHHmm(t));
  }

  return out;
}

// Statuses that actively reserve a barber's time. COMPLETED/CANCELLED do not.
export const ACTIVE_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ON_THE_WAY",
  "STARTED",
] as const;

// Turn a (booking.date at UTC midnight, "HH:mm" London-local wall-clock
// string) pair into the actual UTC moment of that wall-clock time. The
// codebase stores times as strings deliberately (see comment at the top
// of this file) so DST doesn't shift previously-booked slots; this is
// the canonical way to convert one back into an absolute timestamp for
// "how far is this from now?" checks.
//
// Why we need this: setUTCHours treats HH:mm as UTC (off by 1 hour
// during BST), setHours treats HH:mm as the *server* local TZ (US on
// Render — wildly wrong). Both bugs existed in different routes. This
// helper resolves the London offset for the booking's calendar day via
// Intl, so BST/GMT transitions are handled correctly.
export function londonWallClockToUTC(
  dateAtUTCMidnight: Date,
  startTimeHHmm: string,
): Date {
  const [hh, mm] = startTimeHHmm.split(":").map((s) => Number.parseInt(s, 10));
  // Probe at 12:00 UTC of the booking date — far from any DST edge.
  const probe = new Date(
    Date.UTC(
      dateAtUTCMidnight.getUTCFullYear(),
      dateAtUTCMidnight.getUTCMonth(),
      dateAtUTCMidnight.getUTCDate(),
      12, 0, 0, 0,
    ),
  );
  const londonHour = Number.parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(probe)
      .find((p) => p.type === "hour")?.value ?? "12",
    10,
  );
  // London hour at 12:00 UTC = 12 in GMT, 13 in BST.
  const offsetHours = londonHour - 12;
  const result = new Date(dateAtUTCMidnight);
  result.setUTCHours(hh - offsetHours, mm, 0, 0);
  return result;
}
