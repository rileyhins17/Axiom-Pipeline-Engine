"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Radar, Server, Sparkles, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

type RemoteJobStatus = "pending" | "claimed" | "running" | "completed" | "failed" | "canceled";

export type RemoteJobSummary = {
  claimedBy: string | null;
  createdAt: string;
  city: string;
  finishedAt: string | null;
  heartbeatAt: string | null;
  id: string;
  maxDepth: number;
  niche: string;
  radius: string;
  status: RemoteJobStatus;
  updatedAt: string;
};

function statusStyles(status: RemoteJobStatus) {
  switch (status) {
    case "running":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "claimed":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "failed":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    case "canceled":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
    case "completed":
      return "border-emerald-500/10 bg-emerald-500/5 text-emerald-200";
    case "pending":
    default:
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }
}

function formatRelativeTime(iso: string | null) {
  if (!iso) return "never";
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - time.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function isActive(status: RemoteJobStatus) {
  return status === "claimed" || status === "running" || status === "pending";
}

export function RemoteJobsCard() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<RemoteJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [busyBulkAction, setBusyBulkAction] = useState<"stop-all" | "clear" | null>(null);

  const loadJobs = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/scrape/jobs?limit=8", {
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => null)) as { jobs?: RemoteJobSummary[] } | null;

      if (!response.ok || !Array.isArray(data?.jobs)) {
        throw new Error("Unable to load remote jobs.");
      }

      setJobs(data.jobs);
      setError(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Remote jobs unavailable");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      const response = await fetch(`/api/scrape/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Unable to cancel job.");
      }

      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "canceled",
                finishedAt: new Date().toISOString(),
                heartbeatAt: new Date().toISOString(),
              }
            : job,
        ),
      );
      await loadJobs();
      toast("Job canceled", { type: "info" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to cancel job.", { type: "error" });
    } finally {
      setBusyJobId(null);
    }
  }, [loadJobs, toast]);

  const stopAllJobs = useCallback(async () => {
    if (!window.confirm("Cancel all pending, claimed, and running jobs?")) {
      return;
    }

    setBusyBulkAction("stop-all");
    try {
      const response = await fetch("/api/scrape/jobs/stop-all", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as { affectedCount?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Unable to stop jobs.");
      }

      await loadJobs();
      toast(`Stopped ${data?.affectedCount || 0} active job${data?.affectedCount === 1 ? "" : "s"}`, { type: "info" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to stop jobs.", { type: "error" });
    } finally {
      setBusyBulkAction(null);
    }
  }, [loadJobs, toast]);

  const clearRemoteJobs = useCallback(async () => {
    if (!window.confirm("Delete completed, failed, and canceled jobs from the remote list?")) {
      return;
    }

    setBusyBulkAction("clear");
    try {
      const response = await fetch("/api/scrape/jobs/clear", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as { deletedCount?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Unable to clear remote jobs.");
      }

      await loadJobs();
      toast(`Cleared ${data?.deletedCount || 0} terminal job${data?.deletedCount === 1 ? "" : "s"}`, { type: "info" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to clear remote jobs.", { type: "error" });
    } finally {
      setBusyBulkAction(null);
    }
  }, [loadJobs, toast]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    void loadJobs(controller.signal);
    timer = setInterval(() => {
      void loadJobs(controller.signal);
    }, 15000);

    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [loadJobs]);

  const activeJobs = useMemo(() => jobs.filter((job) => isActive(job.status)), [jobs]);
  const terminalJobs = useMemo(() => jobs.filter((job) => !isActive(job.status)), [jobs]);
  const visibleJobs = activeJobs.length > 0 ? activeJobs : jobs.slice(0, 4);

  if (!loading && visibleJobs.length === 0 && !error) {
    return null;
  }

  return (
    <div className="glass-ultra rounded-xl overflow-hidden border border-white/[0.05]">
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500 animate-gradient" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold tracking-wide">Remote Jobs</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              D1-backed jobs that the worker can claim or is already running.
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] font-mono text-[9px] uppercase tracking-wider text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            {activeJobs.length > 0 ? `${activeJobs.length} active` : `${jobs.length} total`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={stopAllJobs}
            disabled={busyBulkAction !== null || activeJobs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            <Ban className="w-3.5 h-3.5" />
            {busyBulkAction === "stop-all" ? "Stopping" : `Stop All Jobs (${activeJobs.length})`}
          </button>
          <button
            type="button"
            onClick={clearRemoteJobs}
            disabled={busyBulkAction !== null || terminalJobs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {busyBulkAction === "clear" ? "Clearing" : `Clear Remote Jobs (${terminalJobs.length})`}
          </button>
        </div>

        {error && jobs.length === 0 ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-white/[0.04] bg-black/25 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-zinc-100 truncate">{job.niche}</span>
                      <span className="text-[10px] text-zinc-700">|</span>
                      <span className="text-xs text-cyan-400 truncate">{job.city}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                      <span>R {job.radius} km</span>
                      <span>|</span>
                      <span>D {job.maxDepth}</span>
                      <span>|</span>
                      <span>{job.claimedBy || "unclaimed"}</span>
                      <span>|</span>
                      <span>{formatRelativeTime(job.heartbeatAt || job.updatedAt)}</span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[9px] uppercase tracking-wider",
                      statusStyles(job.status),
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", job.status === "running" ? "bg-emerald-400" : job.status === "claimed" ? "bg-cyan-400" : "bg-zinc-500")} />
                    {job.status}
                  </div>
                </div>
                {(job.status === "pending" || job.status === "claimed" || job.status === "running") && (
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => cancelJob(job.id)}
                      disabled={busyJobId === job.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {busyJobId === job.id ? "Canceling" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {visibleJobs.some((job) => job.status === "running") && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-300/80 font-mono">
            <Radar className="w-3.5 h-3.5 animate-pulse" />
            A worker is actively processing a remote job.
          </div>
        )}

        {visibleJobs.length === 0 && loading && (
          <div className="text-[11px] text-zinc-600 font-mono">
            Loading remote jobs...
          </div>
        )}
      </div>
    </div>
  );
}
