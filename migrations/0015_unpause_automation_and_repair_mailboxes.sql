-- Turn the autonomous sender back on at the database gate and repair any
-- mailbox rows that drifted away from their Gmail connections.

UPDATE "OutreachAutomationSetting"
SET
  "enabled" = 1,
  "globalPaused" = 0,
  "schedulerClaimBatch" = CASE
    WHEN "schedulerClaimBatch" < 60 THEN 60
    ELSE "schedulerClaimBatch"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';

UPDATE "OutreachMailbox"
SET
  "gmailConnectionId" = (
    SELECT "GmailConnection"."id"
    FROM "GmailConnection"
    WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
    ORDER BY "GmailConnection"."updatedAt" DESC
    LIMIT 1
  ),
  "userId" = (
    SELECT "GmailConnection"."userId"
    FROM "GmailConnection"
    WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
    ORDER BY "GmailConnection"."updatedAt" DESC
    LIMIT 1
  ),
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "GmailConnection"
  WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
);

-- The previous production config left a few sequences blocked by daily caps.
-- Clear those transient blockers and make the next legitimate pending step
-- eligible for the next cron tick. This intentionally does not fast-forward
-- normal future follow-ups.
UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "scheduledFor" = CURRENT_TIMESTAMP,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT step."id"
  FROM "OutreachSequenceStep" step
  JOIN "OutreachSequence" seq ON seq."id" = step."sequenceId"
  WHERE seq."status" IN ('QUEUED','ACTIVE','SENDING')
    AND step."status" IN ('SCHEDULED','CLAIMED','SENDING','SKIPPED')
    AND (
      seq."stopReason" IN ('daily_cap_reached','global_daily_cap_reached')
      OR step."errorMessage" IN ('daily_cap_reached','global_daily_cap_reached')
    )
);

UPDATE "OutreachSequence"
SET
  "status" = CASE WHEN "status" = 'SENDING' THEN 'QUEUED' ELSE "status" END,
  "stopReason" = NULL,
  "nextScheduledAt" = (
    SELECT MIN(step."scheduledFor")
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SCHEDULED'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED','ACTIVE','SENDING')
  AND (
    "stopReason" IN ('daily_cap_reached','global_daily_cap_reached')
    OR EXISTS (
      SELECT 1
      FROM "OutreachSequenceStep" step
      WHERE step."sequenceId" = "OutreachSequence"."id"
        AND step."status" = 'SCHEDULED'
        AND step."errorMessage" IN ('daily_cap_reached','global_daily_cap_reached')
    )
  );
