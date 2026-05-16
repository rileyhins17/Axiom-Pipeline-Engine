"use client";

import { useState } from "react";
import { Database, Pause, Play, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  initialPaused: boolean;
  initialPausedBy: string | null;
};

export function IntakeControlCard({ initialPaused, initialPausedBy }: Props) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [pausedBy, setPausedBy] = useState(initialPausedBy);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const shellTone = paused
    ? "border-amber-400/30 bg-amber-500/[0.06]"
    : "border-white/[0.07] bg-[#0b131d]";
  const topTone = paused ? "from-amber-400/40 via-orange-400/20 to-transparent" : "from-cyan-400/20 via-transparent to-transparent";

  async function toggle() {
    const nextPaused = !paused;
    const confirmed = window.confirm(
      nextPaused
        ? "Pause lead intake? Outreach and email sends will continue normally."
        : "Resume lead intake? The system will start scraping for new leads again.",
    );
    if (!confirmed) return;

    setError(null);
    setIsPending(true);
    try {
      const response = await fetch("/api/outreach/automation/intake-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: nextPaused }),
      });

      const payload = (await response.json()) as { intakePaused?: boolean; intakePausedBy?: string | null; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update intake pause");
      }

      setPaused(Boolean(payload.intakePaused));
      setPausedBy(payload.intakePausedBy || null);
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update intake pause");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={`v2-card overflow-hidden ${shellTone}`}>
      <div className={`h-1 bg-gradient-to-r ${topTone}`} />
      <div className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`v2-pill ${paused ? "border-amber-400/30 bg-amber-500/[0.12] text-amber-200" : "v2-pill-accent"}`}>
                <Database className="size-3.5" />
                {paused ? "Intake paused" : "Intake active"}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">Lead intake control</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {paused
                ? "Scraping for new leads is paused. Outreach and email sends continue normally."
                : "The system is scraping for new leads automatically each cron tick."}
            </p>
            {paused && pausedBy ? (
              <div className="mt-2 font-mono text-[11px] text-zinc-500">Paused by {pausedBy}</div>
            ) : null}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={toggle}
              disabled={isPending}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                paused
                  ? "border-emerald-400/40 bg-emerald-400/[0.14] text-emerald-200 hover:bg-emerald-400/[0.22]"
                  : "border-amber-400/40 bg-amber-500/[0.14] text-amber-200 hover:bg-amber-500/[0.22]"
              }`}
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {paused ? "Resume intake" : "Pause intake"}
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

        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </div>
    </div>
  );
}
