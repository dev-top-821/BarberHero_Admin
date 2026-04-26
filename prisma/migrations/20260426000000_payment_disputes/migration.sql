-- Payment status: terminal state set when Stripe fires `charge.dispute.created`.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

-- Transaction type: distinguishes wallet reversals caused by an external
-- card-issuer dispute from internal admin-issued refunds.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DISPUTE_REVERSAL';
