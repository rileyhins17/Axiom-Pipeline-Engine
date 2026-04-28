-- Clean up rows left by overlapping scheduler runs and reduce future overlap
-- with the app-level scheduler lock in this deploy.

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "scheduledFor" = CURRENT_TIMESTAMP,
  "errorMessage" = 'stale_claim_recovered',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('CLAIMED','SENDING');

UPDATE "OutreachRun"
SET
  "status" = 'FAILED',
  "finishedAt" = CURRENT_TIMESTAMP,
  "metadata" = '{"source":"scheduler","error":"overlapping running run recovered by migration 0017"}'
WHERE "status" = 'RUNNING';

UPDATE "OutreachAutomationSetting"
SET
  "enabled" = 1,
  "globalPaused" = 0,
  "schedulerClaimBatch" = 10,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';
