-- Role inboxes (info@, contact@, hello@, sales@) burn sender reputation
-- without producing replies. The code now rejects emailType='generic'
-- from both auto-queue and manual queue, but there are already live
-- sequences pointed at these inboxes that need to be stopped so they
-- don't keep firing follow-ups.
--
-- Also: mark any SCHEDULED steps in those sequences as SKIPPED so the
-- scheduler doesn't claim them, and clear nextScheduledAt on the parent
-- sequence so the UI reflects the stopped state.

UPDATE "OutreachSequenceStep"
SET
  status = 'SKIPPED',
  errorMessage = 'recipient_is_generic_inbox',
  updatedAt = CURRENT_TIMESTAMP
WHERE status = 'SCHEDULED'
  AND sequenceId IN (
    SELECT s.id FROM "OutreachSequence" s
    JOIN "Lead" l ON l.id = s.leadId
    WHERE lower(COALESCE(l.emailType, '')) = 'generic'
      AND s.status IN ('QUEUED','ACTIVE')
  );

UPDATE "OutreachSequence"
SET
  status = 'STOPPED',
  stopReason = 'GENERIC_INBOX',
  nextScheduledAt = NULL,
  updatedAt = CURRENT_TIMESTAMP
WHERE status IN ('QUEUED','ACTIVE')
  AND leadId IN (
    SELECT id FROM "Lead" WHERE lower(COALESCE(emailType, '')) = 'generic'
  );
