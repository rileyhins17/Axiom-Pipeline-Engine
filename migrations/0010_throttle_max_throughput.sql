-- Turn the automation engine up to production throughput. The previous
-- defaults were conservative warmup numbers (batch=4, 3-12 min initial
-- delay, 20/day per mailbox) that made emails trickle. This migration
-- aligns the live settings row with the new high-throughput defaults in
-- src/lib/automation-policy.ts:
--
--   schedulerClaimBatch        10  -> 25
--   initialDelayMinMinutes      3  ->  1
--   initialDelayMaxMinutes     12  ->  5
--
-- Combined with: cron *1 min, mailbox daily cap 40, hourly cap 12,
-- min delay 120s between sends per mailbox.

UPDATE "OutreachAutomationSetting"
SET
  "schedulerClaimBatch"     = 25,
  "initialDelayMinMinutes"  = 1,
  "initialDelayMaxMinutes"  = 5,
  "updatedAt"               = CURRENT_TIMESTAMP
WHERE "id" = 'global';

-- Pull scheduled steps that were queued with the old 3-12 min delay back
-- into the send window so the backlog flushes on the next tick instead of
-- sitting idle for another 10 min.
UPDATE "OutreachSequenceStep"
SET "scheduledFor" = CURRENT_TIMESTAMP
WHERE "status"        = 'SCHEDULED'
  AND "stepNumber"    = 1
  AND "scheduledFor"  > datetime(CURRENT_TIMESTAMP, '+6 minutes');

UPDATE "OutreachSequence"
SET "nextScheduledAt" = (
  SELECT MIN(scheduledFor) FROM "OutreachSequenceStep"
  WHERE sequenceId = "OutreachSequence".id AND status = 'SCHEDULED'
)
WHERE status IN ('QUEUED','ACTIVE');
