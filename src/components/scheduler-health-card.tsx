"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Play,
  RefreshCcw,
  Wrench,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type { RepairResult, SchedulerHealthData } from "@/app/api/outreach/automation/health/route";

type Props = { compact?: boolean };

const BLOCKER_LABELS: Record<string, string> = {
  mailbox_cooldown: "Mailbox cooldown",
  hourly_cap_reached: "Hourly cap",
  daily_cap_reached: "Daily cap",
  follow_up_daily_cap_reached: "Follow-up cap",
  global_daily_cap_reached: "Global cap",
  outside_send_window: "Outside window",
  generation_failed_retryable: "Gen failed (retry)",
  send_failed_retryable: "Send failed (retry)",
  below_send_min_score: "Below min score",
  missing_enrichment: "Missing enrichment",
  mailbox_disconnected: "Mailbox disconnected",
  mailbox_disabled: "Mailbox disabled",
  global_pause: "Global pause",
  emergency_stop: "Emergency stop",
  manual_pause: "Manual pause",
  stale_claim_recovered: "Stale claim",
  stale_sender_claim_recovered: "Stale sender claim",
};

function blockerLabel(reason: string) {
  return BLOCKER_LABELS[reason] || reason.replace(/_/g, " ");
}

function relativeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) {
    const m = Math.abs(Math.floor(diff / 60_000));
    if (m < 1) return "now";
    if (m < 60) return `in ${m}m`;
    return `in ${Math.floor(m / 60)}h`;
  }
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type TriggerResult = {
  triggered: boolean;
  runId: string;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

type ErrorPayload = { error?: string };

function getPayloadError(payload: unknown, fallback: string) {
  const error = (payload as ErrorPayload | null)?.error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

export function SchedulerHealthCard({ compact = false }: Props) {
  const router = useRouter();
  const [health, setHealth] = useState<SchedulerHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/automation/health");
      if (!res.ok) throw new Error("Failed to fetch health data");
      const data = (await res.json()) as SchedulerHealthData;
      setHealth(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  async function runRepair() {
    setRepairResult(null);
    setTriggerResult(null);
    setError(null);

    setRepairing(true);
    try {
      const res = await fetch("/api/outreach/automation/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getPayloadError(payload, "Repair failed"));
      }
      const result = payload as RepairResult;
      setRepairResult(result);
      await fetchHealth();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  async function runTrigger() {
    setTriggerResult(null);
    setError(null);

    setTriggering(true);
    try {
      const res = await fetch("/api/outreach/automation/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getPayloadError(payload, "Trigger failed"));
      }
      setTriggerResult(payload as TriggerResult);
      await fetchHealth();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  const totalStuck =
    health?.stuckSteps.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const hasIssues =
    totalStuck > 0 ||
    (health?.staleClaimedSteps ?? 0) > 0 ||
    (health?.blockedSequences ?? 0) > 0 ||
    health?.lastRun?.status === "FAILED" ||
    health?.mailboxes.some((m) => !m.connected) ||
    health?.emergencyPaused ||
    health?.intakePaused;

  const statusTone = health
    ? hasIssues
      ? "border-amber-400/30 bg-amber-500/[0.06]"
      : "border-emerald-400/25 bg-emerald-500/[0.06]"
    : "border-white/[0.06] bg-[#0b131d]";
  const topGradient = health
    ? hasIssues
      ? "from-amber-400/40 via-orange-400/20 to-transparent"
      : "from-emerald-400/30 via-cyan-400/20 to-transparent"
    : "from-zinc-400/20 to-transparent";

  return (
    <div className={`v2-card overflow-hidden ${statusTone}`}>
      <div className={`h-1 bg-gradient-to-r ${topGradient}`} />
      <div className={compact ? "p-4" : "p-5"}>
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`v2-pill ${hasIssues ? "border-amber-400/30 bg-amber-500/[0.12] text-amber-200" : "v2-pill-accent"}`}
              >
                <Activity className="size-3.5" />
                {loading
                  ? "Loading"
                  : hasIssues
                    ? "Issues detected"
                    : "Healthy"}
              </span>
              <span className="v2-pill">
                <Wrench className="size-3.5" />
                Scheduler health
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">
              Pipeline diagnostics
            </h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {loading
                ? "Checking scheduler health..."
                : hasIssues
                  ? "Issues found that may slow or stop sends. Use Repair to clear stale state."
                  : "No issues detected. The scheduler is operating normally."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runRepair}
              disabled={repairing || triggering || loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/[0.14] px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/[0.22] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {repairing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wrench className="size-4" />
              )}
              Repair
            </button>
            <button
              type="button"
              onClick={runTrigger}
              disabled={triggering || repairing || loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/[0.14] px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.22] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {triggering ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Force Run
            </button>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/[0.14] hover:bg-white/[0.06]"
            >
              <RefreshCcw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Repair result banner */}
        {repairResult && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Reset {repairResult.healedSteps} blocked steps,{" "}
              {repairResult.healedSequences} sequences,{" "}
              {repairResult.recoveredClaims} stuck claims,{" "}
              {repairResult.clearedStaleRuns} stale runs,{" "}
              {repairResult.clearedSchedulerLeases} scheduler locks - all ready to send on next tick
            </span>
          </div>
        )}

        {/* Trigger result banner */}
        {triggerResult && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-2 text-sm text-cyan-200">
            <Play className="mt-0.5 size-4 shrink-0" />
            <span>
              Scheduler ran: claimed {triggerResult.claimed}, sent{" "}
              {triggerResult.sent}, failed {triggerResult.failed}, skipped{" "}
              {triggerResult.skipped}
            </span>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-300">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Diagnostics grid */}
        {health && !loading && (
          <div className="mt-4 space-y-4">
            {/* Last run */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label="Last run"
                value={health.lastRun ? relativeAgo(health.lastRun.startedAt) : "Never"}
                tone={
                  !health.lastRun
                    ? "zinc"
                    : health.lastRun.status === "FAILED"
                      ? "red"
                      : "emerald"
                }
              />
              <MiniStat
                label="Last run sent"
                value={`${health.lastRun?.sent ?? 0}/${health.lastRun?.claimed ?? 0}`}
                tone={
                  (health.lastRun?.sent ?? 0) > 0
                    ? "cyan"
                    : (health.lastRun?.claimed ?? 0) > 0
                      ? "amber"
                      : "zinc"
                }
              />
              <MiniStat
                label="Scheduled steps"
                value={String(health.totalScheduledSteps)}
                tone="violet"
              />
              <MiniStat
                label="Active sequences"
                value={String(health.totalActiveSequences)}
                tone="cyan"
              />
            </div>

            {/* Issues section */}
            {hasIssues && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  Issues
                </div>

                {/* Emergency / Intake pause */}
                {health.emergencyPaused && (
                  <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/[0.08] p-3 text-sm font-medium text-red-200">
                    <XCircle className="size-3.5 shrink-0" />
                    Emergency kill switch is ACTIVE — all sends halted
                  </div>
                )}
                {health.intakePaused && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.08] p-3 text-sm text-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Intake paused — no new leads being queued
                  </div>
                )}

                {/* Stuck steps by blocker */}
                {health.stuckSteps.length > 0 && (
                  <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-200">
                      <AlertTriangle className="size-3.5" />
                      {totalStuck} steps stuck with stale blockers
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {health.stuckSteps.map((s) => (
                        <span
                          key={s.reason}
                          className="inline-flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono text-amber-300"
                        >
                          {blockerLabel(s.reason)}
                          <span className="font-semibold">{s.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stale claims */}
                {health.staleClaimedSteps > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 p-3 text-sm text-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {health.staleClaimedSteps} stale claimed steps (stuck &gt;
                    2 min)
                  </div>
                )}

                {/* Blocked sequences */}
                {health.blockedSequences > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 p-3 text-sm text-amber-200">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {health.blockedSequences} sequences with stopReason set
                  </div>
                )}

                {/* Failed last run */}
                {health.lastRun?.status === "FAILED" && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/[0.08] p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-200">
                      <XCircle className="size-3.5" />
                      Last run failed
                    </div>
                    {health.lastRun.error && (
                      <div className="mt-1 font-mono text-[11px] text-red-300/70">
                        {health.lastRun.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Disconnected mailboxes */}
                {health.mailboxes.some((m) => !m.connected) && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/[0.08] p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-200">
                      <Mail className="size-3.5" />
                      Disconnected mailboxes
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {health.mailboxes
                        .filter((m) => !m.connected)
                        .map((m) => (
                          <div
                            key={m.address}
                            className="font-mono text-[11px] text-red-300/70"
                          >
                            {m.address}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mailbox summary */}
            {health.mailboxes.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  Mailbox status
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {health.mailboxes.map((m) => (
                    <div
                      key={m.address}
                      className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-white">
                          {m.address}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {m.connected ? m.status : "Disconnected"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-zinc-300">
                          {m.sentToday}/{m.dailyLimit}
                        </span>
                        <span
                          className={`inline-flex size-2 rounded-full ${m.connected ? "bg-emerald-400" : "bg-red-400"}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent failed runs */}
            {health.recentFailedRuns.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  Recent failed runs
                </div>
                <div className="space-y-1.5">
                  {health.recentFailedRuns.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px]"
                    >
                      <span className="font-mono text-zinc-400">
                        {r.error || "Unknown error"}
                      </span>
                      <span className="shrink-0 font-mono text-zinc-500">
                        {relativeAgo(r.startedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="mt-4 flex items-center gap-2 py-6 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            Loading diagnostics...
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "violet" | "amber" | "emerald" | "red" | "zinc";
}) {
  const text =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "violet"
        ? "text-violet-300"
        : tone === "amber"
          ? "text-amber-300"
          : tone === "emerald"
            ? "text-emerald-300"
            : tone === "red"
              ? "text-red-300"
              : "text-zinc-300";
  return (
    <div className="v2-tile px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${text}`}>
        {value}
      </div>
    </div>
  );
}
