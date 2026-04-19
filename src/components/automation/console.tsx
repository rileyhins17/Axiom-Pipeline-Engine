"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { AutomationOverview, TabId } from "./types";
import { DAILY_TARGET } from "./types";
import { fmtCountdown } from "./helpers";
import { OverviewTab } from "./tab-overview";
import { QueueTab } from "./tab-queue";
import { MailboxesTab } from "./tab-mailboxes";
import { IssuesTab } from "./tab-blocked";
import { RulesTab } from "./tab-rules";

export function AutomationConsole({ initialOverview }: { initialOverview: AutomationOverview }) {
  return (
    <ToastProvider>
      <ConsoleInner initialOverview={initialOverview} />
    </ToastProvider>
  );
}

/** Data refresh interval - 30 seconds */
const REFRESH_INTERVAL_MS = 30_000;

function ConsoleInner({ initialOverview }: { initialOverview: AutomationOverview }) {
  const { toast } = useToast();
  const [overview, setOverview] = useState(initialOverview);
  const [tab, setTab] = useState<TabId>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(initialOverview.settings);

  type RunResponse = {
    pipeline?: {
      enriched?: number;
      qualified?: number;
      queued?: number;
    };
    sent?: number;
  };

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/outreach/automation/overview");
      if (r.ok) setOverview(await r.json());
    } catch {}
  }, []);

  useEffect(() => { setSettingsDraft(overview.settings); }, [overview.settings]);

  // Data refresh every 30s
  useEffect(() => {
    const t = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const exec = async <T,>(key: string, fn: () => Promise<Response>) => {
    setBusyKey(key);
    try {
      const res = await fn();
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "Action failed");
      return d as T;
    } catch (e) { toast(e instanceof Error ? e.message : "Action failed", { type: "error", icon: "note" }); return null; }
    finally { setBusyKey(null); }
  };

  const handleRun = async () => {
    const d = await exec<RunResponse>("run", () => fetch("/api/outreach/automation/run", { method: "POST" }));
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
    toast(parts.length > 0 ? parts.join(", ") : "Check complete. Nothing to do", { type: "success", icon: "note" });
    await refresh();
  };

  const handleTogglePause = async () => {
    const next = !overview.settings.globalPaused;
    const d = await exec("pause", () => fetch("/api/outreach/automation/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ globalPaused: next }) }));
    if (d) { toast(next ? "Engine paused" : "Engine resumed", { type: "success", icon: "note" }); await refresh(); }
  };

  const updateSeq = async (id: string, action: string) => {
    const d = await exec(`${action}:${id}`, () => fetch(`/api/outreach/automation/sequences/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));
    if (d) { toast(`Sequence ${action}d`, { type: "success", icon: "note" }); await refresh(); }
  };

  const updateMailbox = async (id: string, status: string) => {
    const d = await exec(`mb:${id}`, () => fetch(`/api/outreach/automation/mailboxes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
    if (d) { toast(status === "PAUSED" ? "Mailbox paused" : "Mailbox resumed", { type: "success", icon: "note" }); await refresh(); }
  };

  const saveSettings = async () => {
    const d = await exec("settings", () => fetch("/api/outreach/automation/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsDraft) }));
    if (d) { toast("Settings saved", { type: "success", icon: "note" }); await refresh(); }
  };

  const engineLabel = overview.settings.globalPaused ? "Paused" : overview.engine.mode;
  const TRANSIENT = new Set(["outside_send_window", "awaiting_follow_up_window", "mailbox_cooldown", "hourly_cap_reached", "global_pause"]);
  const issuesCount = overview.sequences.filter((s) => s.state === "BLOCKED" && !TRANSIENT.has(s.blockerReason || "")).length;
  const queueCount = overview.sequences.filter((s) => s.state !== "STOPPED" && s.state !== "COMPLETED").length;

  const sentToday = overview.stats.scheduledToday;
  const progress = Math.min(sentToday / DAILY_TARGET, 1);
  const isActive = overview.engine.mode === "ACTIVE" && !overview.settings.globalPaused;

  // Pacing calculation: are we on track?
  const now = new Date();
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const windowStart = overview.settings.sendWindowStartHour + overview.settings.sendWindowStartMinute / 60;
  const windowEnd = overview.settings.sendWindowEndHour + overview.settings.sendWindowEndMinute / 60;
  const windowHours = windowEnd - windowStart;
  const elapsedHours = Math.max(0, Math.min(hourOfDay - windowStart, windowHours));
  const expectedByNow = windowHours > 0 ? Math.round((elapsedHours / windowHours) * DAILY_TARGET) : 0;
  const paceStatus = sentToday >= DAILY_TARGET ? "complete" : sentToday >= expectedByNow ? "on-track" : "behind";

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "queue", label: "Queue", count: queueCount },
    { id: "mailboxes", label: "Mailboxes", count: overview.mailboxes.length },
    { id: "blocked", label: "Issues", count: issuesCount },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div>
      {/* ━━━ Header with Daily Target ━━━ */}
      <div className="flex flex-col gap-5 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-5">
          {/* Progress ring */}
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" strokeWidth="5" className="stroke-white/[0.06]" />
              <circle
                cx="40" cy="40" r="34" fill="none" strokeWidth="5"
                strokeDasharray={`${progress * 213.6} 213.6`}
                strokeLinecap="round"
                className={`transition-all duration-700 ${
                  paceStatus === "complete" ? "stroke-emerald-400"
                  : paceStatus === "on-track" ? "stroke-cyan-400"
                  : "stroke-amber-400"
                }`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-white">{sentToday}</span>
              <span className="text-[9px] font-medium text-zinc-500">/{DAILY_TARGET}</span>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Automation</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Outreach engine - {DAILY_TARGET} emails/day target</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${isActive ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                {engineLabel}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                paceStatus === "complete" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : paceStatus === "on-track" ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                : "border-amber-500/25 bg-amber-500/10 text-amber-300"
              }`}>
                {paceStatus === "complete" ? "Target hit" : paceStatus === "on-track" ? "On pace" : `Behind (${expectedByNow - sentToday} gap)`}
              </span>
              <span className="text-xs text-zinc-500">Next: <span className="text-zinc-300">{fmtCountdown(overview.engine.nextSendAt)}</span></span>
              <span className="text-zinc-700">|</span>
              <span className="text-xs text-zinc-500">Cloudflare cron every 5 min</span>
              <span className="text-zinc-700">|</span>
              <span className="text-xs text-zinc-500">reply detection is automatic</span>
              {issuesCount > 0 && <><span className="text-zinc-700">|</span><span className="text-xs text-amber-400/80">{issuesCount} issue{issuesCount !== 1 && "s"}</span></>}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
            <Link href="/outreach">Outreach <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* ━━━ Tab bar ━━━ */}
      <div className="border-b border-white/[0.06]">
        <nav className="-mb-px flex gap-0">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                  tab === t.id ? "bg-white/10 text-white" : "bg-white/5 text-zinc-500"
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ━━━ Tab content ━━━ */}
      <div className="pt-5">
        {tab === "overview" && <OverviewTab overview={overview} onRun={handleRun} onPause={handleTogglePause} busyKey={busyKey} />}
        {tab === "queue" && <QueueTab overview={overview} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "mailboxes" && <MailboxesTab mailboxes={overview.mailboxes} busyKey={busyKey} onUpdateMailbox={updateMailbox} />}
        {tab === "blocked" && <IssuesTab sequences={overview.sequences} busyKey={busyKey} onUpdateSeq={updateSeq} />}
        {tab === "rules" && <RulesTab settings={settingsDraft} onChange={setSettingsDraft} onSave={saveSettings} busyKey={busyKey} />}
      </div>
    </div>
  );
}
