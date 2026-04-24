-- Add barber bank-details columns.
ALTER TABLE "BarberProfile" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "BarberProfile" ADD COLUMN "bankSortCode" TEXT;
ALTER TABLE "BarberProfile" ADD COLUMN "bankAccountNumber" TEXT;

-- Reversal ledger type for failed withdrawals.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REVERSAL';

-- Withdrawal lifecycle enum.
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Withdrawal requests table.
CREATE TABLE "WithdrawalRequest" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "amountInPence" INTEGER NOT NULL,
  "feeInPence" INTEGER NOT NULL,
  "netInPence" INTEGER NOT NULL,
  "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
  "bankAccountName" TEXT NOT NULL,
  "bankSortCode" TEXT NOT NULL,
  "bankAccountNumber" TEXT NOT NULL,
  "bankReference" TEXT,
  "adminNote" TEXT,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WithdrawalRequest_walletId_idx" ON "WithdrawalRequest"("walletId");
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");
CREATE INDEX "WithdrawalRequest_createdAt_idx" ON "WithdrawalRequest"("createdAt");

ALTER TABLE "WithdrawalRequest"
  ADD CONSTRAINT "WithdrawalRequest_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
