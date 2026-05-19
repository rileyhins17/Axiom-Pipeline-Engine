import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Mail,
  ShieldAlert,
} from "lucide-react";

import { SentEmailViewerTrigger } from "@/components/sent-email-viewer";

import { AUTOMATION_SETTINGS_DEFAULTS, MAILBOX_DAILY_SEND_TARGET } from "@/lib/automation-policy";
import { EmergencyControlCard } from "@/components/emergency-control-card";
import { IntakeControlCard } from "@/components/intake-control-card";
import { SchedulerHealthCard } from "@/components/scheduler-health-card";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getDatabase } from "@/lib/cloudflare";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";
import { calculateReplyRate } from "@/lib/ui/data-accuracy";

export const dynamic = "force-dynamic";

function emptyOverview() {
  return {
    settings: { ...AUTOMATION_SETTINGS_DEFAULTS },
    mailboxes: [] as Array<{ id: string; gmailAddress: string; status: string; sentToday: number; sentThisHour: number; dailyLimit: number; hourlyLimit: number; warmupLevel: number; lastSentAt: Date | string | null }>,
    sequences: [] as Array<{ id: string; state: string; leadId: number; lead?: { businessName: string; city: string; email: string } | null; nextSendAt: Date | null; lastSentAt: Date | null; currentStep: string; blockerLabel: string | null }>,
    recentSent: [] as Array<{ id: string; sentAt: Date; subject: string; senderEmail: string; recipientEmail: string; lead?: { businessName: string } | null }>,
    engine: {
      mode: "ACTIVE" as "ACTIVE" | "PAUSED" | "DISABLED",
      nextSendAt: null as Date | null,
      scheduledToday: 0,
      blockedCount: 0,
      replyStoppedCount: 0,
      readyCount: 0,
      queuedCount: 0,
      waitingCount: 0,
      sendingCount: 0,
    },
    pipeline: { needsEnrichment: 0, enriching: 0, enriched: 0, readyForTouch: 0 },
    stats: { ready: 0, queued: 0, sending: 0, waiting: 0, blocked: 0, active: 0, paused: 0, stopped: 0, completed: 0, replied: 0, scheduledToday: 0 },
    recentRuns: [],
  };
}

type PerformanceStats = {
  totalSent: number; delivered: number; replied: number;
  deliveryRate: number; replyRate: number;
};
type NichePerf = { niche: string; sent: number; replied: number; replyRate: number };
type CityPerf = { city: string; sent: number; replied: number; replyRate: number };
type HourBucket = { hour: number; count: number };
type SuppressedLead = { id: number; businessName: string; email: string; reason: string };
type StrategyPerf = { strategy: string; sent: number; replied: number; replyRate: number };

async function getPerformanceStats(db: ReturnType<typeof getDatabase>): Promise<PerformanceStats> {
  const row = await db.prepare(
    `SELECT
       COUNT(*) AS totalSent,
       SUM(CASE WHEN "status" = 'sent' THEN 1 ELSE 0 END) AS delivered,
       0 AS replied
     FROM "OutreachEmail"
     WHERE "status" IN ('sent', 'delivered')`,
  ).first<{ totalSent: number; delivered: number; replied: number }>().catch(() => null);
  const repliedRow = await db.prepare(
    `SELECT COUNT(DISTINCT l."id") AS replied
     FROM "OutreachEmail" e
     JOIN "Lead" l ON e."leadId" = l."id"
     WHERE e."status" IN ('sent', 'delivered')
       AND l."outreachStatus" = 'REPLIED'
       AND l."lastReplyAt" IS NOT NULL`,
  ).first<{ replied: number }>().catch(() => null);
  const totalSent = Number(row?.totalSent ?? 0);
  const delivered = Number(row?.delivered ?? 0);
  const replied = Number(repliedRow?.replied ?? 0);
  return {
    totalSent,
    delivered,
    replied,
    deliveryRate: calculateReplyRate(totalSent, delivered),
    replyRate: calculateReplyRate(totalSent, replied),
  };
}

