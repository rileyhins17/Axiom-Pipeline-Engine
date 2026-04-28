"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Power, RefreshCcw, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

type EmergencyState = {
  emergencyPaused: boolean;
  emergencyPausedAt: string | null;
  emergencyPausedBy: string | null;
  emergencyPauseReason: string | null;
};

type Props = {
  compact?: boolean;
  initialState: EmergencyState;
};

export function EmergencyControlCard({ compact = false, initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<EmergencyState>(initialState);
  const [note, setNote] = useState(initialState.emergencyPauseReason || "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const pausedAt = useMemo(() => formatDate(state.emergencyPausedAt), [state.emergencyPausedAt]);
  const paused = state.emergencyPaused;
  const nextPaused = !paused;
  const title = paused ? "Emergency stop engaged" : "Emergency kill switch armed";
  const description = paused
    ? "Automation intake, queueing, and sends are blocked until the stop is cleared."
    : "Engage this to halt autonomous intake, queueing, and email sending across the app.";
  const buttonLabel = paused ? "Clear stop" : "Engage stop";
  const buttonTone = paused
    ? "border-emerald-400/40 bg-emerald-400/[0.14] text-emerald-200 hover:bg-emerald-400/[0.22]"
    : "border-red-400/40 bg-red-500/[0.18] text-red-200 hover:bg-red-500/[0.28]";
  const shellTone = paused
    ? "border-red-400/30 bg-red-500/[0.08]"
    : "border-emerald-400/25 bg-emerald-500/[0.06]";
  const topTone = paused ? "from-red-400/40 via-orange-400/20 to-transparent" : "from-emerald-400/30 via-cyan-400/20 to-transparent";

  async function submitToggle() {
    setError(null);
    const confirmed = window.confirm(
      paused
        ? "Clear the emergency stop and resume automation?"
        : "Engage the emergency stop and halt autonomous intake, queueing, and sending?",
    );
    if (!confirmed) {
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch("/api/outreach/automation/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused: nextPaused,
          note: note.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as EmergencyState & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update emergency stop");
      }

      setState({
        emergencyPaused: Boolean(payload.emergencyPaused),
        emergencyPausedAt: payload.emergencyPausedAt || null,
        emergencyPausedBy: payload.emergencyPausedBy || null,
        emergencyPauseReason: payload.emergencyPauseReason || null,
      });
      setNote(payload.emergencyPauseReason || "");
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update emergency stop");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={`v2-card overflow-hidden ${shellTone}`}>
      <div className={`h-1 bg-gradient-to-r ${topTone}`} />
      <div className={compact ? "p-4" : "p-5"}>
        <div className={`flex ${compact ? "flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" : "flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`v2-pill ${paused ? "border-red-400/30 bg-red-500/[0.12] text-red-200" : "v2-pill-accent"}`}>
                <ShieldAlert className="size-3.5" />
                {paused ? "Stopped" : "Armed"}
              </span>
              <span className="v2-pill">
                <AlertTriangle className="size-3.5" />
                Emergency control
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{description}</p>
            {paused ? (
              <div className="mt-3 space-y-1 text-[11px] text-zinc-500">
                <div>Paused at {pausedAt}</div>
                <div className="font-mono text-zinc-400">{state.emergencyPausedBy || "system"}</div>
              </div>
            ) : null}
          </div>

          <div className={compact ? "flex items-center gap-2" : "flex flex-col gap-2 sm:flex-row sm:items-center"}>
            <button
              type="button"
              onClick={submitToggle}
              disabled={isPending}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${buttonTone} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Power className="size-4" />
              {buttonLabel}
            </button>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/[0.14] hover:bg-white/[0.06]"
            >
              <RefreshCcw className="size-4" />
              Refresh
            </button>
          </div>
        </div>

        {!compact ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-zinc-500">Note for audit trail</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional reason or incident note"
                className="min-h-[96px] w-full resize-none rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
              />
            </label>
            <div className="text-[11px] text-zinc-500">
              {paused
                ? "Clearing the stop will let the next cron tick resume naturally."
                : "Engaging the stop does not delete data; it only halts autonomous execution."}
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
