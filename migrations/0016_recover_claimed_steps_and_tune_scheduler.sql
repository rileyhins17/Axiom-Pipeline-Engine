-- Recover steps claimed by overlapping cron runs before provider timeouts and
-- one-per-mailbox claiming were added.

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "scheduledFor" = CURRENT_TIMESTAMP,
  "errorMessage" = 'stale_claim_recovered',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('CLAIMED','SENDING');

UPDATE "OutreachSequence"
SET
  "status" = CASE WHEN "status" = 'SENDING' THEN 'ACTIVE' ELSE "status" END,
  "nextScheduledAt" = (
    SELECT MIN(step."scheduledFor")
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SCHEDULED'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED','ACTIVE','SENDING')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SCHEDULED'
  );

UPDATE "OutreachRun"
SET
  "status" = 'FAILED',
  "finishedAt" = CURRENT_TIMESTAMP,
  "metadata" = '{"source":"scheduler","error":"stale running run recovered by migration 0016"}'
WHERE "status" = 'RUNNING'
  AND datetime("startedAt") <= datetime('now','-2 minutes');

UPDATE "OutreachAutomationSetting"
SET
  "enabled" = 1,
  "globalPaused" = 0,
  "schedulerClaimBatch" = 10,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';
