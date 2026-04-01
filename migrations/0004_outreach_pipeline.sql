-- Add outreach workflow fields to Lead for contacted-lead management.
ALTER TABLE "Lead" ADD COLUMN "outreachStatus" TEXT NOT NULL DEFAULT 'NOT_CONTACTED';
ALTER TABLE "Lead" ADD COLUMN "outreachChannel" TEXT;
ALTER TABLE "Lead" ADD COLUMN "firstContactedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "lastContactedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "nextFollowUpDue" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "outreachNotes" TEXT;
