-- Single-owner lease for the automation scheduler. Cron and manual runs can
-- overlap, so this row prevents duplicate queueing/sending work.

CREATE TABLE IF NOT EXISTS "SchedulerLease" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "holder" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SchedulerLease_expiresAt_idx"
  ON "SchedulerLease"("expiresAt");
