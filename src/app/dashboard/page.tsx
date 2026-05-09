import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Clock3,
  Crosshair,
  DollarSign,
  Filter,
  Inbox,
  Mail,
  MailCheck,
  Radar,
  Reply,
  ScrollText,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  AUTOMATION_SETTINGS_DEFAULTS,
  MAILBOX_DAILY_SEND_TARGET,
} from "@/lib/automation-policy";
import { countAdequateLeadsToday, getAutonomousDailyLeadCap } from "@/lib/autonomous-intake";
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

const BUSINESS_TZ = "America/Toronto";

/**
 * Cloudflare Workers run in UTC. The business operates in Eastern time.
 * This returns the integer UTC offset for Eastern right now (-4 EDT / -5 EST)
 * by comparing what Intl reports as Eastern time vs. UTC.
 */
function getEasternOffsetHours(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const easternMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((easternMs - now.getTime()) / 3_600_000); // -4 or -5
}

/**
 * Returns a Date representing midnight Eastern time today (expressed in UTC).
 * e.g. at 20:48 ET on May 4: returns 2026-05-04T04:00:00Z (EDT = UTC-4)
 */
function startOfTodayEastern(): Date {
  const offset = getEasternOffsetHours(); // e.g. -4
  const easternDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "2026-05-04"
  const [year, month, day] = easternDateStr.split("-").map(Number);
  // Eastern midnight in UTC = that date at 00:00 ET = 00:00 - offset in UTC
  return new Date(Date.UTC(year, month - 1, day, -offset, 0, 0));
}

/** Returns the current date string (YYYY-MM-DD) in Eastern time */
function todayEasternStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
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
  const since = startOfTodayEastern().toISOString();
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
  const offsetHours = getEasternOffsetHours(); // -4 (EDT) or -5 (EST)
  // SQLite modifier string: adjusts a stored UTC timestamp to Eastern local time
  // so that date() returns the Eastern calendar date, not the UTC calendar date.
  const tzMod = `${offsetHours} hours`; // e.g. "-4 hours"

  // Build 7 Eastern calendar dates (YYYY-MM-DD) oldest → newest.
  // We compute them as plain UTC dates using the Eastern calendar day as the
  // date portion (offset only matters for the time, not the calendar day here).
  const todayStr = todayEasternStr(); // "2026-05-04"
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1, td - i));
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  // Start of 7-day window = Eastern midnight 6 days ago (UTC-expressed)
  const start7 = new Date(startOfTodayEastern().getTime() - 6 * 86_400_000).toISOString();

  // Group by Eastern calendar date using SQLite's datetime() offset modifier.
  // date(datetime(col, '-4 hours')) converts the UTC timestamp to Eastern time
  // before extracting the date, so midnight crossings land on the correct day.
  const toSeries = (rows: Array<{ d: string; c: number | string }>) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.d) map.set(row.d, Number(row.c || 0));
    }
    return dayKeys.map((k) => map.get(k) ?? 0);
  };

  const [leadsFoundRows, enrichedRows, queuedRows, sentRows, repliedRows] = await Promise.all([
    db
      .prepare(`SELECT date(datetime("createdAt", '${tzMod}')) AS d, COUNT(*) AS c FROM "Lead" WHERE "createdAt" >= ? GROUP BY 1`)
      .bind(start7)
      .all<{ d: string; c: number | string }>(),
    db
      .prepare(`SELECT date(datetime("enrichedAt", '${tzMod}')) AS d, COUNT(*) AS c FROM "Lead" WHERE "enrichedAt" IS NOT NULL AND "enrichedAt" >= ? GROUP BY 1`)
      .bind(start7)
      .all<{ d: string; c: number | string }>(),
    db
      .prepare(`SELECT date(datetime("createdAt", '${tzMod}')) AS d, COUNT(*) AS c FROM "OutreachSequence" WHERE "createdAt" >= ? GROUP BY 1`)
      .bind(start7)
      .all<{ d: string; c: number | string }>(),
    db
      .prepare(`SELECT date(datetime("sentAt", '${tzMod}')) AS d, COUNT(*) AS c FROM "OutreachEmail" WHERE "status" = 'sent' AND "sentAt" >= ? GROUP BY 1`)
      .bind(start7)
      .all<{ d: string; c: number | string }>(),
    db
      .prepare(`SELECT date(datetime("replyDetectedAt", '${tzMod}')) AS d, COUNT(*) AS c FROM "OutreachSequence" WHERE "replyDetectedAt" IS NOT NULL AND "replyDetectedAt" >= ? GROUP BY 1`)
      .bind(start7)
      .all<{ d: string; c: number | string }>(),
  ]);
  return {
    leadsFound: toSeries(leadsFoundRows.results ?? []),
    enriched: toSeries(enrichedRows.results ?? []),
    queued: toSeries(queuedRows.results ?? []),
    sent: toSeries(sentRows.results ?? []),
    replied: toSeries(repliedRows.results ?? []),
  };
}

