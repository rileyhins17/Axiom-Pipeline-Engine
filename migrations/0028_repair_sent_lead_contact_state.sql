-- Repair queue starvation caused by sent recipients that still looked
-- uncontacted to the auto-queue scanner. Sent OutreachEmail rows are the
-- source of truth; matching leads should no longer compete for first touch.

UPDATE "Lead"
SET
  "firstContactedAt" = COALESCE(
    "firstContactedAt",
    (
      SELECT MIN(e."sentAt")
      FROM "OutreachEmail" e
      WHERE e."status" = 'sent'
        AND (
          e."leadId" = "Lead"."id"
          OR LOWER(e."recipientEmail") = LOWER("Lead"."email")
        )
    )
  ),
  "lastContactedAt" = COALESCE(
    (
      SELECT MAX(e."sentAt")
      FROM "OutreachEmail" e
      WHERE e."status" = 'sent'
        AND (
          e."leadId" = "Lead"."id"
          OR LOWER(e."recipientEmail") = LOWER("Lead"."email")
        )
    ),
    "lastContactedAt"
  ),
  "outreachChannel" = 'EMAIL',
  "outreachStatus" = CASE
    WHEN "outreachStatus" IN ('REPLIED', 'SUPPRESSED') THEN "outreachStatus"
    ELSE 'OUTREACHED'
  END,
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "OutreachEmail" e
  WHERE e."status" = 'sent'
    AND (
      e."leadId" = "Lead"."id"
      OR LOWER(e."recipientEmail") = LOWER("Lead"."email")
    )
)
AND (
  "firstContactedAt" IS NULL
  OR "lastContactedAt" IS NULL
  OR "outreachStatus" IN ('NOT_CONTACTED', 'ENRICHED', 'READY_FOR_FIRST_TOUCH')
);

-- Existing DB settings predate the higher production claim batch default.
-- Per-mailbox claiming and send caps still govern actual throughput.
UPDATE "OutreachAutomationSetting"
SET
  "schedulerClaimBatch" = CASE
    WHEN COALESCE("schedulerClaimBatch", 0) < 60 THEN 60
    ELSE "schedulerClaimBatch"
  END,
  "updatedAt" = CURRENT_TIMESTAMP;
