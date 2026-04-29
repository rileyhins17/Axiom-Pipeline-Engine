-- Re-open adequate uncontacted leads that were stranded by the old queue/send
-- score split. Adequate means the same production intake definition:
-- score >= 45, non-D, non-generic email, not archived, not hard-blocked.

UPDATE "OutreachSequenceStep"
SET
  "status" = 'SCHEDULED',
  "scheduledFor" = CURRENT_TIMESTAMP,
  "claimedAt" = NULL,
  "claimedByRunId" = NULL,
  "errorMessage" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "sequenceId" IN (
  SELECT seq."id"
  FROM "OutreachSequence" seq
  JOIN "Lead" lead ON lead."id" = seq."leadId"
  WHERE lead."firstContactedAt" IS NULL
    AND COALESCE(lead."isArchived", 0) = 0
    AND lead."axiomScore" >= 45
    AND COALESCE(lead."axiomTier", '') != 'D'
    AND COALESCE(lead."email", '') != ''
    AND LOWER(COALESCE(lead."emailType", '')) != 'generic'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.gov'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.gov.ca'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.gov.us'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.gc.ca'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.edu'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.mil'
    AND LOWER(COALESCE(lead."email", '')) NOT LIKE '%.k12.us'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%government%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%municipal%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%city of%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%school%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%university%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%college%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%walmart%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%costco%'
    AND LOWER(COALESCE(lead."businessName", '') || ' ' || COALESCE(lead."category", '')) NOT LIKE '%mcdonald%'
    AND NOT EXISTS (
      SELECT 1
      FROM "OutreachSuppression" suppression
      WHERE LOWER(COALESCE(suppression."email", '')) = LOWER(lead."email")
         OR LOWER(COALESCE(suppression."domain", '')) = LOWER(substr(lead."email", instr(lead."email", '@') + 1))
    )
)
  AND "status" IN ('SCHEDULED', 'SKIPPED', 'BLOCKED')
  AND COALESCE("errorMessage", '') IN (
    '',
    'below_send_min_score',
    'generation_failed_retryable',
    'send_failed_retryable',
    'stale_sender_claim_recovered',
    'stale_claim_recovered'
  );

UPDATE "OutreachSequence"
SET
  "status" = CASE WHEN "lastSentAt" IS NULL THEN 'QUEUED' ELSE 'ACTIVE' END,
  "nextScheduledAt" = CURRENT_TIMESTAMP,
  "stopReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT seq."id"
  FROM "OutreachSequence" seq
  JOIN "Lead" lead ON lead."id" = seq."leadId"
  WHERE lead."firstContactedAt" IS NULL
    AND COALESCE(lead."isArchived", 0) = 0
    AND lead."axiomScore" >= 45
    AND COALESCE(lead."axiomTier", '') != 'D'
    AND COALESCE(lead."email", '') != ''
    AND LOWER(COALESCE(lead."emailType", '')) != 'generic'
    AND seq."status" IN ('QUEUED', 'ACTIVE', 'SENDING')
    AND COALESCE(seq."stopReason", '') IN (
      '',
      'below_send_min_score',
      'generation_failed_retryable',
      'send_failed_retryable',
      'stale_sender_claim_recovered',
      'stale_claim_recovered'
    )
);

UPDATE "OutreachSequence"
SET
  "status" = 'FAILED',
  "nextScheduledAt" = NULL,
  "stopReason" = 'empty_sequence_recovered_for_requeue',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING', 'COMPLETED')
  AND "lastSentAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "OutreachSequenceStep" step
    WHERE step."sequenceId" = "OutreachSequence"."id"
      AND step."status" IN ('SCHEDULED', 'CLAIMED', 'SENDING', 'SENT')
  );

UPDATE "Lead"
SET
  "outreachStatus" = 'READY_FOR_FIRST_TOUCH',
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE "firstContactedAt" IS NULL
  AND "enrichedAt" IS NOT NULL
  AND "enrichmentData" IS NOT NULL
  AND COALESCE("isArchived", 0) = 0
  AND "axiomScore" >= 45
  AND COALESCE("axiomTier", '') != 'D'
  AND COALESCE("email", '') != ''
  AND LOWER(COALESCE("emailType", '')) != 'generic'
  AND COALESCE("outreachStatus", '') NOT IN ('REPLIED', 'SUPPRESSED');

UPDATE "Lead"
SET
  "outreachStatus" = 'NOT_CONTACTED',
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE "firstContactedAt" IS NULL
  AND ("enrichedAt" IS NULL OR "enrichmentData" IS NULL)
  AND COALESCE("isArchived", 0) = 0
  AND "axiomScore" >= 45
  AND COALESCE("axiomTier", '') != 'D'
  AND COALESCE("email", '') != ''
  AND LOWER(COALESCE("emailType", '')) != 'generic'
  AND COALESCE("outreachStatus", '') NOT IN ('REPLIED', 'SUPPRESSED');
