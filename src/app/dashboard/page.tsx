import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Brain,
  CheckCircle2,
  Mail,
  MailCheck,
  Radar,
  Reply,
  Sparkles,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Tone = "green" | "blue" | "cyan" | "amber";
type PriorityLevel = "High" | "Medium" | "Low";

type Kpi = {
  color: string;
  delta: string;
  deltaTone: "good" | "bad" | "neutral";
  label: string;
  period: string;
  points: string;
  value: string;
};

type ActionRow = {
  action: string;
  count: number;
  detail: string;
  due: string;
  item: string;
  priority: PriorityLevel;
};

type ActivityRow = {
  date: Date;
  detail: string;
  icon: typeof UserRoundPlus;
  time: string;
  title: string;
  tone: Tone;
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(numerator: number, denominator: number, decimals = 0) {
  if (denominator <= 0) return decimals === 0 ? "0%" : "0.0%";
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysAgo(days: number) {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - days);
  return date;
}

function isBetween(date: Date | string | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function calcDelta(current: number, previous: number, suffix = "%") {
  if (previous === 0 && current === 0) return { label: `0${suffix}`, tone: "neutral" as const };
  if (previous === 0) return { label: `+${current}${suffix}`, tone: "good" as const };
  const change = ((current - previous) / previous) * 100;
  return {
    settings: { ...AUTOMATION_SETTINGS_DEFAULTS },
    mailboxes: [],
    ready: [],
    sequences: [],
    queued: [],
    active: [],
    finished: [],
    recentSent: [],
    engine: {
      mode: "ACTIVE",
      nextSendAt: null,
      scheduledToday: 0,
      blockedCount: 0,
      replyStoppedCount: 0,
      readyCount: 0,
      queuedCount: 0,
      waitingCount: 0,
      sendingCount: 0,
    },
    recentRuns: [],
    stats: {
      ready: 0,
      queued: 0,
      sending: 0,
      waiting: 0,
      blocked: 0,
      active: 0,
      paused: 0,
      stopped: 0,
      completed: 0,
      replied: 0,
      scheduledToday: 0,
    },
  };
}

function formatRunTime(value: Date | string | null | undefined, fallback = "Nothing scheduled") {
  return formatAppDateTime(
    value,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    fallback,
  );
}

export const dynamic = "force-dynamic";

type AttentionBoardItem = {
  label: string;
  value: number;
  href: Parameters<typeof Link>[0]["href"];
  detail: string;
  action: string;
  icon: ReactNode;
  accent: string;
  glow: string;
};

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const now = new Date();
  const thisWeekStart = daysAgo(7);
  const previousWeekStart = daysAgo(14);
  const period = `vs ${shortDate(previousWeekStart)} - ${shortDate(thisWeekStart)}`;

  const [automationOverview, scrapeJobs, leads, sentEmails, sentTotal] = await Promise.all([
    listAutomationOverview().catch(() => null),
    listScrapeJobs(8).catch(() => []),
    prisma.lead.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        businessName: true,
        city: true,
        createdAt: true,
        dedupeKey: true,
        email: true,
        emailConfidence: true,
        emailFlags: true,
        emailType: true,
        enrichedAt: true,
        enrichmentData: true,
        axiomScore: true,
        outreachStatus: true,
        source: true,
        lastContactedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.outreachEmail.findMany({
      where: { status: "sent" },
      orderBy: { sentAt: "desc" },
      take: 500,
    }).catch(() => []),
    prisma.outreachEmail.count({ where: { status: "sent" } }).catch(() => 0),
  ]);

  const preSendStages = partitionPreSendLeads(
    leads.filter((lead) => {
      if (isContactedOutreachStatus(lead.outreachStatus)) return false;
      if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
      return true;
    }),
  );
  const intakeBacklog = preSendStages.intake.length;
  const enrichmentBacklog = preSendStages.enrichment.length;
  const firstTouchQueued = automationOverview.sequences.filter(
    (s) => !s.hasSentAnyStep && (s.state === "QUEUED" || s.state === "SENDING"),
  ).length;
  const activeFollowUps = automationOverview.sequences.filter(
    (s) => s.hasSentAnyStep && (s.state === "WAITING" || s.state === "SENDING"),
  ).length;
  const blockedFollowUps = automationOverview.sequences.filter(
    (s) => s.hasSentAnyStep && s.state === "BLOCKED",
  ).length;

  const activeRun = scrapeJobs.find((j) => j.status === "running" || j.status === "claimed") ?? null;
  const repliedLeads = leads.filter((l) => l.outreachStatus === "REPLIED").slice(0, 4);
  const recentSendEvents = automationOverview.recentSent.slice(0, 4);

  // KPI strip data — bigger, bolder than before, and each tile carries a
  // gradient accent so the dashboard reads as a system overview at a glance.
  const kpis = [
    { label: "Total leads", value: leads.length, sub: "in the pipeline", accent: "from-emerald-500/30 to-emerald-500/0", icon: <Target className="h-4 w-4 text-emerald-400" /> },
    { label: "Ready to send", value: automationOverview.stats.ready, sub: "approved for first-touch", accent: "from-cyan-500/30 to-cyan-500/0", icon: <MailCheck className="h-4 w-4 text-cyan-400" /> },
    { label: "Sending today", value: automationOverview.stats.scheduledToday, sub: "scheduled by the engine", accent: "from-blue-500/30 to-blue-500/0", icon: <Mail className="h-4 w-4 text-blue-400" /> },
    { label: "Active follow-ups", value: activeFollowUps, sub: "post-send sequences live", accent: "from-violet-500/30 to-violet-500/0", icon: <Bot className="h-4 w-4 text-violet-400" /> },
    { label: "Replies", value: automationOverview.stats.replied, sub: "leads who replied", accent: "from-amber-500/30 to-amber-500/0", icon: <Reply className="h-4 w-4 text-amber-400" /> },
    { label: "Needs attention", value: blockedFollowUps, sub: "blocked sequences", accent: "from-red-500/30 to-red-500/0", icon: <AlertTriangle className="h-4 w-4 text-red-400" /> },
  ];

  const attentionBoard: AttentionBoardItem[] = [
    {
      label: "Intake backlog",
      value: intakeBacklog,
      href: "/hunt",
      detail: "Sourced batch output waiting for handoff",
      action: "Open Lead Generator",
      icon: <Radar className="h-4 w-4" />,
      accent: "text-cyan-300",
      glow: "from-cyan-500/30 via-cyan-500/0 to-cyan-500/0",
    },
    {
      label: "Enrichment backlog",
      value: enrichmentBacklog,
      href: { pathname: "/outreach", query: { stage: "enrichment" } },
      detail: "Records still missing prep before approval",
      action: "Open Enrichment",
      icon: <Brain className="h-4 w-4" />,
      accent: "text-violet-300",
      glow: "from-violet-500/30 via-violet-500/0 to-violet-500/0",
    },
    {
      label: "Ready for first touch",
      value: automationOverview.stats.ready,
      href: { pathname: "/outreach", query: { stage: "ready" } },
      detail: "Approved leads waiting on first-touch action",
      action: "Open Outreach",
      icon: <MailCheck className="h-4 w-4" />,
      accent: "text-emerald-300",
      glow: "from-emerald-500/30 via-emerald-500/0 to-emerald-500/0",
    },
    {
      label: "Blocked follow-ups",
      value: blockedFollowUps,
      href: "/automation",
      detail: "Post-send sequences needing intervention",
      action: "Open Automation",
      icon: <AlertTriangle className="h-4 w-4" />,
      accent: "text-amber-300",
      glow: "from-amber-500/30 via-amber-500/0 to-amber-500/0",
    },
    {
      action: "Data Quality",
      count: duplicates,
      detail: `${formatNumber(duplicates)} duplicates detected`,
      item: "Data Quality",
      priority: priorityFor(duplicates),
      due: dueFor(duplicates),
    },
  ].filter((row) => row.count > 0);

  const visibleActions =
    actionQueue.length > 0
      ? actionQueue.slice(0, 5)
      : [{
          action: "No Action Required",
          count: 0,
          detail: "Live pipeline checks are clean",
          due: "-",
          item: "System",
          priority: "Low" as PriorityLevel,
        }];

  const recentLeadActivities: ActivityRow[] = leads.slice(0, 2).map((lead) => ({
    date: lead.createdAt,
    detail: `${lead.city || "Unknown city"} - ${lead.source || "lead source"}`,
    icon: UserRoundPlus,
    time: formatTime(lead.createdAt),
    title: `${lead.businessName} added`,
    tone: "green",
  }));
  const recentSentActivities: ActivityRow[] = (automationOverview?.recentSent ?? []).slice(0, 2).map((email) => ({
    date: email.sentAt,
    detail: email.lead?.businessName || email.recipientEmail,
    icon: Send,
    time: formatTime(email.sentAt),
    title: "Outreach email sent",
    tone: "cyan",
  }));
  const recentRunActivities: ActivityRow[] = scrapeJobs.slice(0, 1).map((job) => ({
    date: job.updatedAt,
    detail: `${job.niche} in ${job.city}`,
    icon: Cog,
    time: formatTime(job.updatedAt),
    title: `Lead Generator ${job.status}`,
    tone: job.status === "failed" ? "amber" : "blue",
  }));
  const recentResponseActivities: ActivityRow[] = leads
    .filter((lead) => lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED")
    .slice(0, 2)
    .map((lead) => ({
      date: lead.lastContactedAt || lead.createdAt,
      detail: lead.businessName,
      icon: Database,
      time: formatTime(lead.lastContactedAt || lead.createdAt),
      title: lead.outreachStatus === "INTERESTED" ? "Interested response received" : "Reply received",
      tone: "green",
    }));

  const activity = [...recentLeadActivities, ...recentSentActivities, ...recentResponseActivities, ...recentRunActivities]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  const campaignRows = [
    ["Ready First Touch", formatNumber(automationOverview?.stats.ready ?? 0), formatPercent(automationOverview?.stats.ready ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(interested)],
    ["Queued Automation", formatNumber(automationOverview?.stats.queued ?? 0), formatPercent(automationOverview?.stats.queued ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(automationOverview?.stats.sending ?? 0)],
    ["Active Follow Up", formatNumber(automationOverview?.stats.active ?? 0), formatPercent(responses, Math.max(activeOutreach, 1), 1), formatNumber(responses)],
    ["Completed Sequences", formatNumber(automationOverview?.stats.completed ?? 0), formatPercent(automationOverview?.stats.completed ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(automationOverview?.stats.replied ?? 0)],
    ["Blocked Workflows", formatNumber(automationOverview?.stats.blocked ?? 0), formatPercent(automationOverview?.stats.blocked ?? 0, Math.max(activeWorkflows, 1), 1), "0"],
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Hero — big, gradient, with status row + primary CTAs */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[radial-gradient(ellipse_1200px_400px_at_top,rgba(16,185,129,0.10),transparent_60%),radial-gradient(ellipse_800px_300px_at_top_right,rgba(59,130,246,0.08),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))] px-6 py-9 md:px-10 md:py-12">
        {/* Decorative grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />

        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                Engine Live · {automationOverview.engine.mode}
              </span>
            </div>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight text-white md:text-6xl">
              Pipeline overview
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 md:text-base">
              Source, enrich, qualify, and send — autonomously. The engine runs every minute and
              never stops.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                asChild
                className="h-11 cursor-pointer gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black shadow-[0_8px_30px_rgba(255,255,255,0.12)] hover:bg-zinc-200"
              >
                <Link href="/outreach">
                  <Sparkles className="h-4 w-4" />
                  Open Outreach
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 cursor-pointer gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-5 text-sm text-white hover:bg-white/[0.06]"
              >
                <Link href="/automation">
                  <Bot className="h-4 w-4" />
                  Tune Automation
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 cursor-pointer gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-5 text-sm text-white hover:bg-white/[0.06]"
              >
                <Link href="/hunt">
                  <Target className="h-4 w-4" />
                  Source Leads
                </Link>
              </Button>
            </div>
          </div>

          {/* Status panel */}
          <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-[480px]">
            <StatusTile
              label="Lead Generator"
              value={activeRun ? `${activeRun.niche}` : "Idle"}
              sub={activeRun ? `in ${activeRun.city}` : "Ready for next market"}
              dot={activeRun ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}
            />
            <StatusTile
              label="Next send"
              value={formatRunTime(automationOverview.engine.nextSendAt, "—")}
              sub={`${automationOverview.stats.scheduledToday} today`}
              dot="bg-cyan-400"
            />
            <StatusTile
              label="Follow-ups"
              value={`${activeFollowUps} live`}
              sub={`${blockedFollowUps} blocked`}
              dot={blockedFollowUps > 0 ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}
            />
          </div>
        </div>
      </section>

      {/* KPI strip — 6 tiles, gradient accents, big numbers */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]`}
          >
            <div className={`pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br ${kpi.accent} blur-2xl`} aria-hidden />
            <div className="relative">
              <div className="flex items-center justify-between">
                {kpi.icon}
                <Activity className="h-3 w-3 text-zinc-700 transition-colors group-hover:text-zinc-500" />
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums text-white">
                {kpi.value.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-zinc-300">{kpi.label}</div>
              <div className="mt-0.5 text-[10px] text-zinc-500">{kpi.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Two-column: Attention Board + Recent Activity */}
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Attention Board</p>
              <h2 className="mt-1.5 text-2xl font-semibold text-white">Route the next action</h2>
            </div>
            <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10px] font-mono text-zinc-500">
              live
            </div>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {attentionBoard.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-black/40 via-black/20 to-transparent p-4 transition-all hover:border-white/[0.14] hover:bg-white/[0.03]"
              >
                <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${item.glow} blur-3xl opacity-60 transition-opacity group-hover:opacity-100`} aria-hidden />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 ${item.accent}`}>
                      {item.icon}
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        {item.label}
                      </span>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-white" />
                  </div>
                  <div className="mt-3 text-4xl font-bold tabular-nums text-white">
                    {item.value.toLocaleString()}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-400">{item.detail}</div>
                  <div className={`mt-4 inline-flex items-center gap-1 text-[11px] font-medium ${item.accent}`}>
                    {item.action}
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Recent Activity</p>
            <h2 className="mt-1.5 text-2xl font-semibold text-white">Replies and sends</h2>
          </div>

          <div className="mt-6 space-y-2">
            {repliedLeads.length === 0 && recentSendEvents.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-12 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02]">
                  <Activity className="h-4 w-4 text-zinc-600" />
                </div>
                <p className="mt-3 text-sm text-zinc-500">
                  Activity will surface here once the pipeline starts moving.
                </p>
              </div>
            ) : (
              <>
                {repliedLeads.map((lead) => (
                  <ActivityRow
                    key={`reply:${lead.id}`}
                    icon={<Reply className="h-3.5 w-3.5 text-emerald-400" />}
                    iconBg="bg-emerald-500/10 border-emerald-500/20"
                    title="Reply detected"
                    detail={`${lead.businessName} · ${lead.city || ""}`}
                    when={formatRunTime(lead.lastContactedAt, "Recent")}
                    accent="text-emerald-300"
                  />
                ))}
                {recentSendEvents.map((event) => (
                  <ActivityRow
                    key={`send:${event.id}`}
                    icon={<CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />}
                    iconBg="bg-cyan-500/10 border-cyan-500/20"
                    title="Email sent"
                    detail={event.lead?.businessName || event.recipientEmail}
                    when={formatRunTime(event.sentAt, "Recent")}
                    accent="text-cyan-300"
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center justify-between border-b border-[#24313c] px-5">
            <h2 className="text-base font-semibold text-white">Top Performing Campaigns</h2>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>
          <div className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-3 text-[12px] text-[#9aa5b1]">
            <span>Campaign</span>
            <span>Responses</span>
            <span>Rate</span>
            <span>Meetings</span>
          </div>
          {campaignRows.map((row) => (
            <div key={row[0]} className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-[15px] text-sm">
              <span className="font-medium text-white">{row[0]}</span>
              <span className="text-[#d9e0e8]">{row[1]}</span>
              <span className="text-[#d9e0e8]">{row[2]}</span>
              <span className="text-[#d9e0e8]">{row[3]}</span>
            </div>
          ))}
          <div className="p-4">
            <button className="flex h-9 w-full items-center justify-between rounded-md border border-[#2a3644] bg-[#151f2b] px-3 text-sm font-medium text-white" type="button">
              View All Campaigns
              <span className="text-lg leading-none">-&gt;</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusTile({
  label,
  value,
  sub,
  dot,
}: {
  label: string;
  value: string;
  sub: string;
  dot: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-white">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-zinc-500">{sub}</div>
    </div>
  );
}

function ActivityRow({
  icon,
  iconBg,
  title,
  detail,
  when,
  accent,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  detail: string;
  when: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-black/20 px-3 py-2.5 transition-colors hover:border-white/[0.08] hover:bg-white/[0.02]">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${accent}`}>{title}</div>
        <div className="truncate text-[11px] text-zinc-400">{detail}</div>
      </div>
      <div className="shrink-0 text-[10px] tabular-nums text-zinc-600">{when}</div>
    </div>
  );
}
