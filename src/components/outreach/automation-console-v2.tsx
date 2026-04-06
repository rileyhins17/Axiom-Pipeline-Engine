"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { APP_TIME_ZONE_LABEL, formatAppClock, formatAppDateTime } from "@/lib/time";

/* ─── types ──────────────────────────────────────── */

type ReadyLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  contactName?: string | null;
  axiomScore?: number | null;
};

type AutomationMailbox = {
  id: string;
  gmailAddress: string;
  label: string | null;
  status: string;
  timezone: string;
  dailyLimit: number;
  hourlyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  warmupLevel: number;
  sentToday: number;
  sentThisHour: number;
  lastSentAt?: string | null;
  nextAvailableAt?: string | null;
};

type AutomationSequence = {
  id: string;
  status: string;
  state: "QUEUED" | "SENDING" | "WAITING" | "BLOCKED" | "STOPPED" | "COMPLETED";
  currentStep: string;
  nextScheduledAt: string | null;
  nextSendAt: string | null;
  lastSentAt: string | null;
  stopReason: string | null;
  blockerReason: string | null;
  blockerLabel: string | null;
  blockerDetail: string | null;
  hasSentAnyStep: boolean;
  secondaryBlockers: string[];
  lead?: ReadyLead | null;
  mailbox?: AutomationMailbox | null;
  nextStep?: { stepType: string; scheduledFor: string } | null;
};

type AutomationOverview = {
  settings: {
    enabled: boolean;
    globalPaused: boolean;
    sendWindowStartHour: number;
    sendWindowStartMinute: number;
    sendWindowEndHour: number;
    sendWindowEndMinute: number;
    initialDelayMinMinutes: number;
    initialDelayMaxMinutes: number;
    followUp1BusinessDays: number;
    followUp2BusinessDays: number;
    schedulerClaimBatch: number;
    replySyncStaleMinutes: number;
  };
  ready: ReadyLead[];
  mailboxes: AutomationMailbox[];
  sequences: AutomationSequence[];
  queued: AutomationSequence[];
  active: AutomationSequence[];
  finished: AutomationSequence[];
  recentSent: Array<{
    id: string;
    sentAt: string;
    subject: string;
    senderEmail: string;
    recipientEmail: string;
    sequenceId: string | null;
    lead?: ReadyLead | null;
  }>;
  recentRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string | null;
    sentCount: number;
    failedCount: number;
    claimedCount: number;
    skippedCount?: number;
    metadata?: string | null;
  }>;
  engine: {
    mode: "ACTIVE" | "PAUSED" | "DISABLED";
    nextSendAt: string | null;
    scheduledToday: number;
    blockedCount: number;
    replyStoppedCount: number;
    readyCount: number;
    queuedCount: number;
    waitingCount: number;
    sendingCount: number;
  };
  stats: {
    ready: number;
    queued: number;
    sending: number;
    waiting: number;
    blocked: number;
    active: number;
    paused: number;
    stopped: number;
    completed: number;
    replied: number;
    scheduledToday: number;
  };
};

type TabId = "queue" | "mailboxes" | "blocked" | "rules";

/* ─── helpers ────────────────────────────────────── */

function fmtDt(value: string | Date | null | undefined, fb = "—") {
  return formatAppDateTime(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, fb);
}

