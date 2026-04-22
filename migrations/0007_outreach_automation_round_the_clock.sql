-- Switch automation to 24/7 sending and flush any backlog that was pushed
-- into the future by the previous 9:00-16:30 send window.

UPDATE "OutreachAutomationSetting"
SET
    "sendWindowStartHour" = 0,
    "sendWindowStartMinute" = 0,
    "sendWindowEndHour" = 23,
    "sendWindowEndMinute" = 59,
    "weekdaysOnly" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global';

-- Snap any SCHEDULED steps that were pushed beyond now (by adjustToAllowedSendWindow)
-- back to CURRENT_TIMESTAMP so the next cron tick flushes the backlog. Safe because
-- the scheduler still enforces per-mailbox daily/hourly caps and min delay between sends.
UPDATE "OutreachSequenceStep"
SET
    "scheduledFor" = CURRENT_TIMESTAMP,
    "errorMessage" = NULL
WHERE "status" = 'SCHEDULED'
  AND "scheduledFor" > CURRENT_TIMESTAMP;

UPDATE "OutreachSequence"
SET "nextScheduledAt" = CURRENT_TIMESTAMP
WHERE "nextScheduledAt" IS NOT NULL
  AND "nextScheduledAt" > CURRENT_TIMESTAMP
  AND "status" IN ('QUEUED','ACTIVE');
