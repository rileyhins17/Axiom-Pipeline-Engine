import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { getDatabase } from "@/lib/cloudflare";
import {
  forceResetAllBlockedState,
  getAutomationSettings,
  runAutomationScheduler,
} from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import {
  isOperatorActionableBlockerReason,
  isRecoverableSchedulerBlockerReason,
  isSchedulerRecoveryRunError,
} from "@/lib/scheduler-state";
import { requireAdminApiSession } from "@/lib/session";
import { isSendableMailbox } from "@/lib/ui/data-accuracy";

export type SchedulerHealthData = {
  lastRun: {
    id: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    claimed: number;
    sent: number;
    failed: number;
    skipped: number;
    error: string | null;
    actionRequired: boolean;
  } | null;
  recentFailedRuns: Array<{
    id: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  }>;
  recentRecoveredRuns: Array<{
    id: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  }>;
  stuckSteps: Array<{ reason: string; count: number; dueCount: number; nextReadyAt: string | null }>;
  waitingSteps: Array<{ reason: string; count: number; dueCount: number; nextReadyAt: string | null }>;
  blockedSequences: number;
  recoverableSequences: number;
  staleClaimedSteps: number;
  mailboxes: Array<{
    address: string;
    status: string;
    connected: boolean;
    sentToday: number;
    dailyLimit: number;
  }>;
  emergencyPaused: boolean;
  intakePaused: boolean;
  totalScheduledSteps: number;
  totalActiveSequences: number;
};

export type RepairResult = {
  healedSteps: number;
  healedSequences: number;
  recoveredClaims: number;
  clearedStaleRuns: number;
  clearedSchedulerLeases: number;
};

const STALE_SCHEDULER_MINUTES = 2;
const HEALTH_CACHE_TTL_MS = 30_000;
let healthCache: { data: SchedulerHealthData; expiresAt: number } | null = null;

async function getHealthDiagnostics(): Promise<SchedulerHealthData> {
  const now = Date.now();
  if (healthCache && healthCache.expiresAt > now) {
    return healthCache.data;
  }

  const data = await getHealthDiagnosticsUncached();
  healthCache = { data, expiresAt: now + HEALTH_CACHE_TTL_MS };
  return data;
}

