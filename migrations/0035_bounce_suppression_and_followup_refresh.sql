-- Stop legacy sequences that are still scheduled after a delivery failure,
-- and force any unsent follow-up drafts to regenerate from current lead data.

INSERT INTO "OutreachSuppression" (
  "id",
  "email",
  "domain",
  "reason",
  "source",
  "leadId",
  "sequenceId",
  "createdAt",
  "expiresAt"
)
SELECT
  lower(hex(randomblob(16))),
  lower(trim(lead."email")),
  '',
  'Legacy bounced lead suppression',
  'BOUNCE',
  lead."id",
  NULL,
  CURRENT_TIMESTAMP,
  NULL
FROM "Lead" lead
WHERE lead."email" IS NOT NULL
  AND trim(lead."email") != ''
  AND (
    lower(COALESCE(lead."emailFlags", '')) LIKE '%bounced%'
    OR lead."outreachStatus" = 'BOUNCED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "OutreachSuppression" existing
    WHERE lower(COALESCE(existing."email", '')) = lower(trim(lead."email"))
  );

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SKIPPED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = 'bounced_or_suppressed_recipient',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "sequenceId" IN (
    SELECT seq."id"
    FROM "OutreachSequence" seq
    JOIN "Lead" lead ON lead."id" = seq."leadId"
    WHERE seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING', 'PAUSED')
      AND lead."email" IS NOT NULL
      AND (
        lower(COALESCE(lead."emailFlags", '')) LIKE '%bounced%'
        OR lead."outreachStatus" = 'BOUNCED'
        OR EXISTS (
          SELECT 1
          FROM "OutreachSuppression" suppression
          WHERE (
            suppression."email" IS NOT NULL
            AND lower(suppression."email") = lower(trim(lead."email"))
          )
          OR (
            suppression."domain" IS NOT NULL
            AND trim(suppression."domain") != ''
            AND (
              lower(suppression."domain") = lower(COALESCE(lead."websiteDomain", ''))
              OR lower(suppression."domain") = lower(substr(lead."email", instr(lead."email", '@') + 1))
            )
          )
        )
      )
  );

UPDATE "OutreachSequence"
SET
  "status" = 'STOPPED',
  "stopReason" = 'BOUNCED',
  "nextScheduledAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING', 'PAUSED')
  AND EXISTS (
    SELECT 1
    FROM "Lead" lead
    WHERE lead."id" = "OutreachSequence"."leadId"
      AND lead."email" IS NOT NULL
      AND (
        lower(COALESCE(lead."emailFlags", '')) LIKE '%bounced%'
        OR lead."outreachStatus" = 'BOUNCED'
        OR EXISTS (
          SELECT 1
          FROM "OutreachSuppression" suppression
          WHERE (
            suppression."email" IS NOT NULL
            AND lower(suppression."email") = lower(trim(lead."email"))
          )
          OR (
            suppression."domain" IS NOT NULL
            AND trim(suppression."domain") != ''
            AND (
              lower(suppression."domain") = lower(COALESCE(lead."websiteDomain", ''))
              OR lower(suppression."domain") = lower(substr(lead."email", instr(lead."email", '@') + 1))
            )
          )
        )
      )
  );

UPDATE "Lead"
SET
  "outreachStatus" = 'BOUNCED',
  "emailFlags" = CASE
    WHEN lower(COALESCE("emailFlags", '')) LIKE '%bounced%' THEN "emailFlags"
    WHEN COALESCE("emailFlags", '') = '' THEN 'bounced'
    ELSE "emailFlags" || ',bounced'
  END,
  "nextFollowUpDue" = NULL,
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE "email" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "OutreachSuppression" suppression
    WHERE suppression."source" IN ('BOUNCE', 'NO_MX')
      AND suppression."email" IS NOT NULL
      AND lower(suppression."email") = lower(trim("Lead"."email"))
  );

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "subject" = NULL,
  "bodyHtml" = NULL,
  "bodyPlain" = NULL,
  "generationModel" = NULL,
  "errorMessage" = 'regenerate_followup_current_context',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "stepNumber" > 1
  AND (
    "subject" IS NOT NULL
    OR "bodyHtml" IS NOT NULL
    OR "bodyPlain" IS NOT NULL
    OR "generationModel" IS NOT NULL
  )
  AND "sequenceId" IN (
    SELECT "id"
    FROM "OutreachSequence"
    WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  );

UPDATE "OutreachSequence"
SET
  "nextScheduledAt" = (
    SELECT MIN(step."scheduledFor")
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  );

UPDATE "Lead"
SET
  "nextFollowUpDue" = (
    SELECT MIN(step."scheduledFor")
    FROM "OutreachSequence" seq
    JOIN "OutreachSequenceStep" step ON step."sequenceId" = seq."id"
    WHERE seq."leadId" = "Lead"."id"
      AND seq."status" IN ('ACTIVE', 'SENDING')
      AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
      AND step."stepNumber" > 1
  ),
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE "outreachStatus" != 'BOUNCED'
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequence" seq
    JOIN "OutreachSequenceStep" step ON step."sequenceId" = seq."id"
    WHERE seq."leadId" = "Lead"."id"
      AND seq."status" IN ('ACTIVE', 'SENDING')
      AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
      AND step."stepNumber" > 1
  );
