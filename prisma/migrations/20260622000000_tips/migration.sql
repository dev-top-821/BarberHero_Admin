-- Customer tipping after service completion.
--
-- A tip is a separate Stripe PaymentIntent (the booking charge is already
-- captured by completion time), settled with immediate capture and credited
-- 100% to the barber's `available` wallet balance — no platform fee, no 24h
-- hold (a voluntary gratuity has no service to dispute).

-- New ledger entry type for the wallet transaction history. Additive enum
-- value; not used inside this migration, so no in-transaction-usage issue.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'TIP';

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED');

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "barberProfileId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amountInPence" INTEGER NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tip_stripePaymentIntentId_key" ON "Tip"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Tip_bookingId_idx" ON "Tip"("bookingId");

-- CreateIndex
CREATE INDEX "Tip_barberProfileId_idx" ON "Tip"("barberProfileId");

-- CreateIndex
CREATE INDEX "Tip_stripePaymentIntentId_idx" ON "Tip"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_barberProfileId_fkey" FOREIGN KEY ("barberProfileId") REFERENCES "BarberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
