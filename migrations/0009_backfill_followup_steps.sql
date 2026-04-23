-- Commit e74fda6 disabled follow-ups by returning [initial] from
-- buildScheduledTimeline, so every sequence queued since then has only
-- step 1. Code is now restored to schedule all 3 steps. This migration
-- backfills the missing FOLLOW_UP_1 / FOLLOW_UP_2 steps for sequences
-- that were queued during the broken window, and reactivates any that
-- were prematurely marked COMPLETED/EXHAUSTED.
--
-- Spacing: follow-up 1 is 2 calendar days after step 1; follow-up 2 is
-- 3 calendar days after follow-up 1. Matches the AutomationSettings
-- defaults (followUp1BusinessDays=2, followUp2BusinessDays=3) and
-- weekdaysOnly=false (24/7 operation).
--
-- Safety: we only touch QUEUED, ACTIVE, or COMPLETED/EXHAUSTED
-- sequences. STOPPED/REPLIED, STOPPED/MANUAL, STOPPED/BOUNCED, etc.
-- are left untouched — replied leads must not receive follow-ups.

-- Insert FOLLOW_UP_1 where missing
INSERT INTO "OutreachSequenceStep" (
  id, sequenceId, stepNumber, stepType, status, scheduledFor,
  attemptCount, createdAt, updatedAt
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + abs(random()) % 4, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))) AS id,
  s.id AS sequenceId,
  2 AS stepNumber,
  'FOLLOW_UP_1' AS stepType,
  'SCHEDULED' AS status,
  datetime(COALESCE(step1.sentAt, step1.scheduledFor), '+2 days') AS scheduledFor,
  0 AS attemptCount,
  CURRENT_TIMESTAMP AS createdAt,
  CURRENT_TIMESTAMP AS updatedAt
FROM "OutreachSequence" s
JOIN "OutreachSequenceStep" step1
  ON step1.sequenceId = s.id AND step1.stepNumber = 1
WHERE (
    s.status IN ('QUEUED','ACTIVE')
    OR (s.status = 'COMPLETED' AND s.stopReason = 'EXHAUSTED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "OutreachSequenceStep" s2
    WHERE s2.sequenceId = s.id AND s2.stepNumber = 2
  );

-- Insert FOLLOW_UP_2 where missing (runs after above, so step 2 now exists
-- for any sequence that needed it)
INSERT INTO "OutreachSequenceStep" (
  id, sequenceId, stepNumber, stepType, status, scheduledFor,
  attemptCount, createdAt, updatedAt
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', 1 + abs(random()) % 4, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))) AS id,
  s.id AS sequenceId,
  3 AS stepNumber,
  'FOLLOW_UP_2' AS stepType,
  'SCHEDULED' AS status,
  datetime(step2.scheduledFor, '+3 days') AS scheduledFor,
  0 AS attemptCount,
  CURRENT_TIMESTAMP AS createdAt,
  CURRENT_TIMESTAMP AS updatedAt
FROM "OutreachSequence" s
JOIN "OutreachSequenceStep" step2
  ON step2.sequenceId = s.id AND step2.stepNumber = 2
WHERE (
    s.status IN ('QUEUED','ACTIVE')
    OR (s.status = 'COMPLETED' AND s.stopReason = 'EXHAUSTED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "OutreachSequenceStep" s3
    WHERE s3.sequenceId = s.id AND s3.stepNumber = 3
  );

-- Reactivate sequences that were marked COMPLETED/EXHAUSTED but now have
-- pending follow-up steps. Point nextScheduledAt at the earliest SCHEDULED
-- step so the overview UI shows the correct next touch.
UPDATE "OutreachSequence"
SET
  status = 'ACTIVE',
  stopReason = NULL,
  nextScheduledAt = (
    SELECT MIN(scheduledFor) FROM "OutreachSequenceStep"
    WHERE sequenceId = "OutreachSequence".id AND status = 'SCHEDULED'
  ),
  updatedAt = CURRENT_TIMESTAMP
WHERE status = 'COMPLETED'
  AND stopReason = 'EXHAUSTED'
  AND EXISTS (
    SELECT 1 FROM "OutreachSequenceStep"
    WHERE sequenceId = "OutreachSequence".id AND status = 'SCHEDULED'
  );

-- Also refresh nextScheduledAt for QUEUED/ACTIVE sequences that just got
-- new follow-up steps (so the UI and claim query see them).
UPDATE "OutreachSequence"
SET
  nextScheduledAt = (
    SELECT MIN(scheduledFor) FROM "OutreachSequenceStep"
    WHERE sequenceId = "OutreachSequence".id AND status = 'SCHEDULED'
  ),
  updatedAt = CURRENT_TIMESTAMP
WHERE status IN ('QUEUED','ACTIVE')
  AND EXISTS (
    SELECT 1 FROM "OutreachSequenceStep"
    WHERE sequenceId = "OutreachSequence".id AND status = 'SCHEDULED'
  );
