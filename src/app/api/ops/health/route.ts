import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

type OpsHealth = {
  status: "healthy" | "warning" | "danger" | "idle";
  lastRunAt: string | null;
  lastRunAgoMinutes: number | null;
  lastRunStatus: string | null;
  lastRunSent: number;
  lastRunFailed: number;
  sentToday: number;
  failedToday: number;
  readyLeads: number;
  queuedSequences: number;
  activeSequences: number;
  mailboxesActive: number;
  mailboxesTotal: number;
  totalLeads: number;
  todayLeads: number;
  warnings: string[];
  generatedAt: string;
};

function empty(): OpsHealth {
  return {
    status: "idle",
    lastRunAt: null,
    lastRunAgoMinutes: null,
    lastRunStatus: null,
    lastRunSent: 0,
    lastRunFailed: 0,
    sentToday: 0,
    failedToday: 0,
    readyLeads: 0,
    queuedSequences: 0,
    activeSequences: 0,
    mailboxesActive: 0,
    mailboxesTotal: 0,
    totalLeads: 0,
    todayLeads: 0,
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const prisma = getPrisma();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      todayLeads,
      readyLeads,
      queuedSequences,
      activeSequences,
      recentRunsRaw,
      emailsToday,
      mailboxes,
    ] = await Promise.all([
      prisma.lead.count({ where: { isArchived: false } }),
      prisma.lead.count({ where: { isArchived: false, createdAt: { gte: startOfToday } } }),
      prisma.lead.count({ where: { isArchived: false, outreachStatus: "READY_FOR_FIRST_TOUCH" } }),
      prisma.outreachSequence.count({ where: { status: "QUEUED" } }).catch(() => 0),
      prisma.outreachSequence
        .count({ where: { status: { in: ["ACTIVE", "SENDING", "WAITING"] } } })
        .catch(() => 0),
      prisma.outreachRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }).catch(() => []),
      prisma.outreachEmail
        .findMany({
          where: { sentAt: { gte: startOfToday } },
          select: { status: true },
        })
        .catch(() => []),
      prisma.outreachMailbox.findMany({ select: { id: true, status: true } }).catch(() => []),
    ]);

    type RunRow = {
      startedAt?: Date | string | null;
      finishedAt?: Date | string | null;
      status?: string | null;
      sentCount?: number | null;
      failedCount?: number | null;
    };
    const recentRuns = recentRunsRaw as RunRow[];
    const lastRun = recentRuns[0] ?? null;
    const lastRunAt = lastRun?.finishedAt
      ? new Date(lastRun.finishedAt)
      : lastRun?.startedAt
      ? new Date(lastRun.startedAt)
      : null;
    const lastRunAgoMinutes = lastRunAt
      ? Math.max(0, Math.floor((now.getTime() - lastRunAt.getTime()) / 60_000))
      : null;

    type EmailRow = { status?: string | null };
    const emails = emailsToday as EmailRow[];
    const sentToday = emails.filter((e) => e.status === "sent").length;
    const failedToday = emails.filter((e) => e.status === "failed").length;

    type MailboxRow = { status?: string | null };
    const mbx = mailboxes as MailboxRow[];
    const mailboxesActive = mbx.filter((m) => m.status === "ACTIVE" || m.status === "WARMING").length;

    const warnings: string[] = [];
    let status: OpsHealth["status"] = "healthy";

    if (!lastRunAt) {
      status = "idle";
    } else {
      if (lastRunAgoMinutes !== null && lastRunAgoMinutes > 30) {
        status = "warning";
        warnings.push(`Scheduler idle for ${lastRunAgoMinutes}m`);
      }
      if (lastRunAgoMinutes !== null && lastRunAgoMinutes > 120) {
        status = "danger";
      }
      if (lastRun?.status === "FAILED") {
        status = "danger";
        warnings.push("Last run failed");
      }
      if ((lastRun?.failedCount ?? 0) > 0 && (lastRun?.sentCount ?? 0) === 0) {
        status = "danger";
        warnings.push("Last run had failures with no sends");
      }
    }

    if (mailboxesActive === 0 && mbx.length > 0) {
      status = "danger";
      warnings.push("No active mailboxes");
    }
    if (mbx.length === 0) {
      warnings.push("No mailboxes configured");
      if (status === "healthy") status = "warning";
    }
    if (readyLeads > 0 && queuedSequences === 0 && activeSequences === 0 && status === "healthy") {
      status = "warning";
      warnings.push(`${readyLeads} leads ready but nothing queued`);
    }

    const payload: OpsHealth = {
      status,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      lastRunAgoMinutes,
      lastRunStatus: (lastRun?.status as string | undefined) ?? null,
      lastRunSent: lastRun?.sentCount ?? 0,
      lastRunFailed: lastRun?.failedCount ?? 0,
      sentToday,
      failedToday,
      readyLeads,
      queuedSequences: Number(queuedSequences),
      activeSequences: Number(activeSequences),
      mailboxesActive,
      mailboxesTotal: mbx.length,
      totalLeads,
      todayLeads,
      warnings,
      generatedAt: now.toISOString(),
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(empty());
  }
}
