-- Repair Gmail connection state after the multi-mailbox rollout.
-- Some environments can still have the old one-Gmail-connection-per-user
-- index or stale mailbox rows without a GmailConnection link.

DROP INDEX IF EXISTS "GmailConnection_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "GmailConnection_userId_gmailAddress_key" ON "GmailConnection"("userId", "gmailAddress");

UPDATE "GmailConnection"
SET
  "gmailAddress" = lower(trim("gmailAddress")),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "gmailAddress" != lower(trim("gmailAddress"));

UPDATE "OutreachMailbox"
SET
  "gmailAddress" = lower(trim("gmailAddress")),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "gmailAddress" != lower(trim("gmailAddress"));

UPDATE "OutreachMailbox"
SET
  "gmailConnectionId" = (
    SELECT "GmailConnection"."id"
    FROM "GmailConnection"
    WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
    ORDER BY "GmailConnection"."updatedAt" DESC
    LIMIT 1
  ),
  "userId" = (
    SELECT "GmailConnection"."userId"
    FROM "GmailConnection"
    WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
    ORDER BY "GmailConnection"."updatedAt" DESC
    LIMIT 1
  ),
  "status" = CASE
    WHEN "status" IN ('DISCONNECTED', 'ERROR') THEN 'ACTIVE'
    ELSE "status"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "GmailConnection"
  WHERE lower("GmailConnection"."gmailAddress") = lower("OutreachMailbox"."gmailAddress")
);

INSERT OR IGNORE INTO "OutreachMailbox" (
  "id",
  "userId",
  "gmailConnectionId",
  "gmailAddress",
  "label",
  "status",
  "timezone",
  "dailyLimit",
  "hourlyLimit",
  "minDelaySeconds",
  "maxDelaySeconds",
  "warmupLevel",
  "updatedAt"
)
SELECT
  lower(hex(randomblob(16))),
  "GmailConnection"."userId",
  "GmailConnection"."id",
  lower(trim("GmailConnection"."gmailAddress")),
  substr("GmailConnection"."gmailAddress", 1, instr("GmailConnection"."gmailAddress", '@') - 1),
  'ACTIVE',
  'America/Toronto',
  20,
  5,
  600,
  1800,
  0,
  CURRENT_TIMESTAMP
FROM "GmailConnection"
WHERE NOT EXISTS (
  SELECT 1
  FROM "OutreachMailbox"
  WHERE
    lower("OutreachMailbox"."gmailAddress") = lower("GmailConnection"."gmailAddress")
    OR "OutreachMailbox"."gmailConnectionId" = "GmailConnection"."id"
);
