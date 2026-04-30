-- Repair sequence-level nextScheduledAt values from the actual next scheduled
-- step. Older fast-forward logic could move an already-started sequence's
-- nextScheduledAt when another initial-touch step was fast-forwarded in the
-- same batch.

UPDATE "OutreachSequence"
SET
  "nextScheduledAt" = (
    SELECT MIN(st."scheduledFor")
    FROM "OutreachSequenceStep" st
    WHERE st."sequenceId" = "OutreachSequence"."id"
      AND st."status" = 'SCHEDULED'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" st
    WHERE st."sequenceId" = "OutreachSequence"."id"
      AND st."status" = 'SCHEDULED'
  )
  AND COALESCE("nextScheduledAt", '') != COALESCE((
    SELECT MIN(st."scheduledFor")
    FROM "OutreachSequenceStep" st
    WHERE st."sequenceId" = "OutreachSequence"."id"
      AND st."status" = 'SCHEDULED'
  ), '');
