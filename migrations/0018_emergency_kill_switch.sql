-- Emergency kill switch for autonomous outreach and intake.
-- Keeps the stop state in D1 so the app, cron, and UI can all honor it.

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "emergencyPaused" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "emergencyPausedAt" DATETIME;

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "emergencyPausedBy" TEXT;

ALTER TABLE "OutreachAutomationSetting"
ADD COLUMN "emergencyPauseReason" TEXT;

UPDATE "OutreachAutomationSetting"
SET
  "emergencyPaused" = 0,
  "emergencyPausedAt" = NULL,
  "emergencyPausedBy" = NULL,
  "emergencyPauseReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';
