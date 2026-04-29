-- Recover the outreach sender queue from rows that can monopolize a mailbox.
-- The scheduler intentionally claims one due step per mailbox per tick. If a
-- blocked or crashed step remains due immediately, that mailbox never reaches
-- later sendable leads.

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = COALESCE("errorMessage", 'stale_sender_claim_recovered'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('CLAIMED', 'SENDING');

UPDATE "OutreachSequence"
SET
  "status" = CASE WHEN "lastSentAt" IS NULL THEN 'QUEUED' ELSE 'ACTIVE' END,
  "stopReason" = COALESCE("stopReason", 'stale_sender_claim_recovered'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SENDING';

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = datetime('now', '+1 hour'),
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SCHEDULED'
  AND datetime("scheduledFor") <= datetime('now')
  AND "errorMessage" IN ('missing_enrichment', 'mailbox_disconnected', 'mailbox_disabled', 'hourly_cap_reached');

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = datetime('now', '+6 hours'),
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SCHEDULED'
  AND datetime("scheduledFor") <= datetime('now')
  AND "errorMessage" IN ('generation_failed_retryable', 'send_failed_retryable');

UPDATE "OutreachSequenceStep"
SET
  "scheduledFor" = datetime('now', '+24 hours'),
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SCHEDULED'
  AND datetime("scheduledFor") <= datetime('now')
  AND "errorMessage" IN (
    'below_send_min_score',
    'domain_cooldown_active',
    'global_daily_cap_reached',
    'daily_cap_reached'
  );

UPDATE "OutreachSequenceStep"
SET
  "errorMessage" = CASE WHEN "errorMessage" = 'generic_email_blocked' THEN 'policy_ineligible' ELSE "errorMessage" END,
  "status" = 'SKIPPED',
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SCHEDULED'
  AND "errorMessage" IN (
    'missing_valid_email',
    'policy_ineligible',
    'generic_email_blocked',
    'blocked_segment',
    'blocked_email_domain',
    'hard_disqualified',
    'suppressed'
  );

UPDATE "OutreachSequence"
SET
  "status" = 'STOPPED',
  "nextScheduledAt" = NULL,
  "stopReason" = COALESCE((
    SELECT step."errorMessage"
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SKIPPED'
      AND step."errorMessage" IN (
        'missing_valid_email',
        'policy_ineligible',
        'blocked_segment',
        'blocked_email_domain',
        'hard_disqualified',
        'suppressed'
      )
    ORDER BY step."stepNumber" ASC
    LIMIT 1
  ), "stopReason", 'policy_ineligible'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SKIPPED'
      AND step."errorMessage" IN (
        'missing_valid_email',
        'policy_ineligible',
        'blocked_segment',
        'blocked_email_domain',
        'hard_disqualified',
        'suppressed'
      )
  );

UPDATE "OutreachSequence"
SET
  "nextScheduledAt" = (
    SELECT MIN(step."scheduledFor")
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SCHEDULED'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" = 'SCHEDULED'
  );
