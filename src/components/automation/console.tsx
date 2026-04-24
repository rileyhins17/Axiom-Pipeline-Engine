"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, DatabaseZap, Mail, RefreshCw, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

import { fmtCountdown } from "./helpers";
import { Chip, OperatorLabel, StatusDot } from "./shared";
import type { AutomationOverview, TabId } from "./types";
import { DAILY_TARGET } from "./types";

import { IssuesTab } from "./tab-blocked";
import { MailboxesTab } from "./tab-mailboxes";
import { OverviewTab } from "./tab-overview";
import { QueueTab } from "./tab-queue";
import { RulesTab } from "./tab-rules";

const REFRESH_INTERVAL_MS = 30_000;

const TRANSIENT_BLOCKERS = new Set([
  "outside_send_window",
  "awaiting_follow_up_window",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "global_pause",
]);

export function AutomationConsole({ initialOverview }: { initialOverview: AutomationOverview }) {
  return (
    <ToastProvider>
      <ConsoleInner initialOverview={initialOverview} />
    </ToastProvider>
  );
}

function ConsoleInner({ initialOverview }: { initialOverview: AutomationOverview }) {
  const { toast } = useToast();
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<TabId>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(initialOverview.settings);

  type RunResponse = {
    pipeline?: { enriched?: number; qualified?: number; queued?: number };
    sent?: number;
  };

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/outreach/automation/overview");
      if (r.ok) setOverview(await r.json());
    } catch {
      // The 30s poll will retry without interrupting the operator.
    }
  }, []);

  useEffect(() => {
    setSettingsDraft(overview.settings);
  }, [overview.settings]);

  useEffect(() => {
    const t = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const exec = async <T,>(key: string, fn: () => Promise<Response>): Promise<T | null> => {
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

  const handleTogglePause = async () => {
    const next = !overview.settings.globalPaused;
    const d = await exec("pause", () =>
      fetch("/api/outreach/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalPaused: next }),
      }),
    );
    if (d) {
      toast(next ? "Engine paused" : "Engine resumed", { type: "success", icon: "note" });
      await refresh();
    }
  };

  const updateSeq = async (id: string, action: string) => {
    const d = await exec(`${action}:${id}`, () =>
      fetch(`/api/outreach/automation/sequences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    );
    if (d) {
      toast(`Sequence ${action}d`, { type: "success", icon: "note" });
      await refresh();
    }
  };

  const updateMailbox = async (id: string, status: string) => {
    const d = await exec(`mb:${id}`, () =>
      fetch(`/api/outreach/automation/mailboxes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    );
    if (d) {
      toast(status === "PAUSED" ? "Mailbox paused" : "Mailbox resumed", { type: "success", icon: "note" });
      await refresh();
    }
  };

  const saveSettings = async () => {
    const d = await exec("settings", () =>
      fetch("/api/outreach/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      }),
    );
    if (d) {
      toast("Rules saved", { type: "success", icon: "note" });
      await refresh();
    }
  };

  const issuesCount = useMemo(
    () => overview.sequences.filter((s) => s.state === "BLOCKED" && !TRANSIENT_BLOCKERS.has(s.blockerReason || "")).length,
    [overview.sequences],
  );
  const queueCount = useMemo(
    () => overview.sequences.filter((s) => s.state !== "STOPPED" && s.state !== "COMPLETED").length,
    [overview.sequences],
  );

  const sentToday = overview.stats.scheduledToday;
  const progress = Math.min(sentToday / DAILY_TARGET, 1);
  const isActive = overview.engine.mode === "ACTIVE" && !overview.settings.globalPaused;

  const paceStatus = useMemo(() => {
    if (sentToday >= DAILY_TARGET) return "complete" as const;
    const now = new Date();
    const hourOfDay = now.getHours() + now.getMinutes() / 60;
    const windowStart = overview.settings.sendWindowStartHour + overview.settings.sendWindowStartMinute / 60;
    const windowEnd = overview.settings.sendWindowEndHour + overview.settings.sendWindowEndMinute / 60;
    const windowHours = Math.max(windowEnd - windowStart, 0);
    const elapsedHours = Math.max(0, Math.min(hourOfDay - windowStart, windowHours));
    const expectedByNow = windowHours > 0 ? Math.round((elapsedHours / windowHours) * DAILY_TARGET) : 0;
    if (sentToday >= expectedByNow) return "on-track" as const;
    return { kind: "behind" as const, gap: expectedByNow - sentToday };
  }, [overview.settings, sentToday]);

  const tabs: { id: TabId; label: string; count?: number; icon: ComponentType<{ className?: string }> }[] = [
    { id: "overview", label: "Overview", icon: DatabaseZap },
    { id: "queue", label: "Queue", count: queueCount, icon: ArrowRight },
    { id: "mailboxes", label: "Mailboxes", count: overview.mailboxes.length, icon: Mail },
    { id: "blocked", label: "Issues", count: issuesCount, icon: CircleAlert },
    { id: "rules", label: "Rules", icon: Settings2 },
  ];

  return (
    <div className="animate-slide-up space-y-5">
      <header className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-[0_22px_80px_rgba(0,0,0,0.22)]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <ProgressRing progress={progress} sentToday={sentToday} paceStatus={paceStatus} />
              <div className="min-w-0">
                <OperatorLabel className="text-emerald-300">Axiom command center</OperatorLabel>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Automation</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
                  Queue health, sender capacity, issue review, and rules in one operator surface.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="cursor-pointer border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              >
                <Link href="/outreach" aria-label="Open outreach console">
                  Outreach
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
                aria-label="Refresh data"
                className="cursor-pointer border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-white/10 px-5 py-3 text-xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <StatusCell
            label="Engine"
            value={overview.settings.globalPaused ? "Paused" : overview.engine.mode}
            tone={isActive ? "emerald" : "amber"}
            pulse={isActive}
          />
          <StatusCell
            label="Pace"
            value={
              paceStatus === "complete" ? "Target hit" : paceStatus === "on-track" ? "On pace" : `Behind by ${paceStatus.gap}`
            }
            tone={paceStatus === "complete" ? "emerald" : paceStatus === "on-track" ? "cyan" : "amber"}
          />
          <StatusCell label="Next send" value={fmtCountdown(overview.engine.nextSendAt)} tone="zinc" />
          <StatusCell
            label="Issues"
            value={issuesCount > 0 ? `${issuesCount} open` : "Clear"}
            tone={issuesCount > 0 ? "amber" : "emerald"}
          />
        </div>
      </header>

      <TabBar tabs={tabs} activeTab={tab} onSelect={setTab} />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-1">
        {tab === "overview" && <OverviewTab overview={overview} onPause={handleTogglePause} busyKey={busyKey} />}
        {tab === "queue" && <QueueTab overview={overview} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "mailboxes" && (
          <MailboxesTab mailboxes={overview.mailboxes} busyKey={busyKey} onUpdateMailbox={updateMailbox} />
        )}
        {tab === "blocked" && <IssuesTab sequences={overview.sequences} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "rules" && (
          <RulesTab settings={settingsDraft} onChange={setSettingsDraft} onSave={saveSettings} busyKey={busyKey} />
        )}
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "cyan" | "zinc";
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-0 py-2 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <OperatorLabel>{label}</OperatorLabel>
      <Chip tone={tone}>
        <StatusDot tone={tone} pulse={pulse} />
        {value}
      </Chip>
    </div>
  );
}

function ProgressRing({
  progress,
  sentToday,
  paceStatus,
}: {
  progress: number;
  sentToday: number;
  paceStatus: "complete" | "on-track" | { kind: "behind"; gap: number };
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const stroke =
    paceStatus === "complete" ? "stroke-emerald-400" : paceStatus === "on-track" ? "stroke-cyan-400" : "stroke-amber-400";

  return (
    <div
      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20"
      role="img"
      aria-label={`${sentToday} of ${DAILY_TARGET} daily emails sent`}
    >
      <svg viewBox="0 0 80 80" className="h-16 w-16 -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="5" className="stroke-white/[0.08]" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-semibold tabular-nums text-white">{sentToday}</span>
        <span className="mt-0.5 text-[10px] font-medium text-zinc-500">/{DAILY_TARGET}</span>
      </div>
    </div>
  );
}

function TabBar({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: { id: TabId; label: string; count?: number; icon: ComponentType<{ className?: string }> }[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeTab);
    const next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    onSelect(tabs[next].id);
    const el = listRef.current?.querySelector<HTMLButtonElement>(`#tab-${tabs[next].id}`);
    el?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Automation sections"
      ref={listRef}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/55 p-1"
    >
      {tabs.map((t) => {
        const selected = activeTab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            className={cn(
              "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              selected ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{t.label}</span>
            {t.count !== undefined ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                  selected ? "bg-zinc-950/10 text-zinc-700" : "bg-white/[0.06] text-zinc-500",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
