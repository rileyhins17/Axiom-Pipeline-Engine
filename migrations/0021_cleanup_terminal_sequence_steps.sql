-- Terminal sequences must not leave due sender steps behind. Those old rows can
-- occupy the scheduler's earliest due window and starve active first touches.

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SKIPPED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = 'terminal_sequence_cleaned',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('SCHEDULED', 'CLAIMED', 'SENDING')
  AND "sequenceId" IN (
    SELECT "id"
    FROM "OutreachSequence"
    WHERE "status" IN ('STOPPED', 'FAILED', 'COMPLETED')
  );

UPDATE "OutreachSequence"
SET
  "nextScheduledAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('STOPPED', 'FAILED', 'COMPLETED')
  AND "nextScheduledAt" IS NOT NULL;
