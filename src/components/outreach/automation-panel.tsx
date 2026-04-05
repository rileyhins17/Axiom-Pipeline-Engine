"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Clock3,
  Loader2,
  Mailbox,
  PauseCircle,
  PlayCircle,
  Power,
  RefreshCw,
  ShieldAlert,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { APP_TIME_ZONE_LABEL, formatAppClock, formatAppDateTime } from "@/lib/time";

type ReadyLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  contactName?: string | null;
  axiomScore?: number | null;
  axiomTier?: string | null;
  websiteStatus?: string | null;
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
  nextStep?: {
    stepType: string;
    scheduledFor: string;
  } | null;
};

type AutomationRun = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  sentCount: number;
  failedCount: number;
  claimedCount: number;
  skippedCount?: number;
  metadata?: string | null;
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
  recentRuns: AutomationRun[];
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

type ManualRunResult = {
  runId: string;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  replySync: {
    checked: number;
    stopped: number;
  };
};

type ReplySyncResult = {
  checked: number;
  stopped: number;
};

type WithOverview<T> = T & {
  overview?: AutomationOverview;
};

type ManualActionSummary =
  | {
      kind: "run";
      summary: string;
    }
  | {
      kind: "sync";
      summary: string;
    }
  | null;

type AutomationPanelProps = {
  overview: AutomationOverview;
  onOverviewUpdated: (nextOverview?: AutomationOverview) => Promise<void>;
};

function formatDateTime(value: string | Date | null | undefined, fallback = "Not scheduled") {
  return formatAppDateTime(
    value,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    fallback,
  );
}

function formatStepLabel(value: string) {
  switch (value) {
    case "INITIAL":
      return "Initial";
    case "FOLLOW_UP_1":
      return "Follow-up 1";
    case "FOLLOW_UP_2":
      return "Follow-up 2";
    default:
      return value.toLowerCase().replaceAll("_", " ");
  }
}

function formatSendWindow(settings: AutomationOverview["settings"]) {
  return `${formatAppClock(settings.sendWindowStartHour, settings.sendWindowStartMinute)} to ${formatAppClock(
    settings.sendWindowEndHour,
    settings.sendWindowEndMinute,
  )} ${APP_TIME_ZONE_LABEL}, weekdays`;
}

