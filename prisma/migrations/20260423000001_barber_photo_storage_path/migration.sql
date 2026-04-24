-- BarberPhoto: track the storage path so we can clean up the Storage blob
-- when a photo row is deleted.
ALTER TABLE "BarberPhoto" ADD COLUMN "storagePath" TEXT;
