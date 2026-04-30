-- Do not let recovered legacy sequences send to leads that already received a
-- manual/other email, and keep only one active automation sequence per lead.

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
    WHERE seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND EXISTS (
        SELECT 1
        FROM "OutreachEmail" email
        WHERE email."leadId" = seq."leadId"
          AND email."status" = 'sent'
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
    FROM "OutreachEmail" email
    WHERE email."leadId" = "OutreachSequence"."leadId"
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
    WHERE seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND EXISTS (
        SELECT 1
        FROM "OutreachSequence" keeper
        WHERE keeper."leadId" = seq."leadId"
          AND keeper."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
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
    FROM "OutreachSequence" keeper
    WHERE keeper."leadId" = "OutreachSequence"."leadId"
      AND keeper."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
      AND (
        datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) > datetime(COALESCE("OutreachSequence"."lastSentAt", "OutreachSequence"."createdAt"))
        OR (
          datetime(COALESCE(keeper."lastSentAt", keeper."createdAt")) = datetime(COALESCE("OutreachSequence"."lastSentAt", "OutreachSequence"."createdAt"))
          AND keeper."id" < "OutreachSequence"."id"
        )
      )
  );
