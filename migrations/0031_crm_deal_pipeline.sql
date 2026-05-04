-- Add CRM deal pipeline fields to Lead for post-outreach client management.
ALTER TABLE "Lead" ADD COLUMN "dealStage" TEXT;
ALTER TABLE "Lead" ADD COLUMN "engagementType" TEXT;
ALTER TABLE "Lead" ADD COLUMN "monthlyValue" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "projectStartDate" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "renewalDate" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "projectNotes" TEXT;
