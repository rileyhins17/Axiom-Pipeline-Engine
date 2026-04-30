-- Hard safety rails for autonomous sending:
-- 1. one email record per automation step,
-- 2. one active owner per lead / recipient,
-- 3. stale recovered follow-ups get spaced from the actual prior send time.

CREATE UNIQUE INDEX IF NOT EXISTS "idx_outreach_email_sequence_step_once"
ON "OutreachEmail"("sequenceStepId")
WHERE "sequenceStepId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_outreach_email_recipient_status_sent"
ON "OutreachEmail"("recipientEmail", "status", "sentAt");

CREATE INDEX IF NOT EXISTS "idx_outreach_email_lead_status_sent"
ON "OutreachEmail"("leadId", "status", "sentAt");

CREATE INDEX IF NOT EXISTS "idx_outreach_sequence_lead_status"
ON "OutreachSequence"("leadId", "status");

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SKIPPED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = 'already_contacted',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "sequenceId" IN (
    SELECT seq."id"
    FROM "OutreachSequence" seq
    JOIN "Lead" lead ON lead."id" = seq."leadId"
    WHERE seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND lead."email" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "OutreachEmail" email
        WHERE email."status" = 'sent'
          AND LOWER(email."recipientEmail") = LOWER(lead."email")
          AND (email."sequenceId" IS NULL OR email."sequenceId" != seq."id")
      )
  );

UPDATE "OutreachSequence"
SET
  "status" = 'STOPPED',
  "stopReason" = 'already_contacted',
  "nextScheduledAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND EXISTS (
    SELECT 1
    FROM "Lead" lead
    JOIN "OutreachEmail" email
      ON LOWER(email."recipientEmail") = LOWER(lead."email")
    WHERE lead."id" = "OutreachSequence"."leadId"
      AND email."status" = 'sent'
      AND (email."sequenceId" IS NULL OR email."sequenceId" != "OutreachSequence"."id")
  );

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SKIPPED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = 'duplicate_active_sequence',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "sequenceId" IN (
    SELECT seq."id"
    FROM "OutreachSequence" seq
    JOIN "Lead" lead ON lead."id" = seq."leadId"
    WHERE seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND lead."email" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "OutreachSequence" keeper
        JOIN "Lead" keeperLead ON keeperLead."id" = keeper."leadId"
        WHERE keeper."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
          AND keeper."id" != seq."id"
          AND keeperLead."email" IS NOT NULL
          AND LOWER(keeperLead."email") = LOWER(lead."email")
          AND (
            datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) > datetime(COALESCE(seq."lastSentAt", seq."createdAt"))
            OR (
              datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) = datetime(COALESCE(seq."lastSentAt", seq."createdAt"))
              AND keeper."id" < seq."id"
            )
          )
      )
  );

UPDATE "OutreachSequence"
SET
  "status" = 'STOPPED',
  "stopReason" = 'duplicate_active_sequence',
  "nextScheduledAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND EXISTS (
    SELECT 1
    FROM "Lead" lead, "OutreachSequence" keeper
    JOIN "Lead" keeperLead ON keeperLead."id" = keeper."leadId"
    WHERE lead."id" = "OutreachSequence"."leadId"
      AND keeper."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND keeper."id" != "OutreachSequence"."id"
      AND lead."email" IS NOT NULL
      AND keeperLead."email" IS NOT NULL
      AND LOWER(keeperLead."email") = LOWER(lead."email")
      AND (
        datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) > datetime(COALESCE("OutreachSequence"."lastSentAt", "OutreachSequence"."createdAt"))
        OR (
          datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) = datetime(COALESCE("OutreachSequence"."lastSentAt", "OutreachSequence"."createdAt"))
          AND keeper."id" < "OutreachSequence"."id"
        )
      )
  );

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = (
    SELECT datetime(prev."sentAt", '+2 days')
    FROM "OutreachSequenceStep" prev
    WHERE prev."sequenceId" = "OutreachSequenceStep"."sequenceId"
      AND prev."stepNumber" = 1
      AND prev."status" = 'SENT'
    LIMIT 1
  ),
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "stepNumber" = 2
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" prev
    WHERE prev."sequenceId" = "OutreachSequenceStep"."sequenceId"
      AND prev."stepNumber" = 1
      AND prev."status" = 'SENT'
      AND datetime("OutreachSequenceStep"."scheduledFor") < datetime(prev."sentAt", '+2 days')
  );

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = (
    SELECT datetime(prev."sentAt", '+3 days')
    FROM "OutreachSequenceStep" prev
    WHERE prev."sequenceId" = "OutreachSequenceStep"."sequenceId"
      AND prev."stepNumber" = 2
      AND prev."status" = 'SENT'
    LIMIT 1
  ),
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "stepNumber" = 3
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" prev
    WHERE prev."sequenceId" = "OutreachSequenceStep"."sequenceId"
      AND prev."stepNumber" = 2
      AND prev."status" = 'SENT'
      AND datetime("OutreachSequenceStep"."scheduledFor") < datetime(prev."sentAt", '+3 days')
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
SET "nextFollowUpDue" = (
  SELECT MIN(step."scheduledFor")
  FROM "OutreachSequence" seq
  JOIN "OutreachSequenceStep" step ON step."sequenceId" = seq."id"
  WHERE seq."leadId" = "Lead"."id"
    AND seq."status" IN ('ACTIVE', 'SENDING')
    AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
    AND step."stepNumber" > 1
)
WHERE EXISTS (
  SELECT 1
  FROM "OutreachSequence" seq
  JOIN "OutreachSequenceStep" step ON step."sequenceId" = seq."id"
  WHERE seq."leadId" = "Lead"."id"
    AND seq."status" IN ('ACTIVE', 'SENDING')
    AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
    AND step."stepNumber" > 1
);