async function getNichePerformance(db: ReturnType<typeof getDatabase>): Promise<NichePerf[]> {
  const rows = await db.prepare(
    `SELECT l."niche",
            COUNT(DISTINCT e."id") AS sent,
            COUNT(DISTINCT CASE WHEN l."outreachStatus" = 'REPLIED' AND l."lastReplyAt" IS NOT NULL THEN l."id" END) AS replied
     FROM "OutreachEmail" e
     JOIN "Lead" l ON e."leadId" = l."id"
     WHERE e."status" = 'sent' AND l."niche" IS NOT NULL
     GROUP BY l."niche"
     ORDER BY sent DESC
     LIMIT 10`,
  ).all<{ niche: string; sent: number; replied: number }>().catch(() => ({ results: [] as { niche: string; sent: number; replied: number }[] }));
  return (rows.results ?? []).map((r) => ({
    ...r, sent: Number(r.sent), replied: Number(r.replied),
    replyRate: calculateReplyRate(Number(r.sent), Number(r.replied)),
  }));
}

async function getCityPerformance(db: ReturnType<typeof getDatabase>): Promise<CityPerf[]> {
  const rows = await db.prepare(
    `SELECT l."city",
            COUNT(DISTINCT e."id") AS sent,
            COUNT(DISTINCT CASE WHEN l."outreachStatus" = 'REPLIED' AND l."lastReplyAt" IS NOT NULL THEN l."id" END) AS replied
     FROM "OutreachEmail" e
     JOIN "Lead" l ON e."leadId" = l."id"
     WHERE e."status" = 'sent' AND l."city" IS NOT NULL
     GROUP BY l."city"
     ORDER BY sent DESC
     LIMIT 10`,
  ).all<{ city: string; sent: number; replied: number }>().catch(() => ({ results: [] as { city: string; sent: number; replied: number }[] }));
  return (rows.results ?? []).map((r) => ({
    ...r, sent: Number(r.sent), replied: Number(r.replied),
    replyRate: calculateReplyRate(Number(r.sent), Number(r.replied)),
  }));
}

async function getSendWindowData(db: ReturnType<typeof getDatabase>): Promise<HourBucket[]> {
  const rows = await db.prepare(
    `SELECT CAST(strftime('%H', "sentAt") AS INTEGER) AS hour, COUNT(*) AS count
     FROM "OutreachEmail"
     WHERE "status" = 'sent' AND "sentAt" IS NOT NULL
     GROUP BY hour ORDER BY hour`,
  ).all<{ hour: number; count: number }>().catch(() => ({ results: [] as { hour: number; count: number }[] }));
  return (rows.results ?? []).map((r) => ({ hour: Number(r.hour), count: Number(r.count) }));
}

async function getSuppressedLeads(db: ReturnType<typeof getDatabase>): Promise<SuppressedLead[]> {
  const rows = await db.prepare(
    `SELECT l."id", l."businessName", l."email",
            CASE
              WHEN l."outreachStatus" = 'BOUNCED' THEN 'Bounced'
              WHEN l."outreachStatus" = 'OPTED_OUT' THEN 'Opted out'
              WHEN l."outreachStatus" = 'SUPPRESSED' THEN 'Suppressed'
              WHEN l."isArchived" = 1 THEN 'Archived'
              ELSE 'Blocked'
            END AS reason
     FROM "Lead" l
     WHERE l."outreachStatus" IN ('BOUNCED', 'OPTED_OUT', 'SUPPRESSED')
     ORDER BY l."updatedAt" DESC
     LIMIT 50`,
  ).all<SuppressedLead>().catch(() => ({ results: [] as SuppressedLead[] }));
  return rows.results ?? [];
}

async function getStrategyPerformance(db: ReturnType<typeof getDatabase>): Promise<StrategyPerf[]> {
  const rows = await db.prepare(
    `SELECT l."engagementType" AS strategy,
            COUNT(DISTINCT e."id") AS sent,
            COUNT(DISTINCT CASE WHEN l."outreachStatus" = 'REPLIED' AND l."lastReplyAt" IS NOT NULL THEN l."id" END) AS replied
     FROM "OutreachEmail" e
     JOIN "Lead" l ON e."leadId" = l."id"
     WHERE e."status" = 'sent'
     GROUP BY l."engagementType"
     ORDER BY sent DESC`,
  ).all<{ strategy: string | null; sent: number; replied: number }>().catch(() => ({ results: [] as { strategy: string | null; sent: number; replied: number }[] }));
  return (rows.results ?? []).map((r) => ({
    strategy: r.strategy || "Default",
    sent: Number(r.sent), replied: Number(r.replied),
    replyRate: calculateReplyRate(Number(r.sent), Number(r.replied)),
  }));
}

