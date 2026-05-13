-- Phase 1 CRM foundation: compact proposal/project fields and query indexes.

ALTER TABLE "Lead" ADD COLUMN "proposalValue" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "proposalStatus" TEXT;
ALTER TABLE "Lead" ADD COLUMN "packageRecommendation" TEXT;
ALTER TABLE "Lead" ADD COLUMN "launchTargetDate" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "projectOwner" TEXT;

CREATE INDEX IF NOT EXISTS "idx_Lead_dealStage_lastUpdated"
  ON "Lead"("dealStage", "lastUpdated");

CREATE INDEX IF NOT EXISTS "idx_Lead_nextActionDueAt"
  ON "Lead"("nextActionDueAt");

CREATE INDEX IF NOT EXISTS "idx_Lead_renewalDate"
  ON "Lead"("renewalDate");

CREATE INDEX IF NOT EXISTS "idx_Lead_outreachStatus_dealStage"
  ON "Lead"("outreachStatus", "dealStage");
