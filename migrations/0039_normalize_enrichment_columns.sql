-- Add normalized enrichment columns to Lead table for direct querying.
-- These are extracted from the JSON enrichmentData blob during enrichment
-- and kept in sync on every enrichment update.

ALTER TABLE "Lead" ADD COLUMN "enrichmentValueProp" TEXT;
ALTER TABLE "Lead" ADD COLUMN "enrichmentPitchAngle" TEXT;
ALTER TABLE "Lead" ADD COLUMN "enrichmentKeyPainPoint" TEXT;
ALTER TABLE "Lead" ADD COLUMN "enrichmentEmailTone" TEXT;
ALTER TABLE "Lead" ADD COLUMN "enrichmentPersonalizedHook" TEXT;
ALTER TABLE "Lead" ADD COLUMN "enrichmentRecommendedCTA" TEXT;

-- Index for scoring/filtering queries that use enrichment fields
CREATE INDEX IF NOT EXISTS "idx_lead_enrichment_tone" ON "Lead" ("enrichmentEmailTone")
  WHERE "enrichmentEmailTone" IS NOT NULL;

-- Backfill existing enrichment data into the new columns
UPDATE "Lead"
SET
  "enrichmentValueProp" = json_extract("enrichmentData", '$.valueProposition'),
  "enrichmentPitchAngle" = json_extract("enrichmentData", '$.pitchAngle'),
  "enrichmentKeyPainPoint" = json_extract("enrichmentData", '$.keyPainPoint'),
  "enrichmentEmailTone" = json_extract("enrichmentData", '$.emailTone'),
  "enrichmentPersonalizedHook" = json_extract("enrichmentData", '$.personalizedHook'),
  "enrichmentRecommendedCTA" = json_extract("enrichmentData", '$.recommendedCTA')
WHERE "enrichmentData" IS NOT NULL AND "enrichmentData" != '';
