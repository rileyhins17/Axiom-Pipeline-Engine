"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Radar, Server } from "lucide-react";

import { cn } from "@/lib/utils";

export type WorkerHealth = {
  claimedJobId: string | null;
  claimedJobStatus: "pending" | "claimed" | "running" | "completed" | "failed" | "canceled" | null;
  heartbeatAgeSeconds: number | null;
  lastHeartbeatAt: string | null;
  online: boolean;
  workerName: string | null;
};

type WorkerHealthResponse = {
  health: WorkerHealth;
  updatedAt: string;
};

interface WorkerHealthCardProps {
  onHealthChange?: (health: WorkerHealth) => void;
}

function formatRelativeTime(iso: string | null) {
  if (!iso) {
    return "Never";
  }

  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) {
    return "Unknown";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - time.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatHeartbeatAge(seconds: number | null) {
  if (seconds === null) {
    return "No heartbeat yet";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function getStatusCopy(health: WorkerHealth) {
  if (health.online) {
    return {
      badge: "ONLINE",
      badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
      dotClass: "bg-emerald-400",
      helper: "Worker heartbeat healthy",
    };
  }

  if (health.workerName || health.claimedJobId) {
    return {
      badge: "OFFLINE",
      badgeClass: "border-rose-500/20 bg-rose-500/10 text-rose-300",
      dotClass: "bg-rose-400",
      helper: "Last known worker heartbeat is stale",
    };
  }

  return {
    badge: "IDLE",
    badgeClass: "border-zinc-500/20 bg-zinc-500/10 text-zinc-300",
    dotClass: "bg-zinc-500",
    helper: "No worker heartbeat recorded yet",
  };
}

export function WorkerHealthCard({ onHealthChange }: WorkerHealthCardProps) {
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const response = await fetch("/api/scrape/worker-health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as WorkerHealthResponse | null;

        if (!response.ok || !data?.health) {
          throw new Error("Unable to load worker health.");
        }

        if (!alive) {
          return;
        }

        setHealth(data.health);
        onHealthChange?.(data.health);
        setError(null);
      } catch (err) {
        if (!alive) {
          return;
        }

        if ((err as Error).name !== "AbortError") {
          setError("Worker health unavailable");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void load();
    timer = setInterval(() => {
      void load();
    }, 30000);

    return () => {
      alive = false;
      controller.abort();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);

  const copy = useMemo(() => (health ? getStatusCopy(health) : null), [health]);

  return (
    <div className="glass-ultra rounded-xl overflow-hidden border border-white/[0.05]">
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500 animate-gradient" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold tracking-wide">Worker Watch</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {copy?.helper || "Checking worker heartbeat..."}
            </p>
          </div>

          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[9px] uppercase tracking-wider",
              copy?.badgeClass || "border-white/10 bg-white/[0.03] text-zinc-400",
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", copy?.dotClass || "bg-zinc-500")} />
            {loading && !health ? "LOADING" : copy?.badge || "UNKNOWN"}
          </div>
        </div>

        {error && !health ? (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-white/[0.04] bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Worker</div>
              <div className="mt-1 font-mono text-zinc-200 truncate">
                {health?.workerName || "Not claimed"}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.04] bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Heartbeat</div>
              <div className="mt-1 font-mono text-zinc-200 flex items-center gap-2">
                <Clock3 className="w-3.5 h-3.5 text-cyan-400" />
                {formatHeartbeatAge(health?.heartbeatAgeSeconds ?? null)}
                <span className="text-zinc-600">{formatRelativeTime(health?.lastHeartbeatAt ?? null)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.04] bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Active job</div>
              <div className="mt-1 font-mono text-zinc-200 truncate">
                {health?.claimedJobId ? `${health.claimedJobId.slice(0, 8)} | ${health.claimedJobStatus || "unknown"}` : "None"}
              </div>
            </div>
          </div>
        )}

        {health?.online && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-300/80 font-mono">
            <Radar className="w-3.5 h-3.5 animate-pulse" />
            Last heartbeat within the live window.
          </div>
        )}
      </div>
    </div>
  );
}