function formatRelativeCountdown(value: string | null | undefined) {
  if (!value) return "No send scheduled";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "No send scheduled";
  const deltaMs = target.getTime() - Date.now();
  if (deltaMs <= 0) return "Due now";
  const totalMinutes = Math.round(deltaMs / 60000);
  if (totalMinutes < 60) return `In ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `In ${hours}h ${minutes}m` : `In ${hours}h`;
}

function getStateChipClasses(state: AutomationSequence["state"]) {
  switch (state) {
    case "QUEUED":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-200";
    case "SENDING":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    case "WAITING":
      return "border-blue-500/20 bg-blue-500/10 text-blue-200";
    case "BLOCKED":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200";
    case "COMPLETED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    default:
      return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  }
}

function parseRunMetadata(run: AutomationRun) {
  if (!run.metadata) return null;
  try {
    return JSON.parse(run.metadata) as { replySync?: { checked?: number; stopped?: number } };
  } catch {
    return null;
  }
}

export function AutomationPanel({ overview, onOverviewUpdated }: AutomationPanelProps) {
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(overview.settings);
  const [manualActionSummary, setManualActionSummary] = useState<ManualActionSummary>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    setSettingsDraft(overview.settings);
  }, [overview.settings]);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const scheduleTick = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (!document.hidden) {
          setTick((value) => value + 1);
        }
        scheduleTick();
      }, 30_000);
    };

    scheduleTick();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const scheduleRefresh = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.hidden) {
          scheduleRefresh(45_000);
          return;
        }

        void onOverviewUpdated()
          .then(() => {
            scheduleRefresh(45_000);
          })
          .catch(() => {
            scheduleRefresh(90_000);
          });
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden || cancelled) {
        return;
      }

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      void onOverviewUpdated()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            scheduleRefresh(45_000);
          }
        });
    };

    scheduleRefresh(45_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onOverviewUpdated]);

  const executeAction = async <T,>(key: string, fn: () => Promise<Response>) => {
    setBusyKey(key);
    try {
      const res = await fn();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Automation action failed");
      }
      return data as T;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Automation action failed", {
        type: "error",
        icon: "note",
      });
      return null;
    } finally {
      setBusyKey(null);
    }
  };

  const scheduledSequences = useMemo(
    () =>
      overview.sequences.filter(
        (sequence) =>
          sequence.hasSentAnyStep &&
          (sequence.state === "WAITING" || sequence.state === "SENDING"),
      ),
    [overview.sequences],
  );
  const blockedSequences = useMemo(
    () => overview.sequences.filter((sequence) => sequence.state === "BLOCKED" && sequence.hasSentAnyStep),
    [overview.sequences],
  );
  const stoppedSequences = useMemo(() => overview.finished.slice(0, 8), [overview.finished]);
  const nextSendCountdown = formatRelativeCountdown(overview.engine.nextSendAt);

  const groupedBlocked = useMemo(() => {
    const groups = new Map<string, AutomationSequence[]>();
    for (const sequence of blockedSequences) {
      const key = sequence.blockerLabel || "Blocked";
      const current = groups.get(key) || [];
      current.push(sequence);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [blockedSequences]);

  const handleRunScheduler = async () => {
    const data = await executeAction<WithOverview<ManualRunResult>>("run", () =>
      fetch("/api/outreach/automation/run", { method: "POST" }),
    );
    if (!data) return;

    setManualActionSummary({
      kind: "run",
      summary: `Checked ${data.claimed}, sent ${data.sent}, blocked ${data.failed}, skipped ${data.skipped}. Reply sync checked ${data.replySync.checked} and stopped ${data.replySync.stopped}.`,
    });
    toast(
      data.sent > 0
        ? `Automation check sent ${data.sent} email${data.sent === 1 ? "" : "s"}`
        : "Automation check finished with no sends",
      { type: "success", icon: "note" },
    );
    await onOverviewUpdated(data.overview);
  };

  const handleSyncReplies = async () => {
    const data = await executeAction<WithOverview<ReplySyncResult>>("sync", () =>
      fetch("/api/outreach/automation/replies/sync", { method: "POST" }),
    );
    if (!data) return;

    setManualActionSummary({
      kind: "sync",
      summary: `Checked ${data.checked} active sequences and stopped ${data.stopped}.`,
    });
    toast(
      data.stopped > 0
        ? `Reply sync stopped ${data.stopped} sequence${data.stopped === 1 ? "" : "s"}`
        : "Reply sync finished",
      { type: "success", icon: "note" },
    );
    await onOverviewUpdated(data.overview);
  };

  const updateSequence = async (sequenceId: string, action: "pause" | "resume" | "stop" | "remove") => {
    const data = await executeAction<WithOverview<{ sequence: unknown }>>(
      `${action}:${sequenceId}`,
      () =>
        fetch(`/api/outreach/automation/sequences/${sequenceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
    );
    if (!data) return;

    toast(
      action === "pause"
        ? "Sequence paused"
        : action === "resume"
          ? "Sequence resumed"
          : action === "remove"
            ? "Sequence removed"
            : "Sequence stopped",
      { type: "success", icon: "note" },
    );
    await onOverviewUpdated(data.overview);
  };

  const updateMailbox = async (mailboxId: string, status: string) => {
    const data = await executeAction<WithOverview<{ mailbox: unknown }>>(
      `mailbox:${mailboxId}`,
      () =>
        fetch(`/api/outreach/automation/mailboxes/${mailboxId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
    );
    if (!data) return;

    toast(status === "PAUSED" ? "Mailbox paused" : "Mailbox resumed", {
      type: "success",
      icon: "note",
    });
    await onOverviewUpdated(data.overview);
  };

  const saveSettings = async () => {
    const data = await executeAction<WithOverview<{ settings: AutomationOverview["settings"] }>>("settings", () =>
      fetch("/api/outreach/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      }),
    );
    if (!data) return;

    toast("Automation settings updated", { type: "success", icon: "note" });
    await onOverviewUpdated(data.overview);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/[0.06] bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.26)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-emerald-300">
              <span className={`h-2 w-2 rounded-full bg-emerald-400 ${overview.engine.mode === "ACTIVE" ? "animate-pulse" : ""}`} />
              Automation Engine
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Automatic outreach, without the mystery.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Automation owns the post-send lifecycle only. Once a first touch lands, the engine keeps the thread moving during business hours and shows exactly why any follow-up is waiting or blocked.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="rounded-full border border-white/10 px-4 text-xs text-zinc-300 hover:bg-white/[0.04]"
            >
              <Link href="/outreach?stage=initial">
                Open Initial Outreach
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleSyncReplies()}
              className="rounded-full border border-white/10 px-4 text-xs text-zinc-300 hover:bg-white/[0.04]"
            >
              {busyKey === "sync" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync replies
            </Button>
            <Button
              size="sm"
              onClick={() => void handleRunScheduler()}
              className="rounded-full bg-white px-4 text-xs text-black hover:bg-zinc-200"
            >
              {busyKey === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
              Run check now
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-[11px] text-zinc-500">Engine</div>
            <div className="mt-1 text-base font-semibold text-white">{overview.engine.mode}</div>
            <div className="mt-1 text-xs text-zinc-500">{formatSendWindow(overview.settings)}</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.04] px-4 py-3">
            <div className="text-[11px] text-zinc-500">Next send</div>
            <div className="mt-1 text-base font-semibold text-white">{formatDateTime(overview.engine.nextSendAt, "No send queued")}</div>
            <div className="mt-1 text-xs text-emerald-300">{nextSendCountdown}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-[11px] text-zinc-500">Active follow-up</div>
            <div className="mt-1 text-base font-semibold text-white">{overview.stats.waiting + overview.stats.sending}</div>
            <div className="mt-1 text-xs text-zinc-500">already post-send</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-[11px] text-zinc-500">Scheduled today</div>
            <div className="mt-1 text-base font-semibold text-white">{overview.stats.scheduledToday}</div>
            <div className="mt-1 text-xs text-zinc-500">automatic touches due today</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="text-[11px] text-zinc-500">Blocked / replied</div>
            <div className="mt-1 text-base font-semibold text-white">
              {overview.stats.blocked} / {overview.stats.replied}
            </div>
            <div className="mt-1 text-xs text-zinc-500">needs review or already replied</div>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/[0.06] bg-black/20 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">What needs attention now</div>
          <div className="mt-2 text-sm text-zinc-300">
            {blockedSequences.length > 0
              ? `${blockedSequences.length} post-send sequence${blockedSequences.length === 1 ? "" : "s"} are blocked and need review before they can continue.`
              : overview.engine.nextSendAt
                ? `The engine is clear right now. The next follow-up is due ${formatDateTime(overview.engine.nextSendAt)}.`
                : "The engine is clear right now. No post-send follow-up is currently due."}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Clock3 className="h-4 w-4 text-blue-400" />
                  Active follow-up
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Only post-send sequences live here, with the next follow-up time and assigned mailbox.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
                {scheduledSequences.length} follow-up sequence{scheduledSequences.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {scheduledSequences.length > 0 ? (
                scheduledSequences.map((sequence) => (
                  <div key={sequence.id} className="rounded-[24px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {sequence.lead?.businessName || `Lead #${sequence.id}`}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${getStateChipClasses(sequence.state)}`}>
                            {sequence.state === "WAITING" ? "Waiting for follow-up" : sequence.state}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400">
                            {formatStepLabel(sequence.currentStep)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-400">
                          {sequence.state === "SENDING"
                            ? "This sequence is actively being sent now."
                            : `Next send ${formatDateTime(sequence.nextSendAt)} via ${sequence.mailbox?.gmailAddress || "no mailbox"}.`}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span>{sequence.lead?.email || "No email"}</span>
                          <span>{sequence.mailbox?.gmailAddress || "Unassigned mailbox"}</span>
                          <span>{formatRelativeCountdown(sequence.nextSendAt)}</span>
                          <span>Last sent: {formatDateTime(sequence.lastSentAt, "Not sent yet")}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {sequence.status !== "PAUSED" && sequence.state !== "STOPPED" && sequence.state !== "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateSequence(sequence.id, "pause")}
                            className="rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"
                          >
                            {busyKey === `pause:${sequence.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <PauseCircle className="h-3 w-3" />}
                            Pause
                          </Button>
                        )}
                        {sequence.status === "PAUSED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateSequence(sequence.id, "resume")}
                            className="rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"
                          >
                            {busyKey === `resume:${sequence.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                            Resume
                          </Button>
                        )}
                        {sequence.state !== "STOPPED" && sequence.state !== "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void updateSequence(sequence.id, "stop")}
                            className="rounded-full border border-red-500/20 px-3 text-xs text-red-300 hover:bg-red-500/10"
                          >
                            {busyKey === `stop:${sequence.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                            Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
                  No scheduled automation sequences yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              Blocked sequences
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Every blocked sequence shows one canonical reason first, so the queue does not feel inconsistent.
            </p>

            <div className="mt-4 space-y-4">
              {groupedBlocked.length > 0 ? (
                groupedBlocked.map(([label, sequences]) => (
                  <div key={label} className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400">
                        {sequences.length}
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {sequences.map((sequence) => (
                        <div key={sequence.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {sequence.lead?.businessName || `Lead #${sequence.id}`}
                            </span>
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                              {formatStepLabel(sequence.currentStep)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-zinc-400">{sequence.blockerDetail || "This sequence needs attention before it can continue."}</p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                            <span>{sequence.lead?.email || "No email"}</span>
                            <span>{sequence.mailbox?.gmailAddress || "No mailbox assigned"}</span>
                            <span>{formatDateTime(sequence.nextSendAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
                  No blocked sequences right now.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Mailbox className="h-4 w-4 text-cyan-400" />
              Mailbox engine
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              New sequences alternate across connected senders, but every lead stays on one mailbox thread.
            </p>

            <div className="mt-4 space-y-3">
              {overview.mailboxes.length > 0 ? (
                overview.mailboxes.map((mailbox, index) => (
                  <div key={mailbox.id} className="rounded-[24px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{mailbox.label || mailbox.gmailAddress}</div>
                        <div className="font-mono text-xs text-zinc-400">{mailbox.gmailAddress}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {overview.mailboxes.length > 1 && index === 0 && (
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                            Next lane
                          </span>
                        )}
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          mailbox.status === "PAUSED" || mailbox.status === "DISABLED"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                            : "border-white/10 bg-white/[0.04] text-zinc-300"
                        }`}>
                          {mailbox.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <div className="text-[11px] text-zinc-500">Today</div>
                        <div className="mt-1 text-sm font-medium text-white">{mailbox.sentToday}/{mailbox.dailyLimit}</div>
                        <div className="mt-1 text-xs text-zinc-500">{Math.max(mailbox.dailyLimit - mailbox.sentToday, 0)} remaining</div>
                      </div>
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                        <div className="text-[11px] text-zinc-500">This hour</div>
                        <div className="mt-1 text-sm font-medium text-white">{mailbox.sentThisHour}/{mailbox.hourlyLimit}</div>
                        <div className="mt-1 text-xs text-zinc-500">{Math.max(mailbox.hourlyLimit - mailbox.sentThisHour, 0)} remaining</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                      <div>
                        {mailbox.timezone} / warmup {mailbox.warmupLevel} / next slot {formatDateTime(mailbox.nextAvailableAt, "Ready when due")}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void updateMailbox(mailbox.id, mailbox.status === "PAUSED" ? "ACTIVE" : "PAUSED")}
                        className="rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"
                      >
                        {busyKey === `mailbox:${mailbox.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : mailbox.status === "PAUSED" ? (
                          <PlayCircle className="h-3 w-3" />
                        ) : (
                          <PauseCircle className="h-3 w-3" />
                        )}
                        {mailbox.status === "PAUSED" ? "Resume mailbox" : "Pause mailbox"}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
                  Connect Gmail mailboxes to start automatic sending.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Bot className="h-4 w-4 text-emerald-400" />
              Recent sends
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Live proof of what automation has already delivered.
            </p>

            <div className="mt-4 space-y-3">
              {overview.recentSent.length > 0 ? (
                overview.recentSent.map((email, index) => (
                  <div
                    key={email.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      index === 0 ? "border-emerald-500/20 bg-emerald-500/[0.05]" : "border-white/[0.06] bg-black/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">
                        {email.lead?.businessName || email.recipientEmail}
                      </div>
                      <div className="text-xs text-zinc-500">{formatDateTime(email.sentAt)}</div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-400">{email.subject}</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>{email.senderEmail}</span>
                      <span>{email.recipientEmail}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
                  No automation sends recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Recent runs
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Automation checks are automatic. This section is just here so you can verify what the engine did.
            </p>

            <div className="mt-4 space-y-3">
              {manualActionSummary && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-zinc-200">
                  {manualActionSummary.summary}
                </div>
              )}

              {overview.recentRuns.length > 0 ? (
                overview.recentRuns.slice(0, 6).map((run) => {
                  const metadata = parseRunMetadata(run);
                  return (
                    <div key={run.id} className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{run.status}</div>
                        <div className="text-xs text-zinc-500">{formatDateTime(run.startedAt)}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                        <span>Claimed {run.claimedCount}</span>
                        <span>Sent {run.sentCount}</span>
                        <span>Failed {run.failedCount}</span>
                        <span>Skipped {run.skippedCount || 0}</span>
                        {metadata?.replySync && (
                          <span>Reply sync {metadata.replySync.checked || 0}/{metadata.replySync.stopped || 0}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
                  No scheduler runs recorded yet.
                </div>
              )}
            </div>
          </div>

          <details className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">Advanced controls</summary>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Manual controls stay available, but they are not required for normal automation behavior.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs font-medium text-zinc-300">Global automation</div>
                <select
                  value={settingsDraft.globalPaused ? "paused" : "running"}
                  onChange={(event) =>
                    setSettingsDraft((previous) => ({ ...previous, globalPaused: event.target.value === "paused" }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <option value="running">Running</option>
                  <option value="paused">Paused</option>
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-xs font-medium text-zinc-300">Initial delay range (minutes)</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      value={String(settingsDraft.initialDelayMinMinutes)}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          initialDelayMinMinutes: Number(event.target.value || 0),
                        }))
                      }
                      className="border-white/10 bg-black/40"
                    />
                    <Input
                      value={String(settingsDraft.initialDelayMaxMinutes)}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          initialDelayMaxMinutes: Number(event.target.value || 0),
                        }))
                      }
                      className="border-white/10 bg-black/40"
                    />
                  </div>
                </label>

                <label className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-xs font-medium text-zinc-300">Follow-up cadence (business days)</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      value={String(settingsDraft.followUp1BusinessDays)}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          followUp1BusinessDays: Number(event.target.value || 0),
                        }))
                      }
                      className="border-white/10 bg-black/40"
                    />
                    <Input
                      value={String(settingsDraft.followUp2BusinessDays)}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          followUp2BusinessDays: Number(event.target.value || 0),
                        }))
                      }
                      className="border-white/10 bg-black/40"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="mt-4 flex justify-between gap-3">
              <Button asChild variant="ghost" className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]">
                <Link href="/outreach">
                  Open manual Outreach
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="sm"
                onClick={() => void saveSettings()}
                className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200"
              >
                {busyKey === "settings" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                Save settings
              </Button>
            </div>
          </details>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">Stopped and completed</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Historical automation outcomes, including replies, completions, and manual stops.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
            {stoppedSequences.length} recent
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {stoppedSequences.length > 0 ? (
            stoppedSequences.map((sequence) => (
              <div key={sequence.id} className="rounded-[24px] border border-white/[0.06] bg-black/20 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {sequence.lead?.businessName || `Lead #${sequence.id}`}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${getStateChipClasses(sequence.state)}`}>
                    {sequence.state}
                  </span>
                  {(sequence.blockerLabel || sequence.stopReason) && (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400">
                      {sequence.blockerLabel || sequence.stopReason}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>{sequence.mailbox?.gmailAddress || "Unassigned mailbox"}</span>
                  <span>Last sent: {formatDateTime(sequence.lastSentAt, "No send recorded")}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-sm text-zinc-500">
              No completed or stopped sequences yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