async function listFallbackMailboxes() {
  const result = await getDatabase()
    .prepare(
      `SELECT
         m."id",
         m."gmailAddress",
         m."status",
         m."dailyLimit",
         m."hourlyLimit",
         m."warmupLevel",
         m."lastSentAt",
         (
           SELECT COUNT(*)
           FROM "OutreachEmail" e
           WHERE e."mailboxId" = m."id"
             AND e."status" = 'sent'
             AND datetime(e."sentAt") >= datetime('now', 'start of day')
         ) AS "sentToday",
         (
           SELECT COUNT(*)
           FROM "OutreachEmail" e
           WHERE e."mailboxId" = m."id"
             AND e."status" = 'sent'
             AND datetime(e."sentAt") >= datetime('now', '-1 hour')
         ) AS "sentThisHour"
       FROM "OutreachMailbox" m
       WHERE m."gmailConnectionId" IS NOT NULL
       ORDER BY m."updatedAt" DESC`,
    )
    .all<{
      id: string;
      gmailAddress: string;
      status: string;
      dailyLimit: number;
      hourlyLimit: number;
      warmupLevel: number;
      lastSentAt: Date | string | null;
      sentToday: number;
      sentThisHour: number;
    }>();

  return (result.results ?? []).map((mailbox) => ({
    ...mailbox,
    dailyLimit: Number(mailbox.dailyLimit || MAILBOX_DAILY_SEND_TARGET),
    hourlyLimit: Number(mailbox.hourlyLimit || 1),
    warmupLevel: Number(mailbox.warmupLevel || 0),
    sentToday: Number(mailbox.sentToday || 0),
    sentThisHour: Number(mailbox.sentThisHour || 0),
  }));
}

function relativeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) {
    const m = Math.abs(Math.floor(diff / 60_000));
    if (m < 1) return "now";
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    return `in ${h}h`;
  }
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type BlockerKind = "transient" | "action" | "terminal";

const BLOCKER_COPY: Record<string, { label: string; detail: string; kind: BlockerKind }> = {
  mailbox_cooldown: { label: "Pausing between sends", detail: "Short cooldown so the inbox stays healthy. Sending resumes automatically.", kind: "transient" },
  hourly_cap_reached: { label: "Hourly send limit hit", detail: "We've sent the max for this hour. Resumes at the top of the next hour.", kind: "transient" },
  daily_cap_reached: { label: "Daily send limit hit", detail: "We've sent the max for today. Resumes tomorrow morning.", kind: "transient" },
  follow_up_daily_cap_reached: { label: "Follow-up cap hit for today", detail: "All follow-ups for today are sent. Resumes tomorrow.", kind: "transient" },
  global_daily_cap_reached: { label: "Daily send limit hit", detail: "Combined inbox cap reached for today. Resumes tomorrow.", kind: "transient" },
  outside_send_window: { label: "Outside business hours", detail: "We only send during business hours. Will go out in the next window.", kind: "transient" },
  domain_cooldown: { label: "Recently emailed this company", detail: "We already contacted someone at this domain. Spacing it out before the next touch.", kind: "transient" },
  awaiting_follow_up_window: { label: "Holding for follow-up timing", detail: "First email already sent. Waiting before the next touch.", kind: "transient" },
  reply_detected: { label: "They replied", detail: "Automation stopped — take over from the client board.", kind: "terminal" },
  mailbox_disconnected: { label: "Inbox needs reconnecting", detail: "Gmail authorization expired. Reconnect in Settings to resume sending.", kind: "action" },
  bounced: { label: "Email address bounced", detail: "Their server rejected the message. Removed from sending.", kind: "terminal" },
  no_email: { label: "No email address", detail: "Nothing to send to. Skipped.", kind: "terminal" },
  duplicate_sibling: { label: "Already being emailed", detail: "Another sequence is contacting this person. This one was closed.", kind: "terminal" },
  terminal_sequence_cleaned: { label: "Sequence finished", detail: "All planned touches sent.", kind: "terminal" },
};

function humanizeBlocker(reason: string | null | undefined): { label: string; detail: string; kind: BlockerKind } {
  if (!reason) return { label: "Unknown", detail: "No reason recorded.", kind: "action" };
  const direct = BLOCKER_COPY[reason];
  if (direct) return direct;
  const pretty = reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: pretty, detail: "—", kind: "action" };
}

