"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, Clock, MailCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type OpsHealth = {
  status: "healthy" | "warning" | "danger" | "idle";
  lastRunAt: string | null;
  lastRunAgoMinutes: number | null;
  lastRunStatus: string | null;
  lastRunSent: number;
  lastRunFailed: number;
  sentToday: number;
  failedToday: number;
  readyLeads: number;
  queuedSequences: number;
  activeSequences: number;
  warnings?: string[];
};

const TONE: Record<OpsHealth["status"], { dot: string; label: string; color: string }> = {
  healthy: { dot: "healthy", label: "Healthy", color: "text-emerald-300" },
  warning: { dot: "warning", label: "Degraded", color: "text-amber-300" },
  danger: { dot: "danger", label: "Unhealthy", color: "text-rose-300" },
  idle: { dot: "idle", label: "Idle", color: "text-zinc-400" },
};

function relative(mins: number | null): string {
  if (mins === null) return "never";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PulseStrip() {
  const [health, setHealth] = useState<OpsHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ops/health");
        if (!res.ok) return;
        const data = (await res.json()) as OpsHealth;
        if (!cancelled) setHealth(data);
      } catch {
        // silent fallback — strip simply won't populate
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tone = TONE[health?.status ?? "idle"];

  return (
    <Link
      href="/ops"
      className="surface surface-hover group flex items-center justify-between gap-3 px-4 py-2.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="status-dot" data-state={tone.dot} />
          <span className={cn("text-[12px] font-semibold", tone.color)}>{tone.label}</span>
        </div>
        <span className="hidden text-zinc-700 sm:inline">|</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <Stat icon={Clock} label="Last run" value={relative(health?.lastRunAgoMinutes ?? null)} />
          <Stat icon={MailCheck} label="Sent today" value={String(health?.sentToday ?? "—")} tone="success" />
          {health?.failedToday ? (
            <Stat icon={XCircle} label="Failed" value={String(health.failedToday)} tone="danger" />
          ) : null}
          <Stat icon={Activity} label="Queue" value={`${health?.queuedSequences ?? 0} / ${health?.activeSequences ?? 0}`} />
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors group-hover:text-emerald-300">
        Ops
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "danger"
      ? "text-rose-300"
      : "text-zinc-100";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-zinc-600" />
      <span className="text-zinc-500">{label}</span>
      <span className={cn("kpi-value", valueClass)}>{value}</span>
    </span>
  );
}
