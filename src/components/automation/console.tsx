"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast, ToastProvider } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

import type { AutomationOverview, TabId } from "./types";
import { DAILY_TARGET } from "./types";
import { fmtCountdown } from "./helpers";
import { StatusDot, Chip } from "./shared";

import { OverviewTab } from "./tab-overview";
import { QueueTab } from "./tab-queue";
import { MailboxesTab } from "./tab-mailboxes";
import { IssuesTab } from "./tab-blocked";
import { RulesTab } from "./tab-rules";

/** Data refresh interval. 30s keeps the console fresh without spamming the API. */
const REFRESH_INTERVAL_MS = 30_000;

/** Transient blockers that don't require human attention — system will clear them. */
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
      /* silent — 30s poll retries automatically */
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

  const handleRun = async () => {
    const d = await exec<RunResponse>("run", () =>
      fetch("/api/outreach/automation/run", { method: "POST" }),
    );
    if (!d) return;
    const parts: string[] = [];
    const enriched = d.pipeline?.enriched ?? 0;
    const qualified = d.pipeline?.qualified ?? 0;
    const queued = d.pipeline?.queued ?? 0;
    const sent = d.sent ?? 0;
    if (enriched > 0) parts.push(`${enriched} enriched`);
    if (qualified > 0) parts.push(`${qualified} qualified`);
    if (queued > 0) parts.push(`${queued} queued`);
    if (sent > 0) parts.push(`${sent} sent`);
    toast(parts.length > 0 ? parts.join(", ") : "Check complete — nothing to do.", {
      type: "success",
      icon: "note",
    });
    await refresh();
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
      toast(status === "PAUSED" ? "Mailbox paused" : "Mailbox resumed", {
        type: "success",
        icon: "note",
      });
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
      toast("Settings saved", { type: "success", icon: "note" });
      await refresh();
    }
  };

  // Derived values
  const issuesCount = useMemo(
    () =>
      overview.sequences.filter(
        (s) => s.state === "BLOCKED" && !TRANSIENT_BLOCKERS.has(s.blockerReason || ""),
      ).length,
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
    const windowStart =
      overview.settings.sendWindowStartHour + overview.settings.sendWindowStartMinute / 60;
    const windowEnd =
      overview.settings.sendWindowEndHour + overview.settings.sendWindowEndMinute / 60;
    const windowHours = Math.max(windowEnd - windowStart, 0);
    const elapsedHours = Math.max(0, Math.min(hourOfDay - windowStart, windowHours));
    const expectedByNow =
      windowHours > 0 ? Math.round((elapsedHours / windowHours) * DAILY_TARGET) : 0;
    if (sentToday >= expectedByNow) return "on-track" as const;
    return { kind: "behind" as const, gap: expectedByNow - sentToday };
  }, [overview.settings, sentToday]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "queue", label: "Queue", count: queueCount },
    { id: "mailboxes", label: "Mailboxes", count: overview.mailboxes.length },
    { id: "blocked", label: "Issues", count: issuesCount },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div className="animate-slide-up space-y-6">
      {/* Header */}
      <header className="app-shell-surface flex flex-col gap-5 rounded-[28px] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <ProgressRing progress={progress} sentToday={sentToday} paceStatus={paceStatus} />

          <div className="min-w-0">
            <p className="app-eyebrow">Automation</p>
            <h1 className="app-title mt-2 text-3xl font-semibold">Follow-up engine and mailbox control.</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Outreach engine — target {DAILY_TARGET} emails/day
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <Chip tone={isActive ? "emerald" : "amber"}>
                <StatusDot tone={isActive ? "emerald" : "amber"} pulse={isActive} />
                {overview.settings.globalPaused ? "Paused" : overview.engine.mode}
              </Chip>
              <Chip
                tone={
                  paceStatus === "complete"
                    ? "emerald"
                    : paceStatus === "on-track"
                    ? "cyan"
                    : "amber"
                }
              >
                {paceStatus === "complete"
                  ? "Target hit"
                  : paceStatus === "on-track"
                  ? "On pace"
                  : `Behind by ${paceStatus.gap}`}
              </Chip>
              <span className="text-xs text-zinc-500">
                Next:{" "}
                <span className="font-medium text-zinc-300">
                  {fmtCountdown(overview.engine.nextSendAt)}
                </span>
              </span>
              <span className="hidden text-zinc-700 sm:inline">·</span>
              <span className="hidden text-xs text-zinc-500 sm:inline">
                Runs every minute via Cloudflare cron
              </span>
              {issuesCount > 0 && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="text-xs font-medium text-amber-300">
                    {issuesCount} issue{issuesCount !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
      </header>

      {/* Tab bar — proper ARIA tablist for keyboard users */}
      <TabBar tabs={tabs} activeTab={tab} onSelect={setTab} />

      {/* Tab panel */}
      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="pt-6"
      >
        {tab === "overview" && (
          <OverviewTab
            overview={overview}
            onRun={handleRun}
            onPause={handleTogglePause}
            busyKey={busyKey}
          />
        )}
        {tab === "queue" && (
          <QueueTab overview={overview} busyKey={busyKey} onUpdateSeq={updateSeq} />
        )}
        {tab === "mailboxes" && (
          <MailboxesTab
            mailboxes={overview.mailboxes}
            busyKey={busyKey}
            onUpdateMailbox={updateMailbox}
          />
        )}
        {tab === "blocked" && (
          <IssuesTab sequences={overview.sequences} busyKey={busyKey} onUpdateSeq={updateSeq} />
        )}
        {tab === "rules" && (
          <RulesTab
            settings={settingsDraft}
            onChange={setSettingsDraft}
            onSave={saveSettings}
            busyKey={busyKey}
          />
        )}
      </div>
    </div>
  );
}

/** Daily progress ring. Uses stroke-dashoffset for smoother animation. */
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
    paceStatus === "complete"
      ? "stroke-emerald-400"
      : paceStatus === "on-track"
      ? "stroke-cyan-400"
      : "stroke-amber-400";
  return (
    <div
      className="relative flex h-20 w-20 shrink-0 items-center justify-center"
      role="img"
      aria-label={`${sentToday} of ${DAILY_TARGET} daily emails sent`}
    >
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-white/[0.08]"
        />
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

/** Tab bar with ARIA tablist + left/right keyboard nav. */
function TabBar({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: { id: TabId; label: string; count?: number }[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeTab);
    const next =
      e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    onSelect(tabs[next].id);
    const el = listRef.current?.querySelector<HTMLButtonElement>(`#tab-${tabs[next].id}`);
    el?.focus();
  };

  return (
    <div role="tablist" aria-label="Automation sections" ref={listRef} onKeyDown={onKeyDown}
      className="flex overflow-x-auto border-b border-white/10">
      {tabs.map((t) => {
        const selected = activeTab === t.id;
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
              "relative shrink-0 cursor-pointer px-4 py-2.5 text-sm font-medium transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-0 rounded-t-md",
              selected
                ? "text-white after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:rounded-full after:bg-emerald-400"
                : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            <span>{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
                  selected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-zinc-400",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
