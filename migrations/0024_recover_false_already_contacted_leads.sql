-- Recover adequate leads that were falsely stopped by the unparenthesized OR
-- query-builder bug in the already-contacted guard. A lead is only recovered
-- when there is no sent OutreachEmail for either its lead id or exact recipient
-- address, so real already-contacted recipients stay protected.

UPDATE "Lead"
SET
  "outreachStatus" = 'READY_FOR_FIRST_TOUCH',
  "outreachChannel" = NULL,
  "nextFollowUpDue" = NULL,
  "lastUpdated" = CURRENT_TIMESTAMP
WHERE "firstContactedAt" IS NULL
  AND "lastContactedAt" IS NULL
  AND COALESCE("email", '') != ''
  AND COALESCE("isArchived", 0) = 0
  AND COALESCE("axiomScore", 0) >= 60
  AND LOWER(COALESCE("emailType", '')) != 'generic'
  AND COALESCE("disqualifyReason", '') = ''
  AND "outreachStatus" IN ('READY_FOR_FIRST_TOUCH', 'QUEUED', 'BLOCKED', 'NOT_CONTACTED', 'FOLLOW_UP_DUE')
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequence" s
    WHERE s."leadId" = "Lead"."id"
      AND s."status" = 'STOPPED'
      AND s."stopReason" = 'already_contacted'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "OutreachEmail" e
    WHERE e."status" = 'sent'
      AND (
        e."leadId" = "Lead"."id"
        OR LOWER(e."recipientEmail") = LOWER("Lead"."email")
      )
  );

UPDATE "OutreachSequence"
SET
  "stopReason" = 'already_contacted_false_positive_recovered',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'STOPPED'
  AND "stopReason" = 'already_contacted'
  AND EXISTS (
    SELECT 1
    FROM "Lead" l
    WHERE l."id" = "OutreachSequence"."leadId"
      AND l."firstContactedAt" IS NULL
      AND l."lastContactedAt" IS NULL
      AND COALESCE(l."email", '') != ''
      AND COALESCE(l."axiomScore", 0) >= 60
      AND LOWER(COALESCE(l."emailType", '')) != 'generic'
      AND COALESCE(l."disqualifyReason", '') = ''
      AND NOT EXISTS (
        SELECT 1
        FROM "OutreachEmail" e
        WHERE e."status" = 'sent'
          AND (
            e."leadId" = l."id"
            OR LOWER(e."recipientEmail") = LOWER(l."email")
          )
      )
  );

UPDATE "OutreachSequenceStep"
SET
  "errorMessage" = 'already_contacted_false_positive_recovered',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "errorMessage" = 'already_contacted'
  AND EXISTS (
    SELECT 1
    FROM "OutreachSequence" s
    WHERE s."id" = "OutreachSequenceStep"."sequenceId"
      AND s."stopReason" = 'already_contacted_false_positive_recovered'
  );
