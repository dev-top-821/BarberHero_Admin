-- AlterEnum: add INCOMPLETE as the new default entry state.
ALTER TYPE "BarberStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE' BEFORE 'PENDING';

-- AlterTable: change default and add new columns.
ALTER TABLE "BarberProfile" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';
ALTER TABLE "BarberProfile" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "BarberProfile" ADD COLUMN "submittedAt" TIMESTAMP(3);

