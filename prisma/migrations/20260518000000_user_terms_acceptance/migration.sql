-- Customer-side Terms & Conditions / Privacy Policy acceptance.
-- Additive, nullable columns — safe to apply to a populated table.
-- NOT YET DEPLOYED: applied by `prisma migrate deploy` on the next
-- authorised release (gated on the client's final legal text + go-ahead).
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