async function getHealthDiagnosticsUncached(): Promise<SchedulerHealthData> {
  const db = getDatabase();
  const settings = await getAutomationSettings().catch(() => ({
    ...AUTOMATION_SETTINGS_DEFAULTS,
  }));

  const [
    lastRunRow,
    recentFailedRows,
    stuckStepRows,
    blockedSeqRow,
    staleClaimRow,
    mailboxRows,
    scheduledStepRow,
    activeSeqRow,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT "id", "status", "startedAt", "finishedAt",
                "claimedCount" AS claimed, "sentCount" AS sent,
                "failedCount" AS failed, "skippedCount" AS skipped,
                "metadata"
         FROM "OutreachRun"
         ORDER BY "startedAt" DESC
         LIMIT 1`,
      )
      .first<{
        id: string;
        status: string;
        startedAt: string | null;
        finishedAt: string | null;
        claimed: number;
        sent: number;
        failed: number;
        skipped: number;
        metadata: string | null;
      }>()
      .catch(() => null),

    db
      .prepare(
        `SELECT "id", "startedAt", "finishedAt", "metadata"
         FROM "OutreachRun"
         WHERE "status" = 'FAILED'
         ORDER BY "startedAt" DESC
         LIMIT 5`,
      )
      .all<{
        id: string;
        startedAt: string | null;
        finishedAt: string | null;
        metadata: string | null;
      }>()
      .catch(() => ({
        results: [] as Array<{
          id: string;
          startedAt: string | null;
          finishedAt: string | null;
          metadata: string | null;
        }>,
      })),

    db
      .prepare(
        `SELECT
           "errorMessage" AS reason,
           COUNT(*) AS count,
           SUM(CASE WHEN datetime("scheduledFor") <= datetime('now') THEN 1 ELSE 0 END) AS dueCount,
           MIN("scheduledFor") AS nextReadyAt
         FROM "OutreachSequenceStep"
         WHERE "status" = 'SCHEDULED'
           AND "errorMessage" IS NOT NULL
         GROUP BY "errorMessage"
         ORDER BY count DESC
         LIMIT 20`,
      )
      .all<{ reason: string; count: number; dueCount: number; nextReadyAt: string | null }>()
      .catch(() => ({ results: [] as Array<{ reason: string; count: number; dueCount: number; nextReadyAt: string | null }> })),

    db
      .prepare(
        `SELECT "stopReason" AS reason, COUNT(*) AS count FROM "OutreachSequence"
         WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING', 'WAITING', 'BLOCKED')
           AND "stopReason" IS NOT NULL
         GROUP BY "stopReason"`,
      )
      .all<{ reason: string; count: number }>()
      .catch(() => ({ results: [] as Array<{ reason: string; count: number }> })),

    db
      .prepare(
        `SELECT COUNT(*) AS count FROM "OutreachSequenceStep"
         WHERE "status" IN ('CLAIMED', 'SENDING')
           AND (datetime("claimedAt") < datetime('now', '-2 minutes') OR "claimedAt" IS NULL)`,
      )
      .first<{ count: number }>()
      .catch(() => null),

    db
      .prepare(
        `SELECT
           m."gmailAddress" AS address,
           m."status",
           m."gmailConnectionId",
           m."dailyLimit",
           (SELECT COUNT(*) FROM "OutreachEmail" e
            WHERE e."mailboxId" = m."id" AND e."status" = 'sent'
              AND datetime(e."sentAt") >= datetime('now', 'start of day')) AS sentToday
         FROM "OutreachMailbox" m
         ORDER BY m."updatedAt" DESC`,
      )
      .all<{
        address: string;
        status: string;
        gmailConnectionId: string | null;
        dailyLimit: number;
        sentToday: number;
      }>()
      .catch(() => ({
        results: [] as Array<{
          address: string;
          status: string;
          gmailConnectionId: string | null;
          dailyLimit: number;
          sentToday: number;
        }>,
      })),

    db
      .prepare(
        `SELECT COUNT(*) AS count FROM "OutreachSequenceStep"
         WHERE "status" = 'SCHEDULED'`,
      )
      .first<{ count: number }>()
      .catch(() => null),

    db
      .prepare(
        `SELECT COUNT(*) AS count FROM "OutreachSequence"
         WHERE "status" IN ('QUEUED', 'ACTIVE', 'SENDING', 'WAITING', 'BLOCKED')`,
      )
      .first<{ count: number }>()
      .catch(() => null),
  ]);

  function extractError(metadata: string | null | undefined): string | null {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata);
      return parsed.error || parsed.reason || null;
    } catch {
      return null;
    }
  }

  const blockerRows = (stuckStepRows.results ?? []).map((r) => ({
    reason: r.reason,
    count: Number(r.count || 0),
    dueCount: Number(r.dueCount || 0),
    nextReadyAt: r.nextReadyAt ?? null,
  }));
  const stuckSteps = blockerRows.filter(
    (row) => isOperatorActionableBlockerReason(row.reason) || (!isRecoverableSchedulerBlockerReason(row.reason) && row.dueCount > 0),
  );
  const waitingSteps = blockerRows.filter(
    (row) => !stuckSteps.includes(row),
  );
  const blockedSequenceRows = (blockedSeqRow.results ?? []).map((r) => ({
    reason: r.reason,
    count: Number(r.count || 0),
  }));
  const blockedSequences = blockedSequenceRows
    .filter((row) => isOperatorActionableBlockerReason(row.reason))
    .reduce((sum, row) => sum + row.count, 0);
  const recoverableSequences = blockedSequenceRows
    .filter((row) => !isOperatorActionableBlockerReason(row.reason))
    .reduce((sum, row) => sum + row.count, 0);
  const recentRunRows = (recentFailedRows.results ?? []).map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    error: extractError(r.metadata),
  }));
  const recentFailedRuns = recentRunRows.filter((run) => !isSchedulerRecoveryRunError(run.error));
  const recentRecoveredRuns = recentRunRows.filter((run) => isSchedulerRecoveryRunError(run.error));
  const lastRunError = extractError(lastRunRow?.metadata);

  return {
    lastRun: lastRunRow
      ? {
          id: lastRunRow.id,
          status: lastRunRow.status,
          startedAt: lastRunRow.startedAt,
          finishedAt: lastRunRow.finishedAt,
          claimed: Number(lastRunRow.claimed || 0),
          sent: Number(lastRunRow.sent || 0),
          failed: Number(lastRunRow.failed || 0),
          skipped: Number(lastRunRow.skipped || 0),
          error: lastRunError,
          actionRequired: lastRunRow.status === "FAILED" && !isSchedulerRecoveryRunError(lastRunError),
        }
      : null,
    recentFailedRuns,
    recentRecoveredRuns,
    stuckSteps,
    waitingSteps,
    blockedSequences,
    recoverableSequences,
    staleClaimedSteps: Number(staleClaimRow?.count || 0),
    mailboxes: (mailboxRows.results ?? []).map((m) => ({
      address: m.address,
      status: m.status,
      connected: isSendableMailbox(m),
      sentToday: Number(m.sentToday || 0),
      dailyLimit: Number(m.dailyLimit || 40),
    })),
    emergencyPaused: settings.emergencyPaused,
    intakePaused: settings.intakePaused,
    totalScheduledSteps: Number(scheduledStepRow?.count || 0),
    totalActiveSequences: Number(activeSeqRow?.count || 0),
  };
}

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const health = await getHealthDiagnostics();
    return NextResponse.json(health);
  } catch (error: unknown) {
    console.error("[health] Diagnostics failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch health data" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  // Invalidate health cache on any mutation
  healthCache = null;
  const body = await request.json().catch(() => ({})) as { action?: string };

  if (body.action === "trigger") {
    try {
      const schedulerResult = await runAutomationScheduler({ immediate: true });
      if (!schedulerResult) throw new Error("Scheduler returned no result");
      await writeAuditEvent({
        action: "automation.manual_trigger",
        actorUserId: authResult.session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || "api",
        targetType: "scheduler",
        targetId: "manual_trigger",
        metadata: { runId: schedulerResult.runId, sent: schedulerResult.sent },
      });
      return NextResponse.json({
        triggered: true,
        runId: schedulerResult.runId,
        claimed: schedulerResult.claimed,
        sent: schedulerResult.sent,
        failed: schedulerResult.failed,
        skipped: schedulerResult.skipped,
      });
    } catch (error: unknown) {
      console.error("[health] Manual trigger failed:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Trigger failed" },
        { status: 500 },
      );
    }
  }

  try {
    const prisma = getPrisma();
    const db = getDatabase();

    const forceResult = await forceResetAllBlockedState(prisma);

    const staleRunResult = await db
      .prepare(
        `UPDATE "OutreachRun"
         SET "status" = 'FAILED',
             "finishedAt" = datetime('now'),
             "metadata" = json_set(COALESCE("metadata", '{}'), '$.error', 'cleared by manual repair')
         WHERE "status" = 'RUNNING'
           AND datetime("startedAt") < datetime('now', '-${STALE_SCHEDULER_MINUTES} minutes')`,
      )
      .run()
      .catch(() => ({ meta: { changes: 0 } }));

    const leaseResult = await db
      .prepare(
        `UPDATE "SchedulerLease"
         SET "holder" = NULL,
             "expiresAt" = datetime('now'),
             "updatedAt" = datetime('now')
         WHERE "id" = 'outreach-automation'
           AND (
             "holder" IS NOT NULL
             OR datetime("expiresAt") > datetime('now')
           )`,
      )
      .run()
      .catch(() => ({ meta: { changes: 0 } }));

    const result: RepairResult = {
      healedSteps: forceResult.steps,
      healedSequences: forceResult.sequences,
      recoveredClaims: forceResult.claims,
      clearedStaleRuns: staleRunResult.meta?.changes ?? 0,
      clearedSchedulerLeases: leaseResult.meta?.changes ?? 0,
    };

    await writeAuditEvent({
      action: "automation.manual_repair",
      actorUserId: authResult.session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") || "api",
      targetType: "scheduler",
      targetId: "manual_repair",
      metadata: result,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[health] Repair failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Repair failed" },
      { status: 500 },
    );
  }
}
