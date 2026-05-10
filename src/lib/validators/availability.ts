import { z } from "zod/v4";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

const day = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const slot = z
  .object({
    dayOfWeek: day,
    startTime: hhmm,
    endTime: hhmm,
    isActive: z.boolean(),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });

export const availabilitySchema = z
  .object({
    slots: z.array(slot).max(7),
  })
  .refine(
    (v) => new Set(v.slots.map((s) => s.dayOfWeek)).size === v.slots.length,
    { message: "Each day of the week may appear only once", path: ["slots"] }
  );

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const exceptionSchema = z
  .object({
    date: isoDate,
    isClosed: z.boolean(),
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    reason: z.string().max(200).optional(),
  })
  .refine(
    (e) =>
      e.isClosed
        ? true
        : !!e.startTime && !!e.endTime && e.startTime < e.endTime,
    {
      message:
        "When isClosed is false, startTime and endTime are required and startTime must precede endTime",
      path: ["startTime"],
    }
  );

export type ExceptionInput = z.infer<typeof exceptionSchema>;
