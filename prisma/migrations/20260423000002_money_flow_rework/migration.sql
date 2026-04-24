-- Payment status: new intermediate state between capture and release.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING_RELEASE' AFTER 'HELD';

-- Transaction types: pending credit on capture, reversal on refund.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'PENDING_CREDIT' BEFORE 'EARNING';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'REFUND_REVERSAL';

-- Wallet: split single balance into available + pending buckets. Carry any
-- existing balance into available (those were fully-released funds under
-- the old model). pending starts at 0.
ALTER TABLE "Wallet" ADD COLUMN "availableInPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "pendingInPence" INTEGER NOT NULL DEFAULT 0;
UPDATE "Wallet" SET "availableInPence" = "balanceInPence";
ALTER TABLE "Wallet" DROP COLUMN "balanceInPence";

-- Report: new flag so admin sees which reports want a refund.
ALTER TABLE "Report" ADD COLUMN "requestRefund" BOOLEAN NOT NULL DEFAULT false;
