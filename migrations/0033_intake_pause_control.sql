-- Manual intake pause control. Lets operators halt new lead scraping from the
-- UI without touching env vars or redeploying. Outreach continues normally.

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "intakePaused" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "intakePausedAt" DATETIME;

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "intakePausedBy" TEXT;

UPDATE "OutreachAutomationSetting"
SET
  "intakePaused" = 0,
  "intakePausedAt" = NULL,
  "intakePausedBy" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';