type CrmStats = {
  mrr: number;
  activeClients: number;
  inPipeline: number;
  renewalsDue: number;
  lostDeals: number;
  forecast: number;
};

const EMPTY_CRM_STATS: CrmStats = {
  mrr: 0,
  activeClients: 0,
  inPipeline: 0,
  renewalsDue: 0,
  lostDeals: 0,
  forecast: 0,
};

async function getCrmStats(): Promise<CrmStats> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const [mrrRow, activeCount, proposalCount, renewalCount, lostCount, forecastRow] = await Promise.all([
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
    db.prepare(
      `SELECT COALESCE(SUM(
        CASE "dealStage"
          WHEN 'PROPOSAL_SENT' THEN "monthlyValue" * 0.2
          WHEN 'NEGOTIATING' THEN "monthlyValue" * 0.5
          WHEN 'SIGNED' THEN "monthlyValue" * 0.9
          ELSE 0
        END
      ), 0) AS forecast FROM "Lead"
       WHERE "dealStage" IN ('PROPOSAL_SENT', 'NEGOTIATING', 'SIGNED')
         AND "monthlyValue" IS NOT NULL AND "isArchived" = 0`,
    ).first<{ forecast: number | string }>(),
  ]);

  return {
    mrr: Number(mrrRow?.mrr ?? 0),
    activeClients: Number(activeCount?.c ?? 0),
    inPipeline: Number(proposalCount?.c ?? 0),
    renewalsDue: Number(renewalCount?.c ?? 0),
    lostDeals: Number(lostCount?.c ?? 0),
    forecast: Number(forecastRow?.forecast ?? 0),
  };
}

type ReplyInboxItem = {
  id: number;
  businessName: string;
  city: string | null;
  niche: string | null;
  email: string | null;
  lastReplyAt: string | null;
  dealStage: string | null;
  replyAgeLabel: string;
  replyAgeHours: number;
};

async function getReplyInbox(): Promise<ReplyInboxItem[]> {
  const db = getDatabase();
  const result = await db.prepare(`
    SELECT id, businessName, city, niche, email, lastReplyAt, dealStage
    FROM "Lead"
    WHERE outreachStatus = 'REPLIED' AND dealStage IS NULL AND isArchived = 0
    ORDER BY lastReplyAt DESC
    LIMIT 10
  `).all<Omit<ReplyInboxItem, "replyAgeLabel" | "replyAgeHours">>();

  const nowMs = Date.now();
  return (result.results ?? []).map((item) => {
    const replyAge = item.lastReplyAt ? nowMs - new Date(item.lastReplyAt).getTime() : 0;
    const mins = Math.max(0, Math.floor(replyAge / 60_000));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    return {
      ...item,
      replyAgeLabel: days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : mins > 0 ? `${mins}m ago` : "just now",
      replyAgeHours: hours,
    };
  });
}

