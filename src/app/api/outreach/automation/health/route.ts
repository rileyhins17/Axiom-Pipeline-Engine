import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getDatabase } from "@/lib/cloudflare";
import {
  getAutomationSettings,
  healStaleSchedulerState,
  recoverStaleClaims,
} from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

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
  } | null;
  recentFailedRuns: Array<{
    id: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  }>;
  stuckSteps: Array<{ reason: string; count: number }>;
  blockedSequences: number;
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
};

async function getHealthDiagnostics(): Promise<SchedulerHealthData> {
  const db = getDatabase();
  const settings = await getAutomationSettings();

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
      .catch(() => ({ results: [] as any[] })),

    db
      .prepare(
        `SELECT "errorMessage" AS reason, COUNT(*) AS count
         FROM "OutreachSequenceStep"
         WHERE "status" = 'SCHEDULED'
           AND "errorMessage" IS NOT NULL
         GROUP BY "errorMessage"
         ORDER BY count DESC
         LIMIT 20`,
      )
      .all<{ reason: string; count: number }>()
      .catch(() => ({ results: [] as any[] })),

    db
      .prepare(
        `SELECT COUNT(*) AS count FROM "OutreachSequence"
         WHERE "status" IN ('QUEUED', 'WAITING', 'BLOCKED')
           AND "stopReason" IS NOT NULL`,
      )
      .first<{ count: number }>()
      .catch(() => null),

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
           CASE WHEN m."gmailConnectionId" IS NOT NULL THEN 1 ELSE 0 END AS connected,
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
        connected: number;
        dailyLimit: number;
        sentToday: number;
      }>()
      .catch(() => ({ results: [] as any[] })),

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
         WHERE "status" IN ('QUEUED', 'WAITING', 'BLOCKED')`,
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
          error: extractError(lastRunRow.metadata),
        }
      : null,
    recentFailedRuns: (recentFailedRows.results ?? []).map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      error: extractError(r.metadata),
    })),
    stuckSteps: (stuckStepRows.results ?? []).map((r) => ({
      reason: r.reason,
      count: Number(r.count),
    })),
    blockedSequences: Number(blockedSeqRow?.count || 0),
    staleClaimedSteps: Number(staleClaimRow?.count || 0),
    mailboxes: (mailboxRows.results ?? []).map((m) => ({
      address: m.address,
      status: m.status,
      connected: Boolean(m.connected),
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

  try {
    const prisma = getPrisma();
    const db = getDatabase();

    const [healed, recoveredClaims] = await Promise.all([
      healStaleSchedulerState(prisma),
      recoverStaleClaims(prisma),
    ]);

    const staleRunResult = await db
      .prepare(
        `UPDATE "OutreachRun"
         SET "status" = 'FAILED',
             "finishedAt" = datetime('now'),
             "metadata" = json_set(COALESCE("metadata", '{}'), '$.error', 'cleared by manual repair')
         WHERE "status" = 'RUNNING'
           AND datetime("startedAt") < datetime('now', '-15 minutes')`,
      )
      .run()
      .catch(() => ({ meta: { changes: 0 } }));

    const result: RepairResult = {
      healedSteps: healed.steps,
      healedSequences: healed.sequences,
      recoveredClaims,
      clearedStaleRuns: staleRunResult.meta?.changes ?? 0,
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
