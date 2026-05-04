import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  DollarSign,
  MailCheck,
  Radar,
  Reply,
  Target,
  Users,
} from "lucide-react";

import {
  AUTOMATION_SETTINGS_DEFAULTS,
  AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
  MAILBOX_DAILY_SEND_TARGET,
} from "@/lib/automation-policy";
import { countAdequateLeadsToday } from "@/lib/autonomous-intake";
import { getDatabase } from "@/lib/cloudflare";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { listRecentScrapeTargets, pickNextScrapeTarget, countActiveScrapeTargets } from "@/lib/scrape-targets";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const TARGET_DAILY_SEND = MAILBOX_DAILY_SEND_TARGET * 2; // 80 across 2 mailboxes

function emptyAutomationOverview() {
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
      mode: "ACTIVE" as const,
      nextSendAt: null,
      scheduledToday: 0,
      blockedCount: 0,
      replyStoppedCount: 0,
      readyCount: 0,
      queuedCount: 0,
      waitingCount: 0,
      sendingCount: 0,
    },
    pipeline: {
      needsEnrichment: 0,
      enriching: 0,
      enriched: 0,
      readyForTouch: 0,
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

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function relativeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (!Number.isFinite(diff) || diff < 0) return formatAppDateTime(d, undefined, "—");
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

async function getSendsToday(): Promise<{ total: number; perSender: Record<string, number> }> {
  const since = startOfTodayUtc().toISOString();
  const result = await getDatabase()
    .prepare(
      `SELECT "senderEmail", COUNT(*) AS count FROM "OutreachEmail"
       WHERE "status" = 'sent' AND "sentAt" >= ?
       GROUP BY "senderEmail"`,
    )
    .bind(since)
    .all<{ senderEmail: string; count: number | string }>();

  const perSender: Record<string, number> = {};
  let total = 0;
  for (const row of result.results ?? []) {
    const c = Number(row.count || 0);
    perSender[row.senderEmail] = c;
    total += c;
  }
  return { total, perSender };
}

async function get7DaySeries(): Promise<{
  leadsFound: number[];
  enriched: number[];
  queued: number[];
  sent: number[];
  replied: number[];
}> {
  const db = getDatabase();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    days.push(d.toISOString());
  }
  const dayEnd = (iso: string) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };

  const [leadsFound, enriched, queued, sent, replied] = await Promise.all([
    Promise.all(
      days.map(async (start) => {
        const r = await db
          .prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "createdAt" >= ? AND "createdAt" < ?`)
          .bind(start, dayEnd(start))
          .first<{ c: number | string }>();
        return Number(r?.c || 0);
      }),
    ),
    Promise.all(
      days.map(async (start) => {
        const r = await db
          .prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "enrichedAt" >= ? AND "enrichedAt" < ?`)
          .bind(start, dayEnd(start))
          .first<{ c: number | string }>();
        return Number(r?.c || 0);
      }),
    ),
    Promise.all(
      days.map(async (start) => {
        const r = await db
          .prepare(`SELECT COUNT(*) AS c FROM "OutreachSequence" WHERE "createdAt" >= ? AND "createdAt" < ?`)
          .bind(start, dayEnd(start))
          .first<{ c: number | string }>();
        return Number(r?.c || 0);
      }),
    ),
    Promise.all(
      days.map(async (start) => {
        const r = await db
          .prepare(`SELECT COUNT(*) AS c FROM "OutreachEmail" WHERE "status"='sent' AND "sentAt" >= ? AND "sentAt" < ?`)
          .bind(start, dayEnd(start))
          .first<{ c: number | string }>();
        return Number(r?.c || 0);
      }),
    ),
    Promise.all(
      days.map(async (start) => {
        const r = await db
          .prepare(
            `SELECT COUNT(*) AS c FROM "OutreachSequence"
             WHERE "replyDetectedAt" >= ? AND "replyDetectedAt" < ?`,
          )
          .bind(start, dayEnd(start))
          .first<{ c: number | string }>();
        return Number(r?.c || 0);
      }),
    ),
  ]);

  return { leadsFound, enriched, queued, sent, replied };
}

