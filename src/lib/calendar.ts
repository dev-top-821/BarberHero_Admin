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
