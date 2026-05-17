/**
 * Scheduler Task Queue
 *
 * D1-backed lightweight message queue that makes the claim → generate → send
 * pipeline resumable across cron ticks. Each in-flight step gets a task row
 * tracking which phase it reached (CLAIMED → GENERATED → SENDING → COMPLETED).
 * If the worker dies mid-tick, the next tick resumes from the last persisted phase.
 */

export type SchedulerTaskPhase =
  | "CLAIMED"
  | "GENERATED"
  | "SENDING"
  | "COMPLETED"
  | "FAILED";

export type SchedulerTaskRecord = {
  id: string;
  runId: string;
  stepId: string;
  sequenceId: string;
  mailboxId: string;
  phase: SchedulerTaskPhase;
  generatedSubject: string | null;
  generatedBodyHtml: string | null;
  generatedBodyPlain: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

let tableEnsured = false;

async function ensureTaskTable() {
  if (tableEnsured) return;
  const { getDatabase } = await import("@/lib/cloudflare");
  await getDatabase()
    .prepare(
      `CREATE TABLE IF NOT EXISTS "SchedulerTask" (
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
      )`,
    )
    .run();
  tableEnsured = true;
}

export async function createSchedulerTask(
  stepId: string,
  sequenceId: string,
  mailboxId: string,
  runId: string,
): Promise<string> {
  await ensureTaskTable();
  const { getDatabase } = await import("@/lib/cloudflare");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO "SchedulerTask"
       ("id", "runId", "stepId", "sequenceId", "mailboxId", "phase", "attemptCount", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, 'CLAIMED', 0, ?, ?)`,
    )
    .bind(id, runId, stepId, sequenceId, mailboxId, now, now)
    .run();
  return id;
}

export async function advanceTaskPhase(
  stepId: string,
  phase: SchedulerTaskPhase,
  extras?: {
    generatedSubject?: string;
    generatedBodyHtml?: string;
    generatedBodyPlain?: string;
    errorMessage?: string;
  },
): Promise<void> {
  await ensureTaskTable();
  const { getDatabase } = await import("@/lib/cloudflare");
  const now = new Date().toISOString();
  if (extras?.generatedSubject) {
    await getDatabase()
      .prepare(
        `UPDATE "SchedulerTask"
         SET "phase" = ?, "generatedSubject" = ?, "generatedBodyHtml" = ?,
             "generatedBodyPlain" = ?, "updatedAt" = ?,
             "attemptCount" = "attemptCount" + 1
         WHERE "stepId" = ? AND "phase" NOT IN ('COMPLETED', 'FAILED')`,
      )
      .bind(
        phase,
        extras.generatedSubject,
        extras.generatedBodyHtml || null,
        extras.generatedBodyPlain || null,
        now,
        stepId,
      )
      .run();
  } else if (extras?.errorMessage) {
    await getDatabase()
      .prepare(
        `UPDATE "SchedulerTask"
         SET "phase" = ?, "errorMessage" = ?, "updatedAt" = ?,
             "attemptCount" = "attemptCount" + 1
         WHERE "stepId" = ? AND "phase" NOT IN ('COMPLETED', 'FAILED')`,
      )
      .bind(phase, extras.errorMessage, now, stepId)
      .run();
  } else {
    await getDatabase()
      .prepare(
        `UPDATE "SchedulerTask"
         SET "phase" = ?, "updatedAt" = ?
         WHERE "stepId" = ? AND "phase" NOT IN ('COMPLETED', 'FAILED')`,
      )
      .bind(phase, now, stepId)
      .run();
  }
}

export async function getIncompleteTasksFromPriorRuns(
  currentRunId: string,
): Promise<SchedulerTaskRecord[]> {
  await ensureTaskTable();
  const { getDatabase } = await import("@/lib/cloudflare");
  const result = await getDatabase()
    .prepare(
      `SELECT * FROM "SchedulerTask"
       WHERE "phase" NOT IN ('COMPLETED', 'FAILED')
         AND "runId" != ?
       ORDER BY "createdAt" ASC
       LIMIT 50`,
    )
    .bind(currentRunId)
    .all<SchedulerTaskRecord>();
  return result.results || [];
}

export async function cleanupCompletedTasks(olderThanMinutes = 60): Promise<number> {
  await ensureTaskTable();
  const { getDatabase } = await import("@/lib/cloudflare");
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  const result = await getDatabase()
    .prepare(
      `DELETE FROM "SchedulerTask"
       WHERE "phase" IN ('COMPLETED', 'FAILED')
         AND datetime("updatedAt") < datetime(?)`,
    )
    .bind(cutoff)
    .run();
  return Number(result.meta?.changes || 0);
}

export async function failStaleTasks(olderThanMinutes = 10): Promise<number> {
  await ensureTaskTable();
  const { getDatabase } = await import("@/lib/cloudflare");
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  const result = await getDatabase()
    .prepare(
      `UPDATE "SchedulerTask"
       SET "phase" = 'FAILED', "errorMessage" = 'stale_task_recovered', "updatedAt" = ?
       WHERE "phase" NOT IN ('COMPLETED', 'FAILED')
         AND datetime("updatedAt") < datetime(?)`,
    )
    .bind(new Date().toISOString(), cutoff)
    .run();
  return Number(result.meta?.changes || 0);
}
