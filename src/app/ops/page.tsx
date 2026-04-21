import Link from "next/link";
import type { Route } from "next";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  MailCheck,
  Server,
  XCircle,
  Zap,
} from "lucide-react";

import { requireSession } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { formatAppDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StatusKind = "healthy" | "warning" | "danger" | "idle";

function computeStatus(
  lastRunAgoMinutes: number | null,
  lastRunStatus: string | null,
  lastRunFailed: number,
  lastRunSent: number,
  mailboxesActive: number,
  mailboxesTotal: number,
): { status: StatusKind; warnings: string[] } {
  const warnings: string[] = [];
  let status: StatusKind = "healthy";
  if (lastRunAgoMinutes === null) {
    status = "idle";
  } else {
    if (lastRunAgoMinutes > 30) {
      status = "warning";
      warnings.push(`Scheduler idle for ${lastRunAgoMinutes}m (expected every ~5m)`);
    }
    if (lastRunAgoMinutes > 120) status = "danger";
    if (lastRunStatus === "FAILED") {
      status = "danger";
      warnings.push("Last scheduler run failed");
    }
    if (lastRunFailed > 0 && lastRunSent === 0) {
      status = "danger";
      warnings.push(`Last run had ${lastRunFailed} failures and 0 sends`);
    }
  }
  if (mailboxesTotal === 0) {
    warnings.push("No Gmail mailboxes connected");
    if (status === "healthy") status = "warning";
  } else if (mailboxesActive === 0) {
    status = "danger";
    warnings.push("No active mailboxes (all paused or disconnected)");
  }
  return { status, warnings };
}

const STATUS_META: Record<StatusKind, { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  healthy: {
    label: "All systems healthy",
    color: "text-emerald-300",
    bg: "bg-emerald-400/[0.08]",
    border: "border-emerald-400/30",
    icon: CheckCircle2,
  },
  warning: {
    label: "Degraded",
    color: "text-amber-300",
    bg: "bg-amber-400/[0.08]",
    border: "border-amber-400/30",
    icon: AlertTriangle,
  },
  danger: {
    label: "Unhealthy",
    color: "text-rose-300",
    bg: "bg-rose-400/[0.08]",
    border: "border-rose-400/30",
    icon: XCircle,
  },
  idle: {
    label: "Idle — scheduler not running",
    color: "text-zinc-400",
    bg: "bg-white/[0.03]",
    border: "border-white/10",
    icon: Clock,
  },
};

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function OpsPage() {
  await requireSession();

  const prisma = getPrisma();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  type Overview = Awaited<ReturnType<typeof listAutomationOverview>>;
  let overview: Overview | null = null;
  try {
    overview = await listAutomationOverview();
  } catch {
    overview = null;
  }

  const [totalLeads, todayLeads, readyLeads, emailsToday] = await Promise.all([
    prisma.lead.count({ where: { isArchived: false } }).catch(() => 0),
    prisma.lead
      .count({ where: { isArchived: false, createdAt: { gte: startOfToday } } })
      .catch(() => 0),
    prisma.lead
      .count({ where: { isArchived: false, outreachStatus: "READY_FOR_FIRST_TOUCH" } })
      .catch(() => 0),
    prisma.outreachEmail
      .findMany({ where: { sentAt: { gte: startOfToday } }, select: { status: true } })
      .catch(() => []),
  ]);

  const sentToday = emailsToday.filter((e) => e.status === "sent").length;
  const failedToday = emailsToday.filter((e) => e.status === "failed").length;

  const recentRuns = overview?.recentRuns ?? [];
  const lastRun = recentRuns[0] ?? null;
  const lastRunAt = lastRun?.finishedAt ? new Date(lastRun.finishedAt) : lastRun?.startedAt ? new Date(lastRun.startedAt) : null;
  const lastRunAgoMinutes = lastRunAt ? Math.max(0, Math.floor((now.getTime() - lastRunAt.getTime()) / 60_000)) : null;

  const mailboxes = overview?.mailboxes ?? [];
  const mailboxesActive = mailboxes.filter((m) => m.status === "ACTIVE" || m.status === "WARMING").length;
  const queued = overview?.queued?.length ?? 0;
  const active = overview?.active?.length ?? 0;
  const engine = overview?.engine ?? null;

  const { status, warnings } = computeStatus(
    lastRunAgoMinutes,
    lastRun?.status ?? null,
    lastRun?.failedCount ?? 0,
    lastRun?.sentCount ?? 0,
    mailboxesActive,
    mailboxes.length,
  );

  const statusMeta = STATUS_META[status];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="mx-auto max-w-[1180px] space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="section-label">Operations</span>
          <span className="text-zinc-700">/</span>
          <span className="section-label text-emerald-300/80">Pipeline Health</span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Ops</h1>
            <p className="page-subtitle mt-1">
              Live status of the automation scheduler, mailboxes, and send queue.
            </p>
          </div>
          <div className="text-right text-[11px] text-zinc-500">
            <div className="uppercase tracking-[0.18em]">As of</div>
            <div className="font-mono text-zinc-300">{formatAppDateTime(now)}</div>
          </div>
        </div>
      </div>

      {/* Status hero */}
      <div className={`surface-raised border ${statusMeta.border} ${statusMeta.bg} flex items-start gap-4 p-5`}>
        <StatusIcon className={`mt-0.5 h-6 w-6 shrink-0 ${statusMeta.color}`} />
        <div className="flex-1">
          <div className={`text-[15px] font-semibold ${statusMeta.color}`}>{statusMeta.label}</div>
          <div className="mt-1 text-[13px] text-zinc-300">
            {lastRunAt ? (
              <>
                Last scheduler run <span className="text-white">{relativeTime(lastRunAt)}</span>
                {lastRun?.status ? (
                  <>
                    {" "}•{" "}
                    <span className="font-mono text-zinc-400">{lastRun.status}</span>
                  </>
                ) : null}
                {typeof lastRun?.sentCount === "number" ? (
                  <>
                    {" "}•{" "}
                    <span className="text-emerald-300">{lastRun.sentCount} sent</span>
                  </>
                ) : null}
                {typeof lastRun?.failedCount === "number" && lastRun.failedCount > 0 ? (
                  <>
                    {" "}•{" "}
                    <span className="text-rose-300">{lastRun.failedCount} failed</span>
                  </>
                ) : null}
              </>
            ) : (
              "No scheduler runs recorded yet. Trigger a run to start the automation loop."
            )}
          </div>
          {warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[12px] text-zinc-300">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <form action="/api/outreach/automation/run" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/15"
            >
              <Zap className="h-3.5 w-3.5" />
              Run scheduler now
            </button>
          </form>
          <Link
            href="/automation"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
          >
            Open automation
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label="Sent today"
          value={sentToday}
          icon={MailCheck}
          tone={sentToday > 0 ? "success" : "neutral"}
        />
        <KpiCard
          label="Failed today"
          value={failedToday}
          icon={XCircle}
          tone={failedToday > 0 ? "danger" : "neutral"}
        />
        <KpiCard label="Queued" value={queued} icon={Clock} tone="info" />
        <KpiCard label="Active" value={active} icon={Activity} tone="info" />
        <KpiCard label="Ready leads" value={readyLeads} icon={Inbox} tone="info" />
      </div>

      {/* Two-column: Mailboxes + Recent runs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <header className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-zinc-400" />
              <h2 className="section-title">Mailboxes</h2>
            </div>
            <span className="text-[11px] text-zinc-500">
              {mailboxesActive} active / {mailboxes.length} total
            </span>
          </header>
          {mailboxes.length === 0 ? (
            <EmptyRow
              title="No mailboxes connected"
              hint="Connect a Gmail account in Automation to start sending."
              href="/automation"
              cta="Connect Gmail"
            />
          ) : (
            <ul className="space-y-2">
              {mailboxes.map((mbx) => {
                const sentState =
                  mbx.status === "ACTIVE" ? "healthy" : mbx.status === "WARMING" ? "warning" : "idle";
                return (
                  <li
                    key={mbx.id}
                    className="surface-inset flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="status-dot" data-state={sentState} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-white">
                          {mbx.gmailAddress}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          <span className="font-mono uppercase tracking-wider">{mbx.status}</span>
                          {" • "}
                          {mbx.dailyLimit ?? "—"}/day • {mbx.hourlyLimit ?? "—"}/hour
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-zinc-500">
                      <div className="uppercase tracking-wider">Last sent</div>
                      <div className="font-mono text-zinc-300">
                        {mbx.lastSentAt ? relativeTime(new Date(mbx.lastSentAt)) : "never"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <header className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-400" />
              <h2 className="section-title">Recent scheduler runs</h2>
            </div>
            <span className="text-[11px] text-zinc-500">{recentRuns.length} shown</span>
          </header>
          {recentRuns.length === 0 ? (
            <EmptyRow
              title="No runs yet"
              hint="Trigger the scheduler to record a run."
              href="/automation"
              cta="Go to automation"
            />
          ) : (
            <ul className="space-y-1.5">
              {recentRuns.slice(0, 10).map((run) => {
                const started = run.startedAt ? new Date(run.startedAt) : null;
                const finished = run.finishedAt ? new Date(run.finishedAt) : null;
                const tone =
                  run.status === "FAILED"
                    ? "danger"
                    : (run.failedCount ?? 0) > 0
                    ? "warning"
                    : "success";
                return (
                  <li
                    key={run.id}
                    className="surface-inset flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="status-dot"
                        data-state={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "healthy"}
                      />
                      <div className="min-w-0 text-[12px]">
                        <div className="truncate text-zinc-200">
                          <span className="font-mono text-zinc-500">{run.status ?? "—"}</span>
                          {" • "}
                          <span className="text-emerald-300">{run.sentCount ?? 0} sent</span>
                          {(run.failedCount ?? 0) > 0 ? (
                            <>
                              {" • "}
                              <span className="text-rose-300">{run.failedCount} failed</span>
                            </>
                          ) : null}
                          {typeof run.claimedCount === "number" ? (
                            <>
                              {" • "}
                              <span className="text-zinc-500">{run.claimedCount} claimed</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[10px] text-zinc-500">
                      {started ? relativeTime(started) : "—"}
                      {finished && started ? (
                        <span className="ml-2 text-zinc-600">
                          ({Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000))}s)
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Engine snapshot */}
      {engine ? (
        <section className="surface p-5">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Engine snapshot</h2>
            <span className="text-[11px] text-zinc-500">
              Updated {formatAppDateTime(now)}
            </span>
          </header>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <EnginePill label="Mode" value={engine.mode} />
            <EnginePill
              label="Next send"
              value={engine.nextSendAt ? formatAppDateTime(new Date(engine.nextSendAt)) : "—"}
            />
            <EnginePill label="Scheduled today" value={String(engine.scheduledToday ?? 0)} />
            <EnginePill label="Blocked" value={String(engine.blockedCount ?? 0)} />
            <EnginePill label="Waiting" value={String(engine.waitingCount ?? 0)} />
            <EnginePill label="Sending" value={String(engine.sendingCount ?? 0)} />
            <EnginePill label="Reply-stopped" value={String(engine.replyStoppedCount ?? 0)} />
            <EnginePill label="Ready" value={String(engine.readyCount ?? 0)} />
          </div>
        </section>
      ) : null}

      <section className="surface p-5">
        <header className="mb-3">
          <h2 className="section-title">Pipeline volume</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Totals exclude archived leads.
          </p>
        </header>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total leads" value={totalLeads} icon={Inbox} tone="neutral" compact />
          <KpiCard label="Today" value={todayLeads} icon={Inbox} tone="info" compact />
          <KpiCard label="Ready for outreach" value={readyLeads} icon={MailCheck} tone="success" compact />
        </div>
      </section>
    </div>
  );
}

type KpiTone = "success" | "warning" | "danger" | "info" | "neutral";

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  compact = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
  compact?: boolean;
}) {
  const toneClasses: Record<KpiTone, string> = {
    success: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-rose-300",
    info: "text-cyan-300",
    neutral: "text-white",
  };
  return (
    <div className={`surface surface-hover ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
      </div>
      <div className={`mt-1 kpi-value ${compact ? "text-xl" : "text-2xl"} ${toneClasses[tone]}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function EmptyRow({
  title,
  hint,
  href,
  cta,
}: {
  title: string;
  hint: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="surface-inset flex flex-col items-start gap-2 p-4 text-[12px]">
      <div>
        <div className="font-medium text-zinc-200">{title}</div>
        <div className="mt-0.5 text-zinc-500">{hint}</div>
      </div>
      <Link
        href={href as Route}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-300 hover:text-emerald-200"
      >
        {cta}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function EnginePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-inset px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="kpi-value mt-0.5 truncate text-[13px] text-white">{value}</div>
    </div>
  );
}
