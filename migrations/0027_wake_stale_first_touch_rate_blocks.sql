-- Wake first-touch leads that were pushed far into the future by transient
-- rate-limit blocks. Runtime gates still enforce live caps before any send, so
-- this only makes eligible first touches re-check instead of sleeping for
-- hours after the cap/cooldown window has already reset.

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = CURRENT_TIMESTAMP,
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "stepNumber" = 1
  AND "status" = 'SCHEDULED'
  AND "errorMessage" IN (
    'global_daily_cap_reached',
    'daily_cap_reached',
    'hourly_cap_reached',
    'mailbox_cooldown'
  )
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequence" s
    JOIN "Lead" l ON l."id" = s."leadId"
    WHERE s."id" = "OutreachSequenceStep"."sequenceId"
      AND s."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND l."firstContactedAt" IS NULL
      AND l."lastContactedAt" IS NULL
      AND COALESCE(l."email", '') != ''
      AND COALESCE(l."isArchived", 0) = 0
      AND COALESCE(l."axiomScore", 0) >= 45
      AND LOWER(COALESCE(l."emailType", '')) != 'generic'
      AND COALESCE(l."disqualifyReason", '') = ''
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
  AND "stopReason" IN (
    'global_daily_cap_reached',
    'daily_cap_reached',
    'hourly_cap_reached',
    'mailbox_cooldown'
  )
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" st
    JOIN "Lead" l ON l."id" = "OutreachSequence"."leadId"
    WHERE st."sequenceId" = "OutreachSequence"."id"
      AND st."stepNumber" = 1
      AND st."status" = 'SCHEDULED'
      AND st."errorMessage" IS NULL
      AND l."firstContactedAt" IS NULL
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
