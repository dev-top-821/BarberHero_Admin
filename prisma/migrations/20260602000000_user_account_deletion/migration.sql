-- In-app account deletion (Apple App Store Guideline 5.1.1(v)).
-- Additive, nullable column — safe to apply to a populated table.
-- Soft-delete marker: set when a user deletes their own account. PII is
-- anonymised and the account is blocked in the same transaction; financial /
-- booking records are retained (anonymised) for accounting + audit.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