async function getConversionFunnel() {
  const db = getDatabase();
  const [totalRow, qualifiedRow, contactedRow, repliedRow, pipelineRow, wonRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE isArchived = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE axiomScore >= 45 AND isArchived = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE firstContactedAt IS NOT NULL`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE outreachStatus = 'REPLIED'`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE dealStage IS NOT NULL AND dealStage != 'LOST' AND isArchived = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE dealStage IN ('SIGNED', 'ACTIVE', 'DELIVERED', 'RETAINED') AND isArchived = 0`).first<{ c: number | string }>(),
  ]);
  return {
    total: Number(totalRow?.c ?? 0),
    qualified: Number(qualifiedRow?.c ?? 0),
    contacted: Number(contactedRow?.c ?? 0),
    replied: Number(repliedRow?.c ?? 0),
    pipeline: Number(pipelineRow?.c ?? 0),
    won: Number(wonRow?.c ?? 0),
  };
}

type FollowUpItem = {
  id: number;
  businessName: string;
  dealStage: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  monthlyValue: number | null;
};

async function getFollowUpItems() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const easternToday = startOfTodayEastern();
  const todayStart = easternToday.toISOString();
  const tomorrowStart = new Date(easternToday.getTime() + 86_400_000).toISOString();
  const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const riskyCutoff = new Date(Date.now() - 21 * 86_400_000).toISOString();

  const [overdue, dueToday, stale, risky] = await Promise.all([
    // Overdue: past-due action items
    db.prepare(`
      SELECT id, businessName, dealStage, nextAction, nextActionDueAt, monthlyValue
      FROM "Lead"
      WHERE dealStage IS NOT NULL AND dealStage != 'LOST'
        AND nextActionDueAt IS NOT NULL AND nextActionDueAt < ?
        AND isArchived = 0
      ORDER BY nextActionDueAt ASC LIMIT 8
    `).bind(todayStart).all<FollowUpItem>(),

    // Due today
    db.prepare(`
      SELECT id, businessName, dealStage, nextAction, nextActionDueAt, monthlyValue
      FROM "Lead"
      WHERE dealStage IS NOT NULL AND dealStage != 'LOST'
        AND nextActionDueAt >= ? AND nextActionDueAt < ?
        AND isArchived = 0
      ORDER BY nextActionDueAt ASC LIMIT 8
    `).bind(todayStart, tomorrowStart).all<FollowUpItem>(),

    // Stale: open deal, no outbound or reply in 14+ days
    db.prepare(`
      SELECT id, businessName, dealStage, nextAction, nextActionDueAt, monthlyValue
      FROM "Lead"
      WHERE dealStage IN ('PROPOSAL_SENT', 'NEGOTIATING')
        AND (lastReplyAt IS NULL OR lastReplyAt < ?)
        AND (lastContactedAt IS NULL OR lastContactedAt < ?)
        AND isArchived = 0
      ORDER BY lastContactedAt ASC LIMIT 8
    `).bind(staleCutoff, staleCutoff).all<FollowUpItem>(),

    // Risky: proposal sent 21+ days ago, no sign
    db.prepare(`
      SELECT id, businessName, dealStage, nextAction, nextActionDueAt, monthlyValue
      FROM "Lead"
      WHERE dealStage = 'PROPOSAL_SENT'
        AND proposalSentAt IS NOT NULL AND proposalSentAt < ?
        AND isArchived = 0
      ORDER BY proposalSentAt ASC LIMIT 8
    `).bind(riskyCutoff).all<FollowUpItem>(),
  ]);

  // dedupe stale vs risky by id — risky takes precedence
  const riskyIds = new Set((risky.results ?? []).map((r) => r.id));
  const filteredStale = (stale.results ?? []).filter((r) => !riskyIds.has(r.id));

  return {
    overdue: overdue.results ?? [],
    dueToday: dueToday.results ?? [],
    stale: filteredStale,
    risky: risky.results ?? [],
    now,
  };
}

type AuditEntry = { id: string; type: string; title: string; createdAt: string; businessName: string | null; leadId: number | null };

async function getAuditLog(): Promise<AuditEntry[]> {
  const db = getDatabase();
  const rows = await db.prepare(
    `SELECT a."id", a."type", a."title", a."createdAt",
            l."businessName", l."id" AS "leadId"
     FROM "CrmActivity" a
     LEFT JOIN "Lead" l ON a."leadId" = l."id"
     ORDER BY datetime(a."createdAt") DESC
     LIMIT 20`,
  ).all<AuditEntry>().catch(() => ({ results: [] as AuditEntry[] }));
  return rows.results ?? [];
}

type ScrapeTargetRow = { id: string; niche: string; city: string; status: string; lastScrapedAt: string | null; leadCount: number };

async function getScrapeTargetList(): Promise<ScrapeTargetRow[]> {
  const db = getDatabase();
  const rows = await db.prepare(
    `SELECT st."id", st."niche", st."city", st."status", st."lastScrapedAt",
            (SELECT COUNT(*) FROM "Lead" l WHERE l."niche" = st."niche" AND l."city" = st."city" AND COALESCE(l."isArchived",0) = 0) AS "leadCount"
     FROM "ScrapeTarget" st
     WHERE st."status" != 'disabled'
     ORDER BY st."lastScrapedAt" DESC
     LIMIT 20`,
  ).all<ScrapeTargetRow>().catch(() => ({ results: [] as ScrapeTargetRow[] }));
  return rows.results ?? [];
}

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const emptyFollowUps = { overdue: [], dueToday: [], stale: [], risky: [], now: new Date().toISOString() };

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
    followUps,
    connectedRows,
    totalSentAllTime,
    replyInbox,
    funnel,
    auditLog,
    scrapeTargetList,
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
    getCrmStats().catch(() => EMPTY_CRM_STATS),
    getFollowUpItems().catch(() => emptyFollowUps),
    // Direct mailbox-table check — independent of listAutomationOverview()
    // so a broken helper doesn't make the banner falsely show "not connected".
    getDatabase()
      .prepare(`SELECT LOWER("gmailAddress") AS gmailAddress FROM "OutreachMailbox"`)
      .all<{ gmailAddress: string }>()
      .then((r) => r.results ?? [])
      .catch(() => [] as Array<{ gmailAddress: string }>),
    getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM "OutreachEmail" WHERE "status" = 'sent'`)
      .first<{ c: number | string }>()
      .then((r) => Number(r?.c ?? 0))
      .catch(() => 0),
    getReplyInbox().catch(() => [] as ReplyInboxItem[]),
    getConversionFunnel().catch(() => ({ total: 0, qualified: 0, contacted: 0, replied: 0, pipeline: 0, won: 0 })),
    getAuditLog().catch(() => [] as AuditEntry[]),
    getScrapeTargetList().catch(() => [] as ScrapeTargetRow[]),
  ]);

  const activeScrape = scrapeJobs.find((j) => j.status === "running" || j.status === "claimed") ?? null;
  const replyRate = contactedCount > 0 ? (repliedCount / contactedCount) * 100 : 0;
  const intakeCap = getAutonomousDailyLeadCap();

  const aidanSends = sendsToday.perSender["aidan@getaxiom.ca"] || 0;
  const rileySends = sendsToday.perSender["riley@getaxiom.ca"] || 0;

  const intakePct = Math.min(100, (adequateToday / intakeCap) * 100);
  const sendPct = Math.min(100, (sendsToday.total / TARGET_DAILY_SEND) * 100);
  const aidanPct = Math.min(100, (aidanSends / MAILBOX_DAILY_SEND_TARGET) * 100);
  const rileyPct = Math.min(100, (rileySends / MAILBOX_DAILY_SEND_TARGET) * 100);

  const intakeTone: ToneKey = adequateToday >= intakeCap ? "amber" : "emerald";
  const sendTone: ToneKey = sendsToday.total >= TARGET_DAILY_SEND ? "amber" : "cyan";

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
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: BUSINESS_TZ }).format(new Date())}
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
            cap={intakeCap}
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
          <KvRow icon={<Mail className="size-3.5" />} label="Total sent (all-time)" value={totalSentAllTime.toLocaleString()} />
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
          {crmStats.forecast > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <TrendingUp className="size-3 text-amber-400" />
              <span className="text-[11px] text-amber-300 font-medium">
                +${Math.round(crmStats.forecast).toLocaleString()}/mo weighted forecast
              </span>
            </div>
          )}
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
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
          >
            <Users className="size-3.5" />
            Open client board →
          </Link>
        </Panel>
      </section>

      {/* Reply Inbox */}
      {replyInbox.length > 0 && (
        <div className="v2-card overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-cyan-400" />
              <div>
                <div className="text-sm font-semibold text-white">Reply Inbox</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{replyInbox.length} unhandled {replyInbox.length === 1 ? "reply" : "replies"} — respond fast</div>
              </div>
            </div>
            <Link href="/clients" className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium flex items-center gap-1">
              Open board <ArrowRight className="size-3" />
            </Link>
          </header>
          <div className="divide-y divide-white/[0.05]">
            {replyInbox.map((item) => {
              const urgency = item.replyAgeHours >= 4 ? "text-red-400" : item.replyAgeHours >= 1 ? "text-amber-400" : "text-emerald-400";
              return (
                <Link key={item.id} href={`/clients/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{item.businessName}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{item.city} · {item.niche}{item.email ? ` · ${item.email}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-mono text-[11px] font-medium ${urgency}`}>{item.replyAgeLabel}</span>
                    <span className={`inline-flex h-2 w-2 rounded-full ${item.replyAgeHours >= 4 ? "bg-red-400" : item.replyAgeHours >= 1 ? "bg-amber-400" : "bg-emerald-400"}`} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      <div className="v2-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Conversion Funnel</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">Lead-to-client pipeline (all time)</div>
          </div>
          <Filter className="size-4 text-zinc-600" />
        </header>
        <div className="p-4">
          <FunnelBar steps={[
            { label: "Scraped", value: funnel.total, tone: "zinc" },
            { label: "Qualified", value: funnel.qualified, tone: "cyan" },
            { label: "Contacted", value: funnel.contacted, tone: "violet" },
            { label: "Replied", value: funnel.replied, tone: "amber" },
            { label: "In Pipeline", value: funnel.pipeline, tone: "emerald" },
            { label: "Won", value: funnel.won, tone: "emerald" },
          ]} />
        </div>
      </div>

      {/* Audit Log & Scrape Targets */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Audit Log */}
        <div className="v2-card overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <ScrollText className="size-4 text-zinc-500" />
              <span className="text-sm font-semibold text-white">Audit Log</span>
            </div>
            <span className="font-mono text-[10px] text-zinc-600">{auditLog.length} recent</span>
          </header>
          <div className="divide-y divide-white/[0.05] max-h-[280px] overflow-y-auto">
            {auditLog.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11px] text-zinc-600">No activity logged yet</div>
            ) : (
              auditLog.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200 truncate">{entry.title}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 truncate">
                      {entry.type.replace(/_/g, " ").toLowerCase()}
                      {entry.businessName ? ` · ${entry.businessName}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                    {relativeAgo(entry.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Scrape Targets */}
        <div className="v2-card overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Crosshair className="size-4 text-zinc-500" />
              <span className="text-sm font-semibold text-white">Scrape Targets</span>
            </div>
            <span className="font-mono text-[10px] text-zinc-600">{scrapeTargetList.length} active</span>
          </header>
          <div className="divide-y divide-white/[0.05] max-h-[280px] overflow-y-auto">
            {scrapeTargetList.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11px] text-zinc-600">No scrape targets configured</div>
            ) : (
              scrapeTargetList.map((target) => (
                <div key={target.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200 truncate">{target.niche}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{target.city}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[10px] text-zinc-500">{Number(target.leadCount)} leads</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      target.status === "active" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                      target.status === "exhausted" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                      "border-zinc-600/20 bg-zinc-600/10 text-zinc-400"
                    }`}>
                      {target.status}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-600">{relativeAgo(target.lastScrapedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Follow-Ups panel */}
      <FollowUpsPanel data={followUps} />
    </div>
  );
}

// ---------- Follow-Ups Panel ----------

function FollowUpItemRow({ item, nowMs, overdue = false }: { item: FollowUpItem; nowMs: number; overdue?: boolean }) {
  const dueLabel = item.nextActionDueAt
    ? (() => {
        const d = new Date(item.nextActionDueAt);
        if (isNaN(d.getTime())) return null;
        const diff = Math.ceil((d.getTime() - nowMs) / 86_400_000);
        if (diff < 0) return `${Math.abs(diff)}d ago`;
        if (diff === 0) return "Today";
        if (diff === 1) return "Tomorrow";
        return `${diff}d`;
      })()
    : null;

  return (
    <Link href={`/clients/${item.id}`} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] -mx-1 px-1 rounded transition-colors">
      <div className="min-w-0">
        <div className={`text-xs font-medium truncate ${overdue ? "text-red-200" : "text-zinc-200"}`}>
          {item.businessName}
        </div>
        <div className="text-[10.5px] text-zinc-500 truncate mt-px">
          {item.nextAction ?? item.dealStage.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {dueLabel && (
          <span className={`text-[10px] font-mono ${overdue ? "text-red-400" : "text-zinc-500"}`}>{dueLabel}</span>
        )}
        {item.monthlyValue ? (
          <span className="text-[10px] font-mono text-emerald-400">${item.monthlyValue.toLocaleString()}</span>
        ) : null}
      </div>
    </Link>
  );
}

function FollowUpGroup({
  icon,
  title,
  items,
  emptyLabel,
  nowMs,
  overdue = false,
}: {
  icon: ReactNode;
  title: string;
  items: FollowUpItem[];
  emptyLabel: string;
  nowMs: number;
  overdue?: boolean;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{title}</span>
        {items.length > 0 && (
          <span className={`font-mono text-[10px] border rounded px-1 py-px ${
            overdue
              ? "text-red-400 border-red-500/20 bg-red-500/10"
              : "text-zinc-500 border-white/[0.09] bg-black/30"
          }`}>
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-700">{emptyLabel}</p>
      ) : (
        <div>
          {items.map((item) => (
            <FollowUpItemRow key={item.id} item={item} nowMs={nowMs} overdue={overdue} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUpsPanel({ data }: { data: { overdue: FollowUpItem[]; dueToday: FollowUpItem[]; stale: FollowUpItem[]; risky: FollowUpItem[]; now: string } }) {
  const hasAny = data.overdue.length > 0 || data.dueToday.length > 0 || data.stale.length > 0 || data.risky.length > 0;
  const nowMs = Date.parse(data.now);

  return (
    <div className="v2-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">Follow-Ups</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {hasAny ? "Items requiring attention" : "All clear"}
          </div>
        </div>
        <Link
          href="/clients"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium flex items-center gap-1"
        >
          Board
          <span className="text-[10px]">→</span>
        </Link>
      </header>
      <div className="grid grid-cols-2 xl:grid-cols-4 divide-x divide-y xl:divide-y-0 divide-white/[0.05]">
        <FollowUpGroup
          icon={<Clock className="size-3.5" />}
          title="Overdue"
          items={data.overdue}
          emptyLabel="No overdue actions"
          nowMs={nowMs}
          overdue
        />
        <FollowUpGroup
          icon={<Clock3 className="size-3.5" />}
          title="Due Today"
          items={data.dueToday}
          emptyLabel="Nothing due today"
          nowMs={nowMs}
        />
        <FollowUpGroup
          icon={<Users className="size-3.5" />}
          title="Stale Deals"
          items={data.stale}
          emptyLabel="No stale deals"
          nowMs={nowMs}
        />
        <FollowUpGroup
          icon={<AlertTriangle className="size-3.5" />}
          title="Risky Proposals"
          items={data.risky}
          emptyLabel="No risky proposals"
          nowMs={nowMs}
        />
      </div>
    </div>
  );
}

type ToneKey = "emerald" | "cyan" | "violet" | "blue" | "amber" | "red" | "zinc";

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
  zinc: { ring: "stroke-zinc-500", bar: "bg-zinc-500", text: "text-zinc-300", bg: "bg-zinc-500/10", border: "border-zinc-500/30" },
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

function FunnelBar({ steps }: { steps: Array<{ label: string; value: number; tone: ToneKey }> }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="space-y-2.5">
      {steps.map((step, i) => {
        const pct = Math.max(2, (step.value / max) * 100);
        const t = TONE[step.tone];
        const prev = i > 0 ? steps[i - 1].value : null;
        const convRate = prev && prev > 0 ? ((step.value / prev) * 100).toFixed(1) : null;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-[11px] font-medium text-zinc-400">{step.label}</span>
              <div className="flex items-center gap-2">
                {convRate && i > 0 && (
                  <span className="text-[10px] font-mono text-zinc-600">{convRate}%</span>
                )}
                <span className="font-mono text-xs font-semibold tabular-nums text-zinc-200">{step.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
              <div className={`h-full rounded-full ${t.bar} transition-[width]`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
