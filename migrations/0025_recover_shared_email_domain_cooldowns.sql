-- Domain cooldown used to key off recipient email domains. That incorrectly
-- blocked first touches for viable leads using shared inbox providers like
-- Hotmail or Outlook. Bring those first-touch steps back into the immediate
-- queue; the fixed runtime guard will re-check real business domains.

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = CURRENT_TIMESTAMP,
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "stepNumber" = 1
  AND "status" = 'SCHEDULED'
  AND "errorMessage" = 'domain_cooldown_active'
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequence" s
    JOIN "Lead" l ON l."id" = s."leadId"
    WHERE s."id" = "OutreachSequenceStep"."sequenceId"
      AND s."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND l."firstContactedAt" IS NULL
      AND l."lastContactedAt" IS NULL
      AND COALESCE(l."email", '') != ''
      AND NOT EXISTS (
        SELECT 1
        FROM "OutreachEmail" e
        WHERE e."status" = 'sent'
          AND (
            e."leadId" = l."id"
            OR LOWER(e."recipientEmail") = LOWER(l."email")
          )
      )
  );

UPDATE "OutreachSequence"
SET
  "nextScheduledAt" = CURRENT_TIMESTAMP,
  "stopReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND "stopReason" = 'domain_cooldown_active'
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" st
    WHERE st."sequenceId" = "OutreachSequence"."id"
      AND st."stepNumber" = 1
      AND st."status" = 'SCHEDULED'
      AND st."errorMessage" IS NULL
  );

-- Keep exact reply suppression intact, but never suppress every lead on a
-- shared provider domain.
UPDATE "OutreachSuppression"
SET "domain" = NULL
WHERE LOWER(COALESCE("domain", '')) IN (
    'aol.com',
    'fastmail.com',
    'gmail.com',
    'googlemail.com',
    'hey.com',
    'icloud.com',
    'live.com',
    'mail.com',
    'me.com',
    'msn.com',
    'outlook.com',
    'pm.me',
    'proton.me',
    'protonmail.com',
    'tutanota.com',
    'yahoo.com',
    'ymail.com',
    'zoho.com'
  )
  OR LOWER(COALESCE("domain", '')) LIKE 'aol.%'
  OR LOWER(COALESCE("domain", '')) LIKE 'hotmail.%'
  OR LOWER(COALESCE("domain", '')) LIKE 'live.%'
  OR LOWER(COALESCE("domain", '')) LIKE 'outlook.%'
  OR LOWER(COALESCE("domain", '')) LIKE 'rocketmail.%'
  OR LOWER(COALESCE("domain", '')) LIKE 'yahoo.%';
