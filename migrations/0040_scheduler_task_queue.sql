-- Lightweight scheduler task queue for resumable claim → generate → send.
-- Each row represents an in-flight step that the scheduler is actively
-- processing. If the worker dies mid-tick, the next tick picks up rows
-- in whatever phase they reached instead of waiting for stale-claim recovery.

CREATE TABLE IF NOT EXISTS "SchedulerTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'CLAIMED',
  "generatedSubject" TEXT,
  "generatedBodyHtml" TEXT,
  "generatedBodyPlain" TEXT,
  "errorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup of incomplete tasks from prior ticks
CREATE INDEX IF NOT EXISTS "idx_scheduler_task_phase"
  ON "SchedulerTask" ("phase")
  WHERE "phase" != 'COMPLETED' AND "phase" != 'FAILED';

-- Prevent duplicate tasks for the same step
CREATE UNIQUE INDEX IF NOT EXISTS "idx_scheduler_task_step_unique"
  ON "SchedulerTask" ("stepId")
  WHERE "phase" NOT IN ('COMPLETED', 'FAILED');
