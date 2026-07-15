-- Moves ChatRoom from being keyed 1:1 on Booking to being a persistent
-- thread per (barberId, customerId) pair, and merges any existing
-- duplicate rooms between the same two people into one.
--
-- Runs as a single transaction (Prisma's default for a migration.sql on
-- Postgres) — if anything below fails, the whole migration rolls back and
-- the database is left exactly as it was.

-- ── Step 1: additive columns, nullable for now ──────────────────────────

ALTER TABLE "ChatRoom" ADD COLUMN "barberId" TEXT;
ALTER TABLE "ChatRoom" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "chatRoomId" TEXT;

-- Backfill the new columns from the existing 1:1 booking link.
UPDATE "ChatRoom" cr
SET "barberId" = b."barberId", "customerId" = b."customerId"
FROM "Booking" b
WHERE b.id = cr."bookingId";

UPDATE "Booking" b
SET "chatRoomId" = cr.id
FROM "ChatRoom" cr
WHERE cr."bookingId" = b.id;

-- ── Step 2: merge duplicate rooms per (barberId, customerId) ────────────
-- Every booking used to create its own room, so the same two people
-- re-booking each other ends up with several rooms here. Pick the oldest
-- per pair as canonical and fold the rest into it.

-- Carry forward the most recent read-state from any duplicate onto the
-- canonical room, so unread counts stay accurate for whichever room
-- (canonical or not) a party had actually been reading.
UPDATE "ChatRoom" canon
SET
  "customerLastReadAt" = dup.max_customer_read,
  "barberLastReadAt" = dup.max_barber_read
FROM (
  SELECT "barberId", "customerId",
         MAX("customerLastReadAt") AS max_customer_read,
         MAX("barberLastReadAt") AS max_barber_read
  FROM "ChatRoom"
  GROUP BY "barberId", "customerId"
) dup
WHERE canon."barberId" = dup."barberId" AND canon."customerId" = dup."customerId";

WITH ranked AS (
  SELECT id, "barberId", "customerId",
         ROW_NUMBER() OVER (
           PARTITION BY "barberId", "customerId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "ChatRoom"
),
canonical AS (
  SELECT "barberId", "customerId", id AS canonical_id FROM ranked WHERE rn = 1
)
UPDATE "ChatMessage" m
SET "chatRoomId" = c.canonical_id
FROM "ChatRoom" cr
JOIN canonical c ON c."barberId" = cr."barberId" AND c."customerId" = cr."customerId"
WHERE m."chatRoomId" = cr.id AND cr.id <> c.canonical_id;

WITH ranked AS (
  SELECT id, "barberId", "customerId",
         ROW_NUMBER() OVER (
           PARTITION BY "barberId", "customerId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "ChatRoom"
),
canonical AS (
  SELECT "barberId", "customerId", id AS canonical_id FROM ranked WHERE rn = 1
)
UPDATE "Booking" bk
SET "chatRoomId" = c.canonical_id
FROM "ChatRoom" cr
JOIN canonical c ON c."barberId" = cr."barberId" AND c."customerId" = cr."customerId"
WHERE bk."chatRoomId" = cr.id AND cr.id <> c.canonical_id;

WITH ranked AS (
  SELECT id, "barberId", "customerId",
         ROW_NUMBER() OVER (
           PARTITION BY "barberId", "customerId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "ChatRoom"
),
canonical AS (
  SELECT "barberId", "customerId", id AS canonical_id FROM ranked WHERE rn = 1
)
DELETE FROM "ChatRoom" cr
USING canonical c
WHERE cr."barberId" = c."barberId" AND cr."customerId" = c."customerId" AND cr.id <> c.canonical_id;

-- ── Step 3: tighten schema now that data is clean ────────────────────────

ALTER TABLE "ChatRoom" ALTER COLUMN "barberId" SET NOT NULL;
ALTER TABLE "ChatRoom" ALTER COLUMN "customerId" SET NOT NULL;

ALTER TABLE "ChatRoom" DROP CONSTRAINT "ChatRoom_bookingId_fkey";
DROP INDEX "ChatRoom_bookingId_key";
ALTER TABLE "ChatRoom" DROP COLUMN "bookingId";

CREATE INDEX "Booking_chatRoomId_idx" ON "Booking"("chatRoomId");
CREATE UNIQUE INDEX "ChatRoom_barberId_customerId_key" ON "ChatRoom"("barberId", "customerId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_chatRoomId_fkey"
  FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_barberId_fkey"
  FOREIGN KEY ("barberId") REFERENCES "BarberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
