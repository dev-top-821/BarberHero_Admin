-- Add partial-refund amount on Report.
ALTER TABLE "Report" ADD COLUMN "refundedAmountInPence" INTEGER;

-- Audit trail of Report state changes.
CREATE TABLE "ReportEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "toStatus" "ReportStatus",
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportEvent_reportId_createdAt_idx" ON "ReportEvent"("reportId", "createdAt");

ALTER TABLE "ReportEvent"
  ADD CONSTRAINT "ReportEvent_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing Report gets a synthetic CREATED event so the
-- timeline isn't blank for in-flight disputes.
INSERT INTO "ReportEvent" ("id", "reportId", "toStatus", "description", "actorId", "createdAt")
SELECT gen_random_uuid(), "id", 'OPEN', 'Dispute filed', "raisedById", "createdAt"
FROM "Report";

-- For already-resolved reports, add a synthetic resolution row so the
-- timeline shows two ticks rather than just the open event.
INSERT INTO "ReportEvent" ("id", "reportId", "toStatus", "description", "actorId", "createdAt")
SELECT
  gen_random_uuid(),
  r."id",
  r."status",
  CASE r."status"
    WHEN 'RESOLVED_REFUNDED'   THEN 'Resolved with refund'
    WHEN 'RESOLVED_NO_REFUND'  THEN 'Resolved without refund'
    WHEN 'REJECTED'            THEN 'Dispute rejected'
    WHEN 'UNDER_REVIEW'        THEN 'Marked under review'
    ELSE 'Status changed'
  END,
  r."resolvedById",
  COALESCE(r."resolvedAt", r."updatedAt")
FROM "Report" r
WHERE r."status" <> 'OPEN';
