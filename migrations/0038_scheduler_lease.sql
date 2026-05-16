CREATE TABLE IF NOT EXISTS "SchedulerLease" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "holder" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "acquiredAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

UPDATE "SchedulerLease"
SET
  "holder" = NULL,
  "expiresAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'outreach-automation'
  AND datetime("expiresAt") <= datetime('now');