async function getCrmStats() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const [mrrRow, activeCount, proposalCount, renewalCount, lostCount] = await Promise.all([
    db.prepare(
      `SELECT COALESCE(SUM("monthlyValue"), 0) AS mrr FROM "Lead"
       WHERE "dealStage" IN ('ACTIVE', 'RETAINED') AND "monthlyValue" IS NOT NULL AND "isArchived" = 0`,
    ).first<{ mrr: number | string }>(),
    db.prepare(
      `SELECT COUNT(*) AS c FROM "Lead" WHERE "dealStage" IN ('ACTIVE', 'RETAINED') AND "isArchived" = 0`,
    ).first<{ c: number | string }>(),
    db.prepare(
      `SELECT COUNT(*) AS c FROM "Lead" WHERE "dealStage" IN ('PROPOSAL_SENT', 'NEGOTIATING', 'SIGNED') AND "isArchived" = 0`,
    ).first<{ c: number | string }>(),
    db.prepare(
      `SELECT COUNT(*) AS c FROM "Lead"
       WHERE "renewalDate" IS NOT NULL AND "renewalDate" <= ? AND "renewalDate" >= ? AND "isArchived" = 0`,
    ).bind(in30, now).first<{ c: number | string }>(),
    db.prepare(
      `SELECT COUNT(*) AS c FROM "Lead" WHERE "dealStage" = 'LOST' AND "isArchived" = 0`,
    ).first<{ c: number | string }>(),
  ]);

  return {
    mrr: Number(mrrRow?.mrr ?? 0),
    activeClients: Number(activeCount?.c ?? 0),
    inPipeline: Number(proposalCount?.c ?? 0),
    renewalsDue: Number(renewalCount?.c ?? 0),
    lostDeals: Number(lostCount?.c ?? 0),
  };
}

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const [
    automation,
    scrapeJobs,
    leadCount,
    repliedCount,
    contactedCount,
    adequateToday,
    sendsToday,
    recentTargets,
    nextTarget,
    activeTargets,
    series,
    crmStats,
  ] = await Promise.all([
    listAutomationOverview().catch(() => emptyAutomationOverview()),
    listScrapeJobs(8).catch(() => []),
    prisma.lead.count({ where: { isArchived: false } }),
    prisma.lead.count({ where: { outreachStatus: "REPLIED" } }),
    prisma.lead.count({ where: { firstContactedAt: { not: null } } }).catch(async () => {
      const r = await getDatabase()
        .prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "firstContactedAt" IS NOT NULL`)
        .first<{ c: number | string }>();
      return Number(r?.c || 0);
    }),
    countAdequateLeadsToday().catch(() => 0),
    getSendsToday().catch(() => ({ total: 0, perSender: {} as Record<string, number> })),
    listRecentScrapeTargets(5).catch(() => []),
    pickNextScrapeTarget().catch(() => null),
    countActiveScrapeTargets().catch(() => 0),
    get7DaySeries().catch(() => ({
      leadsFound: Array(7).fill(0),
      enriched: Array(7).fill(0),
      queued: Array(7).fill(0),
      sent: Array(7).fill(0),
      replied: Array(7).fill(0),
    })),
    getCrmStats().catch(() => ({ mrr: 0, activeClients: 0, inPipeline: 0, renewalsDue: 0, lostDeals: 0 })),
  ]);

  const activeScrape = scrapeJobs.find((j) => j.status === "running" || j.status === "claimed") ?? null;
  const replyRate = contactedCount > 0 ? (repliedCount / contactedCount) * 100 : 0;

  const aidanSends = sendsToday.perSender["aidan@getaxiom.ca"] || 0;
  const rileySends = sendsToday.perSender["riley@getaxiom.ca"] || 0;

  const intakePct = Math.min(100, (adequateToday / AUTONOMOUS_DAILY_LEAD_INTAKE_CAP) * 100);
  const sendPct = Math.min(100, (sendsToday.total / TARGET_DAILY_SEND) * 100);
  const aidanPct = Math.min(100, (aidanSends / MAILBOX_DAILY_SEND_TARGET) * 100);
  const rileyPct = Math.min(100, (rileySends / MAILBOX_DAILY_SEND_TARGET) * 100);

  const intakeTone: ToneKey = adequateToday >= AUTONOMOUS_DAILY_LEAD_INTAKE_CAP ? "amber" : "emerald";
  const sendTone: ToneKey = sendsToday.total >= TARGET_DAILY_SEND ? "amber" : "cyan";

  // Direct mailbox-table check — independent of listAutomationOverview()
  // so a broken helper doesn't make the banner falsely show "not connected".
  const connectedRows = await getDatabase()
    .prepare(`SELECT LOWER("gmailAddress") AS gmailAddress FROM "OutreachMailbox"`)
    .all<{ gmailAddress: string }>()
    .then((r) => r.results ?? [])
    .catch(() => [] as Array<{ gmailAddress: string }>);
  const connectedSet = new Set(connectedRows.map((r) => (r.gmailAddress || "").toLowerCase()));
  const aidanConnected = connectedSet.has("aidan@getaxiom.ca");
  const rileyConnected = connectedSet.has("riley@getaxiom.ca");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="v2-eyebrow inline-flex items-center gap-2 text-[10px]">
            <span className="v2-dot text-emerald-400" />
            Autonomous Pipeline · live
          </span>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.025em] text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Read-only monitoring. Cron tick every 60s. No human input required.
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-right text-[11px] text-zinc-400">
          <div className="font-medium text-zinc-200">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}
          </div>
          <div className="font-mono text-[10.5px] text-zinc-500">
            {formatAppDateTime(new Date(), { hour: "numeric", minute: "2-digit" }, "")}
          </div>
        </div>
      </header>

      {automation.settings.emergencyPaused ? (
        <div className="v2-card border-red-400/25 bg-red-500/[0.07] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="v2-pill border-red-400/30 bg-red-500/[0.12] text-red-200">Emergency stop active</span>
            <span className="text-sm text-red-100/80">
              Intake, queueing, and sending are blocked until the stop is cleared in Settings.
            </span>
          </div>
        </div>
      ) : null}

      {(!aidanConnected || !rileyConnected) ? (
        <div className="flex items-center gap-3 rounded-md border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-sm">
          <Activity className="size-4 text-amber-300" />
          <div className="flex-1">
            <span className="font-medium text-amber-200">
              {[!aidanConnected && "aidan@getaxiom.ca", !rileyConnected && "riley@getaxiom.ca"]
                .filter(Boolean)
                .join(" and ")}{" "}
              not connected.
            </span>
            <span className="ml-2 text-amber-100/70">
              Visit <a href="/settings" className="underline hover:text-white">Settings</a> to connect Gmail (one-time OAuth).
            </span>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <Panel
          title="Autonomous Intake"
          subtitle="Lead generation today"
          accent="emerald"
        >
          <RatioMeter
            label="Adequate leads"
            value={adequateToday}
            cap={AUTONOMOUS_DAILY_LEAD_INTAKE_CAP}
            pct={intakePct}
            tone={intakeTone}
            footnote="axiom score ≥ 45, non-D, non-generic email"
          />
          <Divider />
          <KvRow icon={<Radar className="size-3.5" />} label="Active targets" value={activeTargets.toLocaleString()} />
          <KvRow icon={<Activity className="size-3.5" />} label="Scrape state" value={activeScrape ? `${activeScrape.niche} · ${activeScrape.city}` : "Idle"} />
          <KvRow icon={<Clock3 className="size-3.5" />} label="Next dispatch" value={nextTarget ? `${nextTarget.niche} · ${nextTarget.city}` : "—"} />
          <Divider />
          <SubLabel>Recently dispatched</SubLabel>
          <ul className="space-y-1">
            {recentTargets.length === 0 ? (
              <li className="text-xs text-zinc-600">No dispatches yet — autonomous intake will start on the next cron tick.</li>
            ) : (
              recentTargets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-zinc-300">
                    <span className="font-mono text-zinc-500">{t.niche}</span>
                    <span className="px-1.5 text-zinc-700">·</span>
                    <span>{t.city}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">{relativeAgo(t.lastRunAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel
          title="Send Health"
          subtitle="Outbound email volume"
          accent="cyan"
        >
          <RatioMeter
            label="Sent today"
            value={sendsToday.total}
            cap={TARGET_DAILY_SEND}
            pct={sendPct}
            tone={sendTone}
            footnote={`${MAILBOX_DAILY_SEND_TARGET}/day per mailbox · 80/day total`}
          />
          <Divider />
          <MailboxBar email="aidan@getaxiom.ca" sent={aidanSends} cap={MAILBOX_DAILY_SEND_TARGET} pct={aidanPct} connected={aidanConnected} />
          <MailboxBar email="riley@getaxiom.ca" sent={rileySends} cap={MAILBOX_DAILY_SEND_TARGET} pct={rileyPct} connected={rileyConnected} />
          <Divider />
          <KvRow icon={<MailCheck className="size-3.5" />} label="Reply rate" value={`${replyRate.toFixed(1)}%`} />
          <KvRow icon={<Reply className="size-3.5" />} label="Replies (all-time)" value={repliedCount.toLocaleString()} />
          <KvRow icon={<Bot className="size-3.5" />} label="Engine" value={automation.engine.mode} />
        </Panel>

        <Panel
          title="Pipeline Throughput"
          subtitle="Last 7 days"
          accent="violet"
        >
          <Sparkline label="Leads found" series={series.leadsFound} tone="emerald" />
          <Sparkline label="Enriched" series={series.enriched} tone="cyan" />
          <Sparkline label="Queued" series={series.queued} tone="violet" />
          <Sparkline label="Sent" series={series.sent} tone="blue" />
          <Sparkline label="Replied" series={series.replied} tone="amber" />
          <Divider />
          <KvRow icon={<Target className="size-3.5" />} label="Total leads" value={leadCount.toLocaleString()} />
          <KvRow icon={<CheckCircle2 className="size-3.5" />} label="Contacted" value={contactedCount.toLocaleString()} />
        </Panel>

        <Panel
          title="Revenue"
          subtitle="CRM deal pipeline"
          accent="amber"
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold text-emerald-300 tabular-nums">
              ${crmStats.mrr.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-500">/mo MRR</span>
          </div>
          <Divider />
          <KvRow icon={<Users className="size-3.5" />} label="Active clients" value={crmStats.activeClients.toLocaleString()} />
          <KvRow icon={<DollarSign className="size-3.5" />} label="In pipeline" value={crmStats.inPipeline.toLocaleString()} />
          <KvRow
            icon={<CheckCircle2 className="size-3.5" />}
            label="Renewals due ≤30d"
            value={
              crmStats.renewalsDue > 0 ? (
                <span className="text-amber-300">{crmStats.renewalsDue}</span>
              ) : (
                "0"
              )
            }
          />
          <KvRow icon={<Reply className="size-3.5" />} label="Lost deals" value={crmStats.lostDeals.toLocaleString()} />
          <Divider />
          <a
            href="/clients"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
          >
            <Users className="size-3.5" />
            Open client board →
          </a>
        </Panel>
      </section>
    </div>
  );
}

type ToneKey = "emerald" | "cyan" | "violet" | "blue" | "amber" | "red";

const TONE: Record<ToneKey, { ring: string; bar: string; text: string; bg: string; border: string }> = {
  emerald: {
    ring: "stroke-emerald-400",
    bar: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
  },
  cyan: { ring: "stroke-cyan-400", bar: "bg-cyan-400", text: "text-cyan-300", bg: "bg-cyan-400/10", border: "border-cyan-400/30" },
  violet: { ring: "stroke-violet-400", bar: "bg-violet-400", text: "text-violet-300", bg: "bg-violet-400/10", border: "border-violet-400/30" },
  blue: { ring: "stroke-blue-400", bar: "bg-blue-400", text: "text-blue-300", bg: "bg-blue-400/10", border: "border-blue-400/30" },
  amber: { ring: "stroke-amber-400", bar: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-400/10", border: "border-amber-400/30" },
  red: { ring: "stroke-red-400", bar: "bg-red-400", text: "text-red-300", bg: "bg-red-400/10", border: "border-red-400/30" },
};

function Panel({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: ToneKey;
  children: ReactNode;
}) {
  return (
    <div className="v2-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</div>
        </div>
        <span className={`inline-flex h-2 w-2 rounded-full ${TONE[accent].bar}`} />
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="-mx-4 my-2 h-px bg-white/[0.06]" />;
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{children}</div>;
}

function RatioMeter({
  label,
  value,
  cap,
  pct,
  tone,
  footnote,
}: {
  label: string;
  value: number;
  cap: number;
  pct: number;
  tone: ToneKey;
  footnote?: string;
}) {
  const t = TONE[tone];
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 88 88" className="size-24 -rotate-90">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            className={t.ring}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`animate-counter-up font-mono text-2xl font-semibold tabular-nums ${t.text}`}>{value}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">/ {cap}</div>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{pct.toFixed(0)}%</div>
        {footnote ? <div className="mt-1 text-[11px] leading-4 text-zinc-500">{footnote}</div> : null}
      </div>
    </div>
  );
}

function KvRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="inline-flex items-center gap-2 text-zinc-500">
        {icon}
        {label}
      </span>
      <span className="truncate font-mono tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

function MailboxBar({
  email,
  sent,
  cap,
  pct,
  connected,
}: {
  email: string;
  sent: number;
  cap: number;
  pct: number;
  connected: boolean;
}) {
  const tone: ToneKey = !connected ? "red" : pct >= 100 ? "amber" : "cyan";
  const t = TONE[tone];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="truncate font-mono text-zinc-300">{email}</span>
        <span className={`shrink-0 ${connected ? t.text : "text-red-300"}`}>
          {connected ? `${sent} / ${cap}` : "not connected"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        {connected ? (
          <div className={`h-full ${t.bar} progress-animate transition-[width]`} style={{ width: `${pct}%` }} />
        ) : null}
      </div>
    </div>
  );
}

function Sparkline({ label, series, tone }: { label: string; series: number[]; tone: ToneKey }) {
  const t = TONE[tone];
  const max = Math.max(1, ...series);
  const total = series.reduce((sum, n) => sum + n, 0);
  const today = series[series.length - 1] || 0;
  const W = 160;
  const H = 28;
  const step = W / Math.max(1, series.length - 1);
  const points = series
    .map((n, i) => `${i * step},${H - (n / max) * (H - 4) - 2}`)
    .join(" ");
  const last = series.length - 1;
  const lastY = H - (today / max) * (H - 4) - 2;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold tabular-nums text-white">{today}</span>
          <span className="text-[10px] text-zinc-500">today · {total} / 7d</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[160px]">
        <polyline
          points={points}
          fill="none"
          className={t.ring}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last * step} cy={lastY} r="2" className={`${t.ring} fill-current ${t.text}`} />
      </svg>
    </div>
  );
}