function humanizeStep(stepType: string | null | undefined): string {
  if (!stepType) return "First email";
  const map: Record<string, string> = {
    INITIAL: "First email",
    FOLLOWUP_1: "Follow-up 1",
    FOLLOWUP_2: "Follow-up 2",
    FOLLOWUP_3: "Follow-up 3",
    BREAKUP: "Final touch",
  };
  return map[stepType.toUpperCase()] ?? stepType.replace(/_/g, " ").toLowerCase();
}

function parseRunMetadata(metadata: string | null | undefined) {
  if (!metadata) return {} as { phase?: string; phaseStatus?: string; error?: string };
  try {
    return JSON.parse(metadata) as { phase?: string; phaseStatus?: string; error?: string };
  } catch {
    return {} as { phase?: string; phaseStatus?: string; error?: string };
  }
}

export default async function AutomationPage() {
  await requireSession();

  const overview = await listAutomationOverview().catch(async (error) => {
    console.error("[automation] Overview failed, using mailbox fallback:", error);
    const fallback = emptyOverview();
    fallback.mailboxes = await listFallbackMailboxes().catch(() => []);
    return fallback;
  });

  const db = getDatabase();
  const [perfStats, nichePerf, cityPerf, sendWindow, suppressed, strategyPerf] = await Promise.all([
    getPerformanceStats(db),
    getNichePerformance(db),
    getCityPerformance(db),
    getSendWindowData(db),
    getSuppressedLeads(db),
    getStrategyPerformance(db),
  ]);

  const queued = overview.sequences.filter((s) => s.state === "QUEUED");
  const waiting = overview.sequences.filter((s) => s.state === "WAITING");
  const blocked = overview.sequences.filter((s) => s.state === "BLOCKED");
  const sentToday = overview.mailboxes.reduce((sum, mailbox) => sum + mailbox.sentToday, 0);
  const dailyCapacity = overview.mailboxes.reduce((sum, mailbox) => sum + mailbox.dailyLimit, 0);
  const activeMailboxes = overview.mailboxes.filter((mailbox) => ["ACTIVE", "WARMING"].includes(mailbox.status)).length;

  function classifyRow(s: { state: string; blockerLabel: string | null; nextSendAt: Date | null }) {
    const when = s.nextSendAt ? new Date(s.nextSendAt) : null;
    if (s.state === "BLOCKED") {
      const reasonKey = (s.blockerLabel || "").toLowerCase().replace(/\s+/g, "_");
      const blocker = humanizeBlocker(reasonKey);
      if (blocker.kind === "action") {
        return { bucket: "action" as const, blocker, when };
      }
      if (blocker.kind === "terminal") {
        return { bucket: "terminal" as const, blocker, when };
      }
      return { bucket: "transient" as const, blocker, when };
    }
    if (s.state === "WAITING") return { bucket: "waiting" as const, blocker: null, when };
    return { bucket: "sending" as const, blocker: null, when };
  }

  const classifiedSequences = [...queued, ...waiting, ...blocked]
    .map((s) => ({ ...s, ...classifyRow(s) }))
    .filter((s) => s.bucket !== "terminal");

  const actionNeeded = classifiedSequences.filter((s) => s.bucket === "action");
  const transientPaused = classifiedSequences
    .filter((s) => s.bucket === "transient")
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));

  const scheduledSends = classifiedSequences
    .filter((s) => (s.bucket === "sending" || s.bucket === "waiting") && s.when && s.when.getTime() >= Date.now())
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));

  const nextFive = scheduledSends.slice(0, 5);
  const laterSends = scheduledSends.slice(5, 25);

  const topMarkets = [
    ...nichePerf.slice(0, 3).map((n) => ({ kind: "Industry", label: n.niche, sent: n.sent, replyRate: n.replyRate })),
    ...cityPerf.slice(0, 3).map((c) => ({ kind: "City", label: c.city, sent: c.sent, replyRate: c.replyRate })),
  ].sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent).slice(0, 6);

  const engineRunning = overview.engine.mode === "ACTIVE" && !overview.settings.emergencyPaused;
  const sentTodayCopy = sentToday === 0
    ? "No emails have gone out yet today."
    : `${sentToday} email${sentToday === 1 ? "" : "s"} sent today.`;
  const scheduledTodayCopy = overview.engine.scheduledToday > 0
    ? `${overview.engine.scheduledToday} more scheduled to go out today.`
    : "Nothing else scheduled for today.";

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="v2-eyebrow inline-flex items-center gap-2 text-[10px]">
            <span
              className={`v2-dot ${engineRunning ? "text-emerald-400" : overview.settings.emergencyPaused ? "text-red-400" : "text-amber-400"}`}
              aria-hidden="true"
            />
            {engineRunning ? "Running" : overview.settings.emergencyPaused ? "Stopped" : "Paused"}
          </span>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.025em] text-white">Email outreach</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {engineRunning
              ? "Your outbox is sending automatically. Here's what it's doing today."
              : overview.settings.emergencyPaused
                ? "Sending is stopped. Resume from the controls below when ready."
                : "Sending is paused. Resume from the controls below when ready."}
          </p>
        </div>
      </header>

      {/* Today at a glance */}
      <section className="v2-card overflow-hidden p-5">
        <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <div className="v2-eyebrow">Today</div>
            <p className="mt-2 text-lg text-zinc-100 leading-7">
              {sentTodayCopy} {scheduledTodayCopy}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {activeMailboxes} of {overview.mailboxes.length || 2} inbox{(overview.mailboxes.length || 2) === 1 ? "" : "es"} ready · capacity {dailyCapacity || MAILBOX_DAILY_SEND_TARGET * 2}/day
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <BigStat label="Sent today" value={sentToday} tone="cyan" />
            <BigStat label="Scheduled" value={overview.engine.queuedCount + overview.engine.waitingCount} tone="emerald" />
            <BigStat label="Replies" value={perfStats.replied} tone="violet" />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]" aria-label="Health and controls">
        <SchedulerHealthCard />
        <div className="grid gap-4">
          <IntakeControlCard
            initialPaused={overview.settings.intakePaused}
            initialPausedBy={overview.settings.intakePausedBy}
          />
          <EmergencyControlCard
            compact
            initialState={{
              emergencyPaused: overview.settings.emergencyPaused,
              emergencyPausedAt: overview.settings.emergencyPausedAt ? overview.settings.emergencyPausedAt.toISOString() : null,
              emergencyPausedBy: overview.settings.emergencyPausedBy,
              emergencyPauseReason: overview.settings.emergencyPauseReason,
            }}
          />
        </div>
      </section>

      {/* Action needed — only if something actually requires operator intervention */}
      {actionNeeded.length > 0 ? (
        <section className="v2-card overflow-hidden border-amber-400/25 bg-amber-500/[0.04]">
          <header className="border-b border-amber-400/15 p-5">
            <div className="flex items-center gap-2 text-amber-200">
              <ShieldAlert className="size-4" />
              <h2 className="text-base font-semibold">Action needed</h2>
            </div>
            <p className="mt-1 text-sm text-amber-100/70">
              These sequences can't move forward until you do something. Everything else is handled automatically.
            </p>
          </header>
          <div className="divide-y divide-amber-400/10">
            {actionNeeded.map((s) => (
              <div key={s.id} className="flex items-start gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-white truncate">{s.lead?.businessName || `Lead #${s.leadId}`}</span>
                    {s.lead?.city ? <span className="text-xs text-zinc-500">· {s.lead.city}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-amber-100 leading-relaxed">
                    <span className="font-medium text-amber-200">{s.blocker?.label}.</span> {s.blocker?.detail}
                  </p>
                  {s.lead?.email ? (
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{s.lead.email}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Next 5 emails — flat chronological */}
      <section className="v2-card overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-5">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-emerald-300" />
            <div>
              <h2 className="text-base font-semibold text-white">Next 5 emails going out</h2>
              <p className="mt-0.5 text-sm text-zinc-400">
                Who's getting an email next, from which inbox, and exactly when.
              </p>
            </div>
          </div>
        </header>
        <div className="divide-y divide-white/[0.06]">
          {nextFive.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">
              No emails scheduled right now. New leads will appear here as the pipeline picks them up.
            </div>
          ) : (
            nextFive.map((s, idx) => {
              const when = s.when;
              const isImminent = when && when.getTime() - Date.now() <= 15 * 60_000;
              const formattedWhen = when ? formatAppDateTime(when, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—") : "—";
              const senderInbox = s.mailbox?.gmailAddress ?? null;
              return (
                <div key={s.id} className="flex items-start gap-4 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/[0.12] text-xs font-semibold text-emerald-300">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">{s.lead?.businessName || `Lead #${s.leadId}`}</span>
                      <span className={`shrink-0 text-[12px] tabular-nums ${isImminent ? "text-emerald-300" : "text-zinc-200"}`}>
                        {formattedWhen}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-zinc-400">
                      Sending to <span className="font-mono text-zinc-200">{s.lead?.email || "—"}</span>
                      {senderInbox ? <> from <span className="font-mono text-zinc-200">{senderInbox}</span></> : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {humanizeStep(s.currentStep)} · {when ? relativeAgo(when) : ""}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {laterSends.length > 0 ? (
          <details className="border-t border-white/[0.06]">
            <summary className="cursor-pointer list-none px-5 py-3 text-[12px] text-zinc-400 hover:text-white">
              Show {laterSends.length} more scheduled email{laterSends.length === 1 ? "" : "s"}
            </summary>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {laterSends.map((s, idx) => {
                const when = s.when;
                const formattedWhen = when ? formatAppDateTime(when, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—") : "—";
                const senderInbox = s.mailbox?.gmailAddress ?? null;
                return (
                  <div key={s.id} className="flex items-start gap-4 px-5 py-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-xs font-medium text-zinc-400">
                      {idx + 6}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-white">{s.lead?.businessName || `Lead #${s.leadId}`}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-zinc-300">{formattedWhen}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        Sending to <span className="font-mono">{s.lead?.email || "—"}</span>
                        {senderInbox ? <> from <span className="font-mono">{senderInbox}</span></> : null} · {humanizeStep(s.currentStep)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </section>

      {/* Auto-paused sequences — only shown if any, collapsed by default */}
      {transientPaused.length > 0 ? (
        <details className="v2-card overflow-hidden">
          <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">{transientPaused.length} sequence{transientPaused.length === 1 ? "" : "s"} pausing automatically</div>
              <div className="mt-0.5 text-[12px] text-zinc-500">
                Hourly caps, cooldowns, or business-hours pauses. These resume on their own — no action needed.
              </div>
            </div>
            <span className="text-[11px] text-zinc-400">show</span>
          </summary>
          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {transientPaused.slice(0, 15).map((s) => (
              <div key={s.id} className="flex items-start gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-white">{s.lead?.businessName || `Lead #${s.leadId}`}</span>
                    {s.when ? <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">retry {formatAppDateTime(s.when, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—")}</span> : null}
                  </div>
                  <p className="mt-1 text-[12px] text-zinc-400">
                    <span className="text-zinc-200">{s.blocker?.label}.</span> {s.blocker?.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* Inboxes + Recently sent */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card title="Inboxes" subtitle="How much each inbox has sent today">
          <div className="space-y-3">
            {overview.mailboxes.length === 0 ? (
              <Empty>No inboxes connected. Connect Gmail in Settings.</Empty>
            ) : (
              overview.mailboxes.map((m) => {
                const dailyPct = Math.min(100, (m.sentToday / Math.max(1, m.dailyLimit)) * 100);
                const remaining = Math.max(0, m.dailyLimit - m.sentToday);
                const healthLabel =
                  m.status === "ACTIVE" ? "Ready to send" :
                  m.status === "WARMING" ? "Warming up" :
                  m.status === "PAUSED" ? "Paused" :
                  m.status === "DISCONNECTED" ? "Disconnected" :
                  m.status;
                const healthTone =
                  m.status === "ACTIVE" ? "text-emerald-300" :
                  m.status === "WARMING" ? "text-cyan-300" :
                  m.status === "PAUSED" ? "text-amber-300" : "text-red-300";
                return (
                  <div key={m.id} className="rounded-md border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{m.gmailAddress}</div>
                        <div className={`mt-0.5 text-[11px] ${healthTone}`}>{healthLabel}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-white tabular-nums">{m.sentToday} / {m.dailyLimit}</div>
                        <div className="text-[11px] text-zinc-500">{remaining} left today</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className={`h-full ${dailyPct >= 100 ? "bg-amber-400" : "bg-emerald-400"} progress-animate`} style={{ width: `${dailyPct}%` }} />
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Last email {relativeAgo(m.lastSentAt)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Recent emails" subtitle="Click any row to read the full email that went out">
          <div className="-mx-4 divide-y divide-white/[0.06]">
            {overview.recentSent.length === 0 ? (
              <div className="px-4"><Empty>No emails sent yet.</Empty></div>
            ) : (
              overview.recentSent.slice(0, 10).map((e) => (
                <SentEmailViewerTrigger key={e.id} emailId={e.id}>
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white">{e.lead?.businessName || e.recipientEmail}</div>
                      <div className="mt-0.5 truncate text-[12px] text-zinc-400">{e.subject}</div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-600">
                        <span className="font-mono">{e.senderEmail}</span> sent to <span className="font-mono">{e.recipientEmail}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] tabular-nums text-zinc-300">
                        {formatAppDateTime(e.sentAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—")}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{relativeAgo(e.sentAt)}</div>
                    </div>
                  </div>
                </SentEmailViewerTrigger>
              ))
            )}
          </div>
        </Card>
      </section>

      {/* What's working */}
      {(topMarkets.length > 0 || strategyPerf.length > 0) ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="What's working best" subtitle="Industries and cities with the highest reply rates">
            <div className="space-y-2.5">
              {topMarkets.length === 0 ? (
                <Empty>Not enough data yet.</Empty>
              ) : (
                topMarkets.map((m, i) => (
                  <div key={`${m.kind}-${m.label}-${i}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1.5">{m.kind}</span>
                          {m.label}
                        </span>
                        <span className="text-[11px] text-zinc-400 shrink-0 ml-2">{m.sent} sent</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full bg-emerald-400 progress-animate" style={{ width: `${m.replyRate}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-emerald-300 shrink-0 w-12 text-right">{m.replyRate}%</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Best email approaches" subtitle="Reply rates by message style">
            <div className="space-y-3">
              {strategyPerf.length === 0 ? (
                <Empty>Not enough data yet.</Empty>
              ) : (
                strategyPerf.slice(0, 5).map((s) => (
                  <div key={s.strategy} className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{s.strategy}</span>
                      <span className="text-sm font-semibold text-emerald-300">{s.replyRate}%</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {s.sent} sent · {s.replied} replied
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full bg-emerald-400 progress-animate" style={{ width: `${s.replyRate}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      ) : null}

      {/* Contacts we won't email */}
      {suppressed.length > 0 ? (
        <Card title="Contacts we won't email" subtitle={`${suppressed.length} address${suppressed.length === 1 ? "" : "es"} removed from sending`}>
          <div className="divide-y divide-white/[0.06]">
            {suppressed.slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{s.businessName}</div>
                  <div className="truncate font-mono text-[11px] text-zinc-500">{s.email || "No email on file"}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  s.reason === "Bounced" ? "border-red-500/20 bg-red-500/10 text-red-300" :
                  s.reason === "Opted out" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                  "border-zinc-600/20 bg-zinc-600/10 text-zinc-400"
                }`}>
                  {s.reason}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Engine details — collapsed */}
      <details className="v2-card overflow-hidden">
        <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Engine details</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              Technical: recent scheduler runs, send-hour distribution, totals. Open if you're debugging.
            </div>
          </div>
          <span className="text-[11px] text-zinc-400">show</span>
        </summary>
        <div className="border-t border-white/[0.06]">
          <SchedulerRunLedger runs={overview.recentRuns} />
          <div className="grid gap-4 p-5 xl:grid-cols-2">
            <Card title="Send hours" subtitle="When emails have historically gone out (UTC)">
              {sendWindow.length === 0 ? <Empty>No send data yet.</Empty> : <SendWindowChart data={sendWindow} />}
            </Card>
            <Card title="Lifetime totals" subtitle="All-time outbound numbers">
              <div className="grid grid-cols-2 gap-3">
                <BigStat label="Emails sent" value={perfStats.totalSent} tone="cyan" />
                <BigStat label="Delivered" value={perfStats.delivered} tone="emerald" />
                <BigStat label="Replies" value={perfStats.replied} tone="violet" />
                <div className="v2-tile px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Reply rate</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">{perfStats.replyRate}%</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </details>

      <footer className="rounded-md border border-white/[0.06] bg-[#0b131d] p-4 text-[11px] text-zinc-500">
        Sending limits: up to {MAILBOX_DAILY_SEND_TARGET} emails per inbox per day ({MAILBOX_DAILY_SEND_TARGET * 2} total). Only owners and named staff are contacted — generic addresses like info@ or contact@ are skipped. Last automated run: {formatAppDateTime(overview.recentRuns?.[0]?.startedAt ?? null, undefined, "—")}.
      </footer>
    </div>
  );
}

function BigStat({ label, value, tone }: { label: string; value: number; tone: "cyan" | "emerald" | "violet" | "amber" }) {
  const text =
    tone === "cyan" ? "text-cyan-300" :
    tone === "emerald" ? "text-emerald-300" :
    tone === "violet" ? "text-violet-300" : "text-amber-300";
  return (
    <div className="v2-tile px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${text}`}>{value.toLocaleString()}</div>
    </div>
  );
}


function SchedulerRunLedger({
  runs,
}: {
  runs: Array<{
    id: string;
    startedAt: Date | string;
    finishedAt: Date | string | null;
    status: string;
    claimedCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    metadata: string | null;
  }>;
}) {
  const latest = runs[0] ?? null;
  const latestMetadata = parseRunMetadata(latest?.metadata);
  const latestStatus = latest?.status ?? "NO RUN";
  const statusTone =
    latestStatus === "FAILED"
      ? "border-red-400/30 bg-red-500/[0.08] text-red-200"
      : latestStatus === "RUNNING"
        ? "border-cyan-400/30 bg-cyan-500/[0.08] text-cyan-200"
        : latestStatus === "COMPLETED"
          ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
          : "border-white/[0.08] bg-white/[0.03] text-zinc-300";

  return (
    <section className="v2-card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-white/[0.06] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-white">Scheduler run ledger</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Cron visibility for lease, pre-run phase, claim, send, and failure states.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${statusTone}`}>
          {latestStatus === "FAILED" ? <ShieldAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          Latest: {latestStatus.toLowerCase()}
          {latestMetadata.phase ? ` / ${latestMetadata.phase}` : ""}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Run</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Phase</th>
              <th className="px-4 py-3 font-semibold">Claimed</th>
              <th className="px-4 py-3 font-semibold">Sent</th>
              <th className="px-4 py-3 font-semibold">Failed</th>
              <th className="px-4 py-3 font-semibold">Skipped</th>
              <th className="px-4 py-3 font-semibold">Finished</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-zinc-600">
                  No scheduler runs recorded yet.
                </td>
              </tr>
            ) : (
              runs.slice(0, 8).map((run) => {
                const metadata = parseRunMetadata(run.metadata);
                const failed = run.status === "FAILED";
                const running = run.status === "RUNNING";
                const rowTone = failed
                  ? "text-red-200"
                  : running
                    ? "text-cyan-200"
                    : "text-zinc-200";
                return (
                  <tr key={run.id} className="align-top hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-zinc-300">{String(run.id).slice(0, 8)}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-600">{relativeAgo(run.startedAt)}</div>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${rowTone}`}>{run.status.toLowerCase()}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-zinc-300">{metadata.phase ?? "send loop"}</div>
                      {metadata.error ? (
                        <div className="mt-1 max-w-[260px] truncate text-[11px] text-red-300">{metadata.error}</div>
                      ) : (
                        <div className="mt-1 text-[11px] text-zinc-600">{metadata.phaseStatus ?? "complete"}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-zinc-300">{run.claimedCount}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-emerald-300">{run.sentCount}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-red-300">{run.failedCount}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">{run.skippedCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{relativeAgo(run.finishedAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="v2-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</div>
        </div>
        <Bot className="size-4 text-zinc-600" />
      </header>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SendWindowChart({ data }: { data: HourBucket[] }) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const hours = Array.from({ length: 24 }, (_, i) => {
    const bucket = data.find((d) => d.hour === i);
    return { hour: i, count: bucket?.count ?? 0 };
  });

  return (
    <div className="flex items-end gap-[3px] h-24">
      {hours.map((h) => {
        const pct = (h.count / maxCount) * 100;
        const isActive = h.hour >= 9 && h.hour <= 17;
        return (
          <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className={`w-full min-w-[6px] rounded-t transition-all ${
                isActive ? "bg-cyan-400/80" : "bg-white/10"
              }`}
              style={{ height: `${Math.max(2, pct)}%` }}
            />
            {h.hour % 3 === 0 && (
              <span className="text-[8px] text-zinc-600 font-mono">{h.hour}h</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 py-6 text-[11px] text-zinc-600">
      <Mail className="size-4" />
      {children}
    </div>
  );
}
