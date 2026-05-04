-- Add follow-up tracking, deal health, and client priority fields to Lead.
-- These extend the CRM pipeline (0031) with per-deal execution context.
ALTER TABLE "Lead" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Lead" ADD COLUMN "nextActionDueAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "lastReplyAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "dealHealth" TEXT;
ALTER TABLE "Lead" ADD COLUMN "dealLostReason" TEXT;
ALTER TABLE "Lead" ADD COLUMN "proposalSentAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "signedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "clientPriority" TEXT;
