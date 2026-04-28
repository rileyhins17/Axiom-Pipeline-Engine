import type { ReactNode } from "react";
import { Bot, Clock3, Mail, Pause, Play, Reply } from "lucide-react";

import { AUTOMATION_SETTINGS_DEFAULTS, MAILBOX_DAILY_SEND_TARGET } from "@/lib/automation-policy";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getDatabase } from "@/lib/cloudflare";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

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

export default async function AutomationPage() {
  await requireSession();

  const overview = await listAutomationOverview().catch(async (error) => {
    console.error("[automation] Overview failed, using mailbox fallback:", error);
    const fallback = emptyOverview();
    fallback.mailboxes = await listFallbackMailboxes().catch(() => []);
    return fallback;
  });

  const queued = overview.sequences.filter((s) => s.state === "QUEUED" || s.state === "SENDING");
  const waiting = overview.sequences.filter((s) => s.state === "WAITING");
  const blocked = overview.sequences.filter((s) => s.state === "BLOCKED");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="v2-eyebrow inline-flex items-center gap-2 text-[10px]">
            <span className="v2-dot text-cyan-400" />
            Automation · read-only
          </span>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.025em] text-white">Sequences & sends</h1>
          <p className="mt-1 text-sm text-zinc-400">Engine state, mailbox load, queue and recent activity.</p>
        </div>
        <EngineBadge mode={overview.engine.mode} />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Queued" value={overview.engine.queuedCount} icon={<Clock3 className="size-4" />} tone="cyan" />
        <Stat label="Waiting (follow-up)" value={overview.engine.waitingCount} icon={<Clock3 className="size-4" />} tone="violet" />
        <Stat label="Blocked" value={overview.engine.blockedCount} icon={<Pause className="size-4" />} tone={overview.engine.blockedCount > 0 ? "amber" : "zinc"} />
        <Stat label="Replies (stop)" value={overview.engine.replyStoppedCount} icon={<Reply className="size-4" />} tone="emerald" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card title="Mailbox health" subtitle="Per-sender daily and hourly load">
          <div className="space-y-3">
            {overview.mailboxes.length === 0 ? (
              <Empty>No mailboxes connected. Visit Settings to connect Gmail.</Empty>
            ) : (
              overview.mailboxes.map((m) => {
                const dailyPct = Math.min(100, (m.sentToday / Math.max(1, m.dailyLimit)) * 100);
                const hourlyPct = Math.min(100, (m.sentThisHour / Math.max(1, m.hourlyLimit)) * 100);
                return (
                  <div key={m.id} className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-white">{m.gmailAddress}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {m.status} · warmup L{m.warmupLevel} · last sent {relativeAgo(m.lastSentAt)}
                        </div>
                      </div>
                      <span className="font-mono text-sm tabular-nums text-zinc-300">
                        {m.sentToday}/{m.dailyLimit}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1.5">
                      <Bar label="Today" pct={dailyPct} value={`${m.sentToday}/${m.dailyLimit}`} tone={dailyPct >= 100 ? "amber" : "cyan"} />
                      <Bar label="This hour" pct={hourlyPct} value={`${m.sentThisHour}/${m.hourlyLimit}`} tone={hourlyPct >= 100 ? "amber" : "violet"} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Recently sent" subtitle="Last outbound emails">
          <div className="divide-y divide-white/[0.06]">
            {overview.recentSent.length === 0 ? (
              <Empty>No emails sent yet.</Empty>
            ) : (
              overview.recentSent.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{e.lead?.businessName || e.recipientEmail}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                      {e.senderEmail} → {e.recipientEmail}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-zinc-500">{relativeAgo(e.sentAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <SequenceList title="Queued" subtitle={`${queued.length} sequences scheduled to send`} sequences={queued} tone="cyan" />
        <SequenceList title="Waiting" subtitle={`${waiting.length} between follow-ups`} sequences={waiting} tone="violet" />
        <SequenceList title="Blocked" subtitle={`${blocked.length} need attention`} sequences={blocked} tone="amber" empty="None blocked." />
      </section>

      <footer className="rounded-md border border-white/[0.06] bg-[#0b131d] p-4 text-[11px] text-zinc-500">
        <span className="text-zinc-300">Caps:</span> {MAILBOX_DAILY_SEND_TARGET}/day per mailbox · {MAILBOX_DAILY_SEND_TARGET * 2}/day total ·
        sends only to owner/staff inboxes (no info@ / contact@ / etc.). Engine is fully autonomous; no manual queueing or sending.
        Last engine run: {formatAppDateTime(overview.recentRuns?.[0]?.startedAt ?? null, undefined, "—")}.
      </footer>
    </div>
  );
}

function EngineBadge({ mode }: { mode: "ACTIVE" | "PAUSED" | "DISABLED" }) {
  const tone =
    mode === "ACTIVE"
      ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"
      : mode === "PAUSED"
        ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-300"
        : "border-red-400/30 bg-red-400/[0.08] text-red-300";
  const Icon = mode === "ACTIVE" ? Play : Pause;
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest ${tone}`}>
      <Icon className="size-3.5" />
      Engine · {mode}
    </span>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: "cyan" | "violet" | "amber" | "emerald" | "zinc" }) {
  const text =
    tone === "cyan" ? "text-cyan-300" : tone === "violet" ? "text-violet-300" : tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : "text-zinc-300";
  return (
    <div className="rounded-md border border-white/[0.06] bg-[#0b131d] p-4">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em]">{label}</span>
        <span className={text}>{icon}</span>
      </div>
      <div className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${text}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-[#0b131d]">
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

function SequenceList({
  title,
  subtitle,
  sequences,
  tone,
  empty = "Nothing here.",
}: {
  title: string;
  subtitle: string;
  sequences: Array<{ id: string; leadId: number; lead?: { businessName: string; city: string } | null; nextSendAt: Date | null; lastSentAt: Date | null; currentStep: string; blockerLabel?: string | null }>;
  tone: "cyan" | "violet" | "amber";
  empty?: string;
}) {
  const dot = tone === "cyan" ? "bg-cyan-400" : tone === "violet" ? "bg-violet-400" : "bg-amber-400";
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-[#0b131d]">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-2 w-2 rounded-full ${dot}`} />
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <span className="text-[11px] text-zinc-500">{subtitle}</span>
      </header>
      <div className="divide-y divide-white/[0.06]">
        {sequences.length === 0 ? (
          <Empty>{empty}</Empty>
        ) : (
          sequences.slice(0, 8).map((s) => (
            <div key={s.id} className="px-4 py-2.5">
              <div className="truncate text-sm text-white">{s.lead?.businessName || `Lead #${s.leadId}`}</div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span className="truncate">
                  {s.lead?.city || "—"} · <span className="font-mono">{s.currentStep}</span>
                  {s.blockerLabel ? <span className="text-amber-300"> · {s.blockerLabel}</span> : null}
                </span>
                <span className="shrink-0 font-mono">{relativeAgo(s.nextSendAt || s.lastSentAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Bar({ label, pct, value, tone }: { label: string; pct: number; value: string; tone: "cyan" | "violet" | "amber" }) {
  const bar = tone === "cyan" ? "bg-cyan-400" : tone === "violet" ? "bg-violet-400" : "bg-amber-400";
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono tabular-nums text-zinc-400">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
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
