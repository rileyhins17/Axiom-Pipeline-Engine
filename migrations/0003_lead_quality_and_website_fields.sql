-- Add website and quality metadata to Lead for improved export quality.
ALTER TABLE "Lead" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Lead" ADD COLUMN "websiteDomain" TEXT;
ALTER TABLE "Lead" ADD COLUMN "emailFlags" TEXT;
ALTER TABLE "Lead" ADD COLUMN "phoneFlags" TEXT;
