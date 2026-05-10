-- Booking now carries the end of the appointment so the public availability
-- endpoint can detect duration-aware overlaps without re-summing services.
-- Backfill = startTime for legacy rows (treated as zero-duration); going
-- forward POST /bookings always sets it from the selected services.
ALTER TABLE "Booking" ADD COLUMN "endTime" TEXT;
UPDATE "Booking" SET "endTime" = "startTime" WHERE "endTime" IS NULL;
ALTER TABLE "Booking" ALTER COLUMN "endTime" SET NOT NULL;

-- One-off date overrides (holidays, sick days, partial-day overrides) that
-- sit on top of the recurring AvailabilitySlot grid.
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "barberProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvailabilityException_barberProfileId_date_key"
    ON "AvailabilityException"("barberProfileId", "date");

CREATE INDEX "AvailabilityException_barberProfileId_date_idx"
    ON "AvailabilityException"("barberProfileId", "date");

ALTER TABLE "AvailabilityException"
    ADD CONSTRAINT "AvailabilityException_barberProfileId_fkey"
    FOREIGN KEY ("barberProfileId") REFERENCES "BarberProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-barber slot granularity used by the public availability endpoint.
ALTER TABLE "BarberSettings"
    ADD COLUMN "slotGranularityMinutes" INTEGER NOT NULL DEFAULT 30;