function fmtCountdown(value: string | null | undefined) {
  if (!value) return "No send scheduled";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "No send scheduled";
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "Due now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

function fmtStep(v: string) {
  switch (v) {
    case "INITIAL": return "Initial";
    case "FOLLOW_UP_1": return "Follow-up 1";
    case "FOLLOW_UP_2": return "Follow-up 2";
    default: return v.toLowerCase().replaceAll("_", " ");
  }
}

function fmtWindow(s: AutomationOverview["settings"]) {
  return `${formatAppClock(s.sendWindowStartHour, s.sendWindowStartMinute)}–${formatAppClock(s.sendWindowEndHour, s.sendWindowEndMinute)} ${APP_TIME_ZONE_LABEL}`;
}

function stateColor(state: AutomationSequence["state"]) {
  switch (state) {
    case "QUEUED": return "text-cyan-300 bg-cyan-500/10 border-cyan-500/20";
    case "SENDING": return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    case "WAITING": return "text-blue-300 bg-blue-500/10 border-blue-500/20";
    case "BLOCKED": return "text-amber-300 bg-amber-500/10 border-amber-500/20";
    case "COMPLETED": return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    default: return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  }
}

function mailboxStatusColor(status: string) {
  switch (status) {
    case "ACTIVE": return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    case "PAUSED": return "text-amber-300 bg-amber-500/10 border-amber-500/20";
    case "WARMUP": return "text-blue-300 bg-blue-500/10 border-blue-500/20";
    case "ERROR": case "DISABLED": return "text-rose-300 bg-rose-500/10 border-rose-500/20";
    default: return "text-zinc-300 bg-white/5 border-white/10";
  }
}

/* ─── main component ─────────────────────────────── */

export function AutomationConsoleV2({ initialOverview }: { initialOverview: AutomationOverview }) {
  const { toast } = useToast();
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<TabId>("queue");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(initialOverview.settings);
  const [, setTick] = useState(0);

  const refreshOverview = useCallback(async () => {
    const r = await fetch("/api/outreach/automation/overview");
    if (!r.ok) return;
    const d = await r.json();
    setOverview(d);
  }, []);

  useEffect(() => { setSettingsDraft(overview.settings); }, [overview.settings]);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => { void refreshOverview().catch(() => {}); }, 45_000); return () => clearInterval(t); }, [refreshOverview]);

  const exec = async <T,>(key: string, fn: () => Promise<Response>) => {
    setBusyKey(key);
    try {
      const res = await fn();
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "Action failed");
      return d as T;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", { type: "error", icon: "note" });
      return null;
    } finally {
      setBusyKey(null);
    }
  };

  const handleRun = async () => {
    const d = await exec<any>("run", () => fetch("/api/outreach/automation/run", { method: "POST" }));
    if (!d) return;
    toast(d.sent > 0 ? `Sent ${d.sent} email${d.sent === 1 ? "" : "s"}` : "Check finished — no sends", { type: "success", icon: "note" });
    await refreshOverview();
  };

  const handleSync = async () => {
    const d = await exec<any>("sync", () => fetch("/api/outreach/automation/replies/sync", { method: "POST" }));
    if (!d) return;
    toast(d.stopped > 0 ? `Stopped ${d.stopped} sequence${d.stopped === 1 ? "" : "s"}` : "Reply sync done", { type: "success", icon: "note" });
    await refreshOverview();
  };

  const updateSeq = async (id: string, action: string) => {
    const d = await exec(`${action}:${id}`, () => fetch(`/api/outreach/automation/sequences/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));
    if (d) { toast(`Sequence ${action}d`, { type: "success", icon: "note" }); await refreshOverview(); }
  };

  const updateMailbox = async (id: string, status: string) => {
    const d = await exec(`mb:${id}`, () => fetch(`/api/outreach/automation/mailboxes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
    if (d) { toast(status === "PAUSED" ? "Mailbox paused" : "Mailbox resumed", { type: "success", icon: "note" }); await refreshOverview(); }
  };

  const saveSettings = async () => {
    const d = await exec("settings", () => fetch("/api/outreach/automation/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsDraft) }));
    if (d) { toast("Settings saved", { type: "success", icon: "note" }); await refreshOverview(); }
  };

  /* derived data */
  const scheduled = useMemo(() => overview.sequences.filter((s) => s.hasSentAnyStep && (s.state === "WAITING" || s.state === "SENDING")), [overview.sequences]);
  const blocked = useMemo(() => overview.sequences.filter((s) => s.state === "BLOCKED" && s.hasSentAnyStep), [overview.sequences]);
  const groupedBlocked = useMemo(() => {
    const m = new Map<string, AutomationSequence[]>();
    for (const s of blocked) { const k = s.blockerLabel || "Other"; m.set(k, [...(m.get(k) || []), s]); }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [blocked]);

  const isActive = overview.engine.mode === "ACTIVE" && !overview.settings.globalPaused;
  const engineLabel = overview.settings.globalPaused ? "Paused" : overview.engine.mode === "ACTIVE" ? "Active" : overview.engine.mode;
  const dueToday = overview.stats.scheduledToday;
  const blockedCount = overview.stats.blocked;
  const activeFollowups = overview.stats.waiting + overview.stats.sending;

  /* categorize queue items by time */
  const now = Date.now();
  const dueNow = scheduled.filter((s) => !s.nextSendAt || new Date(s.nextSendAt).getTime() <= now);
  const laterToday = scheduled.filter((s) => {
    if (!s.nextSendAt) return false;
    const t = new Date(s.nextSendAt).getTime();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return t > now && t <= endOfDay.getTime();
  });
  const upcoming = scheduled.filter((s) => {
    if (!s.nextSendAt) return false;
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return new Date(s.nextSendAt).getTime() > endOfDay.getTime();
  });

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "queue", label: "Queue", count: scheduled.length },
    { id: "mailboxes", label: "Mailboxes", count: overview.mailboxes.length },
    { id: "blocked", label: "Blocked", count: blockedCount },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div className="space-y-0">
      {/* ━━━ Page header ━━━ */}
      <div className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Automation</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Post-send follow-up engine</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${isActive ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {engineLabel}
            </span>
            <span className="text-xs text-zinc-500">
              Next run: <span className="text-zinc-300">{fmtCountdown(overview.engine.nextSendAt)}</span>
            </span>
            <span className="hidden text-zinc-700 sm:inline">·</span>
            <span className="text-xs text-zinc-500">
              Due today: <span className="text-zinc-300">{dueToday}</span>
            </span>
            <span className="hidden text-zinc-700 sm:inline">·</span>
            <span className="text-xs text-zinc-500">
              Active: <span className="text-zinc-300">{activeFollowups}</span>
            </span>
            {blockedCount > 0 && (
              <>
                <span className="hidden text-zinc-700 sm:inline">·</span>
                <span className="text-xs text-amber-400/80">
                  {blockedCount} blocked
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
            <Link href="/outreach">Outreach <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void handleSync()} disabled={busyKey === "sync"} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
            {busyKey === "sync" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Sync replies
          </Button>
          <Button size="sm" onClick={() => void handleRun()} disabled={busyKey === "run"} className="h-8 rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-zinc-200">
            {busyKey === "run" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
            Run now
          </Button>
        </div>
      </div>

      {/* ━━━ Tab bar ━━━ */}
      <div className="border-b border-white/[0.06]">
        <nav className="-mb-px flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors
                ${tab === t.id
                  ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-white after:rounded-full"
                  : "text-zinc-500 hover:text-zinc-300"
                }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                  tab === t.id ? "bg-white/10 text-white" : "bg-white/5 text-zinc-500"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ━━━ Tab content ━━━ */}
      <div className="pt-5">
        {tab === "queue" && <QueueTab dueNow={dueNow} laterToday={laterToday} upcoming={upcoming} overview={overview} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "mailboxes" && <MailboxesTab mailboxes={overview.mailboxes} busyKey={busyKey} onUpdateMailbox={updateMailbox} />}
        {tab === "blocked" && <BlockedTab groups={groupedBlocked} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "rules" && <RulesTab settings={settingsDraft} onChange={setSettingsDraft} onSave={saveSettings} busyKey={busyKey} overview={overview} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 1: Queue
   ═══════════════════════════════════════════════════ */

function QueueTab({
  dueNow, laterToday, upcoming, overview, busyKey, onUpdateSeq,
}: {
  dueNow: AutomationSequence[];
  laterToday: AutomationSequence[];
  upcoming: AutomationSequence[];
  overview: AutomationOverview;
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const hasItems = dueNow.length + laterToday.length + upcoming.length > 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
      {/* Main queue list */}
      <div className="space-y-5">
        {hasItems ? (
          <>
            {dueNow.length > 0 && <QueueSection title="Due now" sequences={dueNow} busyKey={busyKey} onAction={onUpdateSeq} accent="emerald" />}
            {laterToday.length > 0 && <QueueSection title="Later today" sequences={laterToday} busyKey={busyKey} onAction={onUpdateSeq} accent="blue" />}
            {upcoming.length > 0 && <QueueSection title="Upcoming" sequences={upcoming} busyKey={busyKey} onAction={onUpdateSeq} accent="zinc" />}
          </>
        ) : (
          <div className="py-8 text-center text-sm text-zinc-500">
            No follow-ups due right now.
            {overview.engine.nextSendAt ? (
              <span className="text-zinc-400"> Next automated touch {fmtCountdown(overview.engine.nextSendAt)}.</span>
            ) : null}
          </div>
        )}

        {/* Recent sends — compact log */}
        {overview.recentSent.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Recent sends</h3>
            <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] bg-white/[0.015]">
              {overview.recentSent.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-white">{e.lead?.businessName || e.recipientEmail}</span>
                    <span className="ml-2 text-xs text-zinc-500 truncate">{e.subject}</span>
                  </div>
                  <div className="shrink-0 text-xs text-zinc-500">{fmtDt(e.sentAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right summary rail */}
      <div className="space-y-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Engine</h3>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Status</dt><dd className="text-zinc-200">{overview.settings.globalPaused ? "Paused" : overview.engine.mode}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Business hours</dt><dd className="text-zinc-200 text-right text-xs">{fmtWindow(overview.settings)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Next run</dt><dd className="text-zinc-200">{fmtCountdown(overview.engine.nextSendAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Active</dt><dd className="text-zinc-200">{overview.stats.waiting + overview.stats.sending}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Due today</dt><dd className="text-zinc-200">{overview.stats.scheduledToday}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Blocked</dt><dd className={overview.stats.blocked > 0 ? "text-amber-300" : "text-zinc-200"}>{overview.stats.blocked}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Completed</dt><dd className="text-zinc-200">{overview.stats.completed}</dd></div>
          </dl>
        </div>

        {overview.recentRuns.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Recent runs</h3>
            <div className="space-y-2">
              {overview.recentRuns.slice(0, 4).map((r) => (
                <div key={r.id} className="flex items-baseline justify-between text-xs">
                  <span className="text-zinc-400">{fmtDt(r.startedAt)}</span>
                  <span className="text-zinc-500">
                    {r.sentCount}s / {r.failedCount}f / {r.skippedCount || 0}sk
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Queue section (Due now / Later today / Upcoming) */

function QueueSection({
  title, sequences, busyKey, onAction, accent,
}: {
  title: string;
  sequences: AutomationSequence[];
  busyKey: string | null;
  onAction: (id: string, action: string) => Promise<void>;
  accent: "emerald" | "blue" | "zinc";
}) {
  const dotColor = accent === "emerald" ? "bg-emerald-400" : accent === "blue" ? "bg-blue-400" : "bg-zinc-500";

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
        <span className="text-[10px] tabular-nums text-zinc-600">{sequences.length}</span>
      </div>

      {/* Dense table layout */}
      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-xs text-zinc-500">
              <th className="px-3 py-2 text-left font-medium">Lead</th>
              <th className="px-3 py-2 text-left font-medium">Step</th>
              <th className="px-3 py-2 text-left font-medium">Due</th>
              <th className="px-3 py-2 text-left font-medium">Mailbox</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sequences.map((s) => (
              <tr key={s.id} className="group hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id}`}</div>
                  {s.lead?.email && <div className="text-xs text-zinc-500">{s.lead.email}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{fmtStep(s.currentStep)}</td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-zinc-300">{fmtCountdown(s.nextSendAt)}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500 font-mono">{s.mailbox?.gmailAddress?.split("@")[0] || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${stateColor(s.state)}`}>
                    {s.state === "WAITING" ? "Waiting" : s.state === "SENDING" ? "Sending" : s.state}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {s.status !== "PAUSED" && s.state !== "STOPPED" && s.state !== "COMPLETED" && (
                      <button onClick={() => void onAction(s.id, "pause")} disabled={busyKey === `pause:${s.id}`} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" title="Pause">
                        {busyKey === `pause:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {s.status === "PAUSED" && (
                      <button onClick={() => void onAction(s.id, "resume")} disabled={busyKey === `resume:${s.id}`} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" title="Resume">
                        {busyKey === `resume:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {s.state !== "STOPPED" && s.state !== "COMPLETED" && (
                      <button onClick={() => void onAction(s.id, "stop")} disabled={busyKey === `stop:${s.id}`} className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-300" title="Stop">
                        {busyKey === `stop:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 2: Mailboxes
   ═══════════════════════════════════════════════════ */

function MailboxesTab({
  mailboxes, busyKey, onUpdateMailbox,
}: {
  mailboxes: AutomationMailbox[];
  busyKey: string | null;
  onUpdateMailbox: (id: string, status: string) => Promise<void>;
}) {
  if (mailboxes.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        No mailboxes connected. Connect a Gmail account from <Link href="/outreach" className="text-zinc-300 underline underline-offset-2 hover:text-white">Outreach</Link>.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.04] text-xs text-zinc-500">
            <th className="px-3 py-2 text-left font-medium">Sender</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Today</th>
            <th className="px-3 py-2 text-left font-medium">This hour</th>
            <th className="px-3 py-2 text-left font-medium">Next slot</th>
            <th className="px-3 py-2 text-left font-medium">Last sync</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.03]">
          {mailboxes.map((mb, i) => (
            <tr key={mb.id} className="group hover:bg-white/[0.02]">
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-white">{mb.label || mb.gmailAddress.split("@")[0]}</div>
                    <div className="text-xs font-mono text-zinc-500">{mb.gmailAddress}</div>
                  </div>
                  {i === 0 && mailboxes.length > 1 && (
                    <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">Next</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${mailboxStatusColor(mb.status)}`}>
                  {mb.status}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className="text-sm tabular-nums text-zinc-200">{mb.sentToday}</span>
                <span className="text-xs text-zinc-600"> / {mb.dailyLimit}</span>
              </td>
              <td className="px-3 py-3">
                <span className="text-sm tabular-nums text-zinc-200">{mb.sentThisHour}</span>
                <span className="text-xs text-zinc-600"> / {mb.hourlyLimit}</span>
              </td>
              <td className="px-3 py-3 text-xs text-zinc-400">{fmtDt(mb.nextAvailableAt, "Ready")}</td>
              <td className="px-3 py-3 text-xs text-zinc-500">{fmtDt(mb.lastSentAt, "Never")}</td>
              <td className="px-3 py-3 text-right">
                <button
                  onClick={() => void onUpdateMailbox(mb.id, mb.status === "PAUSED" ? "ACTIVE" : "PAUSED")}
                  disabled={busyKey === `mb:${mb.id}`}
                  className="rounded-md border border-white/8 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors"
                >
                  {busyKey === `mb:${mb.id}` ? (
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  ) : mb.status === "PAUSED" ? (
                    <Play className="h-3 w-3 inline mr-1" />
                  ) : (
                    <Pause className="h-3 w-3 inline mr-1" />
                  )}
                  {mb.status === "PAUSED" ? "Resume" : "Pause"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 3: Blocked
   ═══════════════════════════════════════════════════ */

function BlockedTab({
  groups, busyKey, onUpdateSeq,
}: {
  groups: [string, AutomationSequence[]][];
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(groups.map(([l]) => l)));

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        No blocked sequences. Everything is clear.
      </div>
    );
  }

  const reasonExplanation: Record<string, string> = {
    "Replied": "Lead or recipient has replied — sequence auto-stopped.",
    "Needs review": "Requires manual review before continuing.",
    "Mailbox limit reached": "Sender has hit daily or hourly cap.",
    "Outside send window": "Current time is outside configured business hours.",
    "Missing data": "Lead is missing required information (email, etc).",
    "Sequence conflict": "Another sequence is already active for this lead.",
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">{groups.reduce((s, [, v]) => s + v.length, 0)} blocked sequences across {groups.length} reason{groups.length === 1 ? "" : "s"}</p>

      {groups.map(([label, seqs]) => (
        <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
          <button onClick={() => toggle(label)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              {expanded.has(label) ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-300">{seqs.length}</span>
            </div>
            <span className="text-xs text-zinc-500 max-w-xs truncate">{reasonExplanation[label] || "Requires attention."}</span>
          </button>

          {expanded.has(label) && (
            <div className="border-t border-white/[0.04]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.03] text-xs text-zinc-600">
                    <th className="px-4 py-1.5 text-left font-medium">Lead</th>
                    <th className="px-3 py-1.5 text-left font-medium">Step</th>
                    <th className="px-3 py-1.5 text-left font-medium">Reason</th>
                    <th className="px-3 py-1.5 text-left font-medium">Mailbox</th>
                    <th className="px-3 py-1.5 text-left font-medium">Last sent</th>
                    <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {seqs.map((s) => (
                    <tr key={s.id} className="group hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id}`}</div>
                        {s.lead?.email && <div className="text-xs text-zinc-500">{s.lead.email}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{fmtStep(s.currentStep)}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400 max-w-[200px] truncate">{s.blockerDetail || s.blockerReason || "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-zinc-500">{s.mailbox?.gmailAddress?.split("@")[0] || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-500">{fmtDt(s.lastSentAt, "Never")}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {s.status === "PAUSED" ? (
                            <button onClick={() => void onUpdateSeq(s.id, "resume")} disabled={busyKey === `resume:${s.id}`} className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" title="Resume">
                              {busyKey === `resume:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <button onClick={() => void onUpdateSeq(s.id, "stop")} disabled={busyKey === `stop:${s.id}`} className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-300" title="Stop">
                              {busyKey === `stop:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TAB 4: Rules
   ═══════════════════════════════════════════════════ */

function RulesTab({
  settings, onChange, onSave, busyKey, overview,
}: {
  settings: AutomationOverview["settings"];
  onChange: (fn: (prev: AutomationOverview["settings"]) => AutomationOverview["settings"]) => void;
  onSave: () => Promise<void>;
  busyKey: string | null;
  overview: AutomationOverview;
}) {
  const up = (patch: Partial<AutomationOverview["settings"]>) => onChange((p) => ({ ...p, ...patch }));

  return (
    <div className="max-w-2xl space-y-6">
      {/* Global toggle */}
      <SettingsGroup title="Engine control">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-200">Global automation</div>
            <div className="text-xs text-zinc-500">When paused, no automatic sends will fire.</div>
          </div>
          <button
            onClick={() => up({ globalPaused: !settings.globalPaused })}
            className={`relative h-6 w-11 rounded-full transition-colors ${settings.globalPaused ? "bg-zinc-700" : "bg-emerald-500"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.globalPaused ? "left-0.5" : "left-[22px]"}`} />
          </button>
        </div>
      </SettingsGroup>

      {/* Business hours */}
      <SettingsGroup title="Business hours">
        <p className="mb-3 text-xs text-zinc-500">Sends only fire inside this window ({APP_TIME_ZONE_LABEL}, weekdays).</p>
        <div className="grid grid-cols-2 gap-3">
          <SettingsField label="Start hour" value={settings.sendWindowStartHour} onChangeNum={(v) => up({ sendWindowStartHour: v })} />
          <SettingsField label="Start minute" value={settings.sendWindowStartMinute} onChangeNum={(v) => up({ sendWindowStartMinute: v })} />
          <SettingsField label="End hour" value={settings.sendWindowEndHour} onChangeNum={(v) => up({ sendWindowEndHour: v })} />
          <SettingsField label="End minute" value={settings.sendWindowEndMinute} onChangeNum={(v) => up({ sendWindowEndMinute: v })} />
        </div>
      </SettingsGroup>

      {/* Follow-up timing */}
      <SettingsGroup title="Follow-up timing">
        <p className="mb-3 text-xs text-zinc-500">How long to wait between sequence steps.</p>
        <div className="grid grid-cols-2 gap-3">
          <SettingsField label="Follow-up 1 (business days)" value={settings.followUp1BusinessDays} onChangeNum={(v) => up({ followUp1BusinessDays: v })} />
          <SettingsField label="Follow-up 2 (business days)" value={settings.followUp2BusinessDays} onChangeNum={(v) => up({ followUp2BusinessDays: v })} />
        </div>
      </SettingsGroup>

      {/* Initial delay */}
      <SettingsGroup title="Initial delay">
        <p className="mb-3 text-xs text-zinc-500">Random delay after a first touch before scheduling follow-up.</p>
        <div className="grid grid-cols-2 gap-3">
          <SettingsField label="Min delay (minutes)" value={settings.initialDelayMinMinutes} onChangeNum={(v) => up({ initialDelayMinMinutes: v })} />
          <SettingsField label="Max delay (minutes)" value={settings.initialDelayMaxMinutes} onChangeNum={(v) => up({ initialDelayMaxMinutes: v })} />
        </div>
      </SettingsGroup>

      {/* Scheduler */}
      <SettingsGroup title="Scheduler">
        <div className="grid grid-cols-2 gap-3">
          <SettingsField label="Claim batch size" value={settings.schedulerClaimBatch} onChangeNum={(v) => up({ schedulerClaimBatch: v })} />
          <SettingsField label="Reply sync stale (minutes)" value={settings.replySyncStaleMinutes} onChangeNum={(v) => up({ replySyncStaleMinutes: v })} />
        </div>
      </SettingsGroup>

      {/* Reply detection info */}
      <SettingsGroup title="Reply detection">
        <p className="text-xs text-zinc-500 leading-5">
          The engine checks for Gmail replies on active sequences every <span className="text-zinc-300">{settings.replySyncStaleMinutes} minutes</span>.
          When a reply is detected, the sequence is automatically stopped.
          Use &ldquo;Sync replies&rdquo; to trigger an immediate check.
        </p>
      </SettingsGroup>

      {/* Stop conditions info */}
      <SettingsGroup title="Stop conditions">
        <p className="text-xs text-zinc-500 leading-5">
          Sequences automatically stop when: a reply is received, the lead&apos;s outreach status changes to an incompatible state,
          or all configured follow-up steps have been sent (sequence completion).
          You can also manually stop or pause individual sequences from the Queue or Blocked tabs.
        </p>
      </SettingsGroup>

      <div className="flex items-center justify-between pt-2">
        <Button asChild size="sm" variant="ghost" className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04]">
          <Link href="/outreach">Open outreach <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
        <Button size="sm" onClick={() => void onSave()} disabled={busyKey === "settings"} className="h-8 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200">
          {busyKey === "settings" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Settings2 className="mr-1 h-3 w-3" />}
          Save rules
        </Button>
      </div>
    </div>
  );
}

/* ─── shared settings primitives ─────────────────── */

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function SettingsField({ label, value, onChangeNum }: { label: string; value: number; onChangeNum: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChangeNum(Number(e.target.value || 0))}
        className="h-8 border-white/8 bg-black/30 text-sm text-zinc-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
