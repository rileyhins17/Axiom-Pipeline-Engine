"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Gauge, Loader2, Mail, Pause, Play, Power, TrendingUp, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { fmtCountdown, fmtDt, fmtWindow, stageLabel, stateColor, stateLabel } from "./helpers";
import { Chip, Divider, EmptyState, Panel, SectionHeader, StatCell, StatStrip, StatusDot } from "./shared";
import type { AutomationOverview, AutomationSequence } from "./types";
import { DAILY_TARGET } from "./types";

const TRANSIENT_BLOCKERS = new Set([
  "outside_send_window",
  "awaiting_follow_up_window",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "global_pause",
]);

function isRealIssue(seq: AutomationSequence) {
  return seq.state === "BLOCKED" && !TRANSIENT_BLOCKERS.has(seq.blockerReason || "");
}

export function OverviewTab({
  overview,
  onSendNow,
  onPause,
  busyKey,
}: {
  overview: AutomationOverview;
  onSendNow: () => void;
  onPause: () => void;
  busyKey: string | null;
}) {
  const allSeqs = overview.sequences;
  const queued = useMemo(() => allSeqs.filter((s) => s.state === "QUEUED"), [allSeqs]);
  const sending = useMemo(() => allSeqs.filter((s) => s.state === "SENDING"), [allSeqs]);
  const waiting = useMemo(() => allSeqs.filter((s) => s.state === "WAITING" && s.hasSentAnyStep), [allSeqs]);
  const blocked = useMemo(() => allSeqs.filter((s) => s.state === "BLOCKED"), [allSeqs]);
  const issues = useMemo(() => allSeqs.filter(isRealIssue), [allSeqs]);
  const waitingForWindow = useMemo(
    () => blocked.filter((s) => TRANSIENT_BLOCKERS.has(s.blockerReason || "")),
    [blocked],
  );

  const nextUp = useMemo(() => {
    const active = [...queued, ...sending, ...waiting]
      .filter((s) => s.nextSendAt)
      .sort((a, b) => new Date(a.nextSendAt!).getTime() - new Date(b.nextSendAt!).getTime());
    return active.slice(0, 10);
  }, [queued, sending, waiting]);

  const atCapMailboxes = overview.mailboxes.filter((m) => m.sentToday >= m.dailyLimit);
  const pausedMailboxes = overview.mailboxes.filter((m) => m.status === "PAUSED");
  const hasAttention =
    issues.length > 0 || atCapMailboxes.length > 0 || pausedMailboxes.length > 0 || overview.settings.globalPaused;

  const sentToday = overview.stats.scheduledToday;
  const activeMbs = overview.mailboxes.filter((m) => m.status === "ACTIVE" || m.status === "WARMUP");
  const totalMailboxCapacity = activeMbs.reduce((s, m) => s + m.dailyLimit, 0);
  const remainingCapacity = activeMbs.reduce((s, m) => s + Math.max(0, m.dailyLimit - m.sentToday), 0);

  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const ws = overview.settings.sendWindowStartHour + overview.settings.sendWindowStartMinute / 60;
  const we = overview.settings.sendWindowEndHour + overview.settings.sendWindowEndMinute / 60;
  const windowHrs = Math.max(we - ws, 0);
  const elapsed = Math.max(0, Math.min(h - ws, windowHrs));
  const hoursRemaining = Math.max(0, we - h);
  const emailsPerHour = elapsed > 0 ? (sentToday / elapsed).toFixed(1) : "0";
  const neededPerHour = hoursRemaining > 0 ? ((DAILY_TARGET - sentToday) / hoursRemaining).toFixed(1) : "-";
  const expectedByNow = windowHrs > 0 ? Math.round((elapsed / windowHrs) * DAILY_TARGET) : 0;

  const stats: {
    label: string;
    value: string | number;
    tone?: "default" | "warn" | "success";
    emphasis?: boolean;
  }[] = [
    {
      label: "Engine",
      value: overview.settings.globalPaused ? "Paused" : overview.engine.mode,
      tone: overview.settings.globalPaused ? "warn" : "default",
    },
    {
      label: "Sent today",
      value: `${sentToday} / ${DAILY_TARGET}`,
      tone: sentToday >= DAILY_TARGET ? "success" : "default",
      emphasis: true,
    },
    { label: "Emails/hour", value: emailsPerHour },
    { label: "Needed/hour", value: neededPerHour, tone: Number(neededPerHour) > 8 ? "warn" : "default" },
    {
      label: "Queue",
      value: `${queued.length + sending.length}`,
      tone: queued.length + sending.length === 0 && sentToday < DAILY_TARGET ? "warn" : "default",
    },
    {
      label: "Capacity left",
      value: `${remainingCapacity}`,
      tone: remainingCapacity < DAILY_TARGET - sentToday ? "warn" : "default",
    },
    { label: "Issues", value: String(issues.length), tone: issues.length > 0 ? "warn" : "default" },
  ];

  return (
    <div className="space-y-5">
      <StatStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
        {stats.map((s) => (
          <StatCell key={s.label} label={s.label} value={s.value} tone={s.tone} emphasis={s.emphasis} />
        ))}
      </StatStrip>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel tone="accent" className="relative overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-emerald-300/40" />
            <SectionHeader
              icon={Power}
              title="Run control"
              tone="accent"
              hint={
                overview.settings.globalPaused
                  ? "Paused. Queue state is preserved; no sends fire."
                  : "Scheduler runs every minute. Use manual run for an immediate pass."
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                onClick={onSendNow}
                disabled={busyKey === "send" || overview.settings.globalPaused}
                className={cn(
                  "h-11 cursor-pointer justify-center gap-2 rounded-lg text-sm font-semibold",
                  "bg-emerald-500 text-emerald-950 hover:bg-emerald-400",
                  "disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-emerald-200/60",
                )}
                aria-label="Send pending emails now"
              >
                {busyKey === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                Send now
              </Button>

              <Button
                onClick={onPause}
                disabled={busyKey === "pause"}
                className={cn(
                  "h-11 cursor-pointer justify-center gap-2 rounded-lg text-sm font-semibold",
                  overview.settings.globalPaused
                    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                    : "border-rose-400/30 bg-rose-500/[0.08] text-rose-200 hover:bg-rose-500/15",
                )}
                aria-label={overview.settings.globalPaused ? "Resume engine" : "Pause engine"}
                variant="outline"
              >
                {busyKey === "pause" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : overview.settings.globalPaused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                {overview.settings.globalPaused ? "Resume" : "Pause"}
              </Button>
            </div>
          </Panel>

          <Panel>
            <SectionHeader
              icon={TrendingUp}
              title="Daily send line"
              action={<span className="text-xs tabular-nums text-zinc-400">{Math.round((sentToday / DAILY_TARGET) * 100)}%</span>}
            />
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  sentToday >= DAILY_TARGET
                    ? "bg-emerald-500"
                    : sentToday >= DAILY_TARGET * 0.6
                    ? "bg-cyan-500"
                    : sentToday >= DAILY_TARGET * 0.3
                    ? "bg-blue-500"
                    : "bg-amber-500",
                )}
                style={{ width: `${Math.min(100, (sentToday / DAILY_TARGET) * 100)}%` }}
                role="progressbar"
                aria-valuenow={sentToday}
                aria-valuemin={0}
                aria-valuemax={DAILY_TARGET}
                aria-label="Daily send progress"
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
              <span>0</span>
              <span>{Math.round(DAILY_TARGET * 0.25)}</span>
              <span>{Math.round(DAILY_TARGET * 0.5)}</span>
              <span>{Math.round(DAILY_TARGET * 0.75)}</span>
              <span>{DAILY_TARGET}</span>
            </div>
          </Panel>

          <Panel className="overflow-hidden p-0">
            <div className="p-5 pb-0">
              <SectionHeader
                icon={Clock}
                title="Sending next"
                hint={nextUp.length > 0 ? `Next ${nextUp.length} scheduled touches.` : undefined}
              />
            </div>

            {nextUp.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-t border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Lead</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">Stage</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">Due</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">Mailbox</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {nextUp.map((s) => <SeqRow key={s.id} seq={s} />)}
                  </tbody>
                </table>
              </div>
            ) : waitingForWindow.length > 0 ? (
              <div className="border-t border-white/[0.06] px-5 py-5 text-sm text-zinc-400">
                <span className="text-zinc-100">{waitingForWindow.length} sequence{waitingForWindow.length !== 1 && "s"}</span>{" "}
                waiting for window or cooldown.
                {overview.engine.nextSendAt ? (
                  <span> Next slot in <span className="text-zinc-200">{fmtCountdown(overview.engine.nextSendAt)}</span>.</span>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No outreach queued."
                detail={`Queue more qualified leads to reach the ${DAILY_TARGET}/day target.`}
                action={
                  <Link className="text-sm font-medium text-emerald-300 underline underline-offset-4 hover:text-emerald-200" href="/outreach">
                    Open outreach
                  </Link>
                }
              />
            )}
          </Panel>

          {overview.recentSent.length > 0 ? (
            <Panel>
              <SectionHeader icon={Zap} title="Recent sends" />
              <ul className="-mx-1 divide-y divide-white/[0.05]">
                {overview.recentSent.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <span className="text-zinc-100">{e.lead?.businessName || e.recipientEmail}</span>
                      <span className="ml-2 truncate text-xs text-zinc-500">{e.subject}</span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500">{fmtDt(e.sentAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionHeader icon={Mail} title="Mailbox health" />
            {overview.mailboxes.length > 0 ? (
              <>
                <ul className="space-y-3">
                  {overview.mailboxes.map((mb) => {
                    const pct = mb.dailyLimit > 0 ? Math.round((mb.sentToday / mb.dailyLimit) * 100) : 0;
                    return (
                      <li key={mb.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-zinc-100">{mb.label || mb.gmailAddress.split("@")[0]}</span>
                          <div className="flex shrink-0 items-center gap-2 text-xs">
                            <span className="tabular-nums text-zinc-400">{mb.sentToday}/{mb.dailyLimit}</span>
                            <Chip tone={mb.status === "ACTIVE" ? "emerald" : mb.status === "PAUSED" ? "amber" : "zinc"}>
                              <StatusDot tone={mb.status === "ACTIVE" ? "emerald" : mb.status === "PAUSED" ? "amber" : "zinc"} />
                              {mb.status}
                            </Chip>
                          </div>
                        </div>
                        <div
                          className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={mb.dailyLimit}
                          aria-valuenow={mb.sentToday}
                          aria-label={`${mb.label || mb.gmailAddress} daily usage`}
                        >
                          <div
                            className={cn("h-full rounded-full transition-[width] duration-500", pct >= 90 ? "bg-amber-500" : "bg-emerald-500/70")}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Divider className="my-4" />
                <p className="text-[11px] text-zinc-500">
                  Capacity {totalMailboxCapacity}/day. <span className="text-zinc-300">{remainingCapacity}</span> remaining.
                </p>
              </>
            ) : (
              <p className="text-xs text-zinc-500">No mailboxes connected.</p>
            )}
          </Panel>

          <Panel>
            <SectionHeader icon={Gauge} title="Pipeline" />
            <div className="space-y-1.5">
              <PipelineRow label="Needs enrichment" value={overview.pipeline?.needsEnrichment ?? 0} />
              <PipelineRow label="Enriching" value={overview.pipeline?.enriching ?? 0} active />
              <PipelineRow
                label="Ready to send"
                value={(overview.pipeline?.enriched ?? 0) + (overview.pipeline?.readyForTouch ?? 0)}
              />
              <Divider className="my-2" />
              <PipelineRow label="Queued initial" value={overview.stats.queued} />
              <PipelineRow label="Active sequences" value={overview.stats.waiting + overview.stats.sending} />
              <PipelineRow label="Waiting for window" value={waitingForWindow.length} />
              <PipelineRow label="Issues" value={issues.length} warn={issues.length > 0} />
              <Divider className="my-2" />
              <PipelineRow label="Completed" value={overview.stats.completed} />
              <PipelineRow label="Replied" value={overview.stats.replied} />
            </div>
            <p className="mt-4 text-[11px] text-zinc-500">Send window: {fmtWindow(overview.settings)}</p>
          </Panel>

          {hasAttention ? (
            <Panel tone="warn">
              <SectionHeader icon={AlertTriangle} title="Attention queue" tone="warn" />
              <ul className="space-y-2 text-sm text-zinc-200">
                {overview.settings.globalPaused ? <AttentionItem>Engine is globally paused.</AttentionItem> : null}
                {issues.length > 0 ? <AttentionItem>{issues.length} sequence{issues.length !== 1 && "s"} need review.</AttentionItem> : null}
                {atCapMailboxes.length > 0 ? <AttentionItem>{atCapMailboxes.length} mailbox{atCapMailboxes.length !== 1 && "es"} at daily cap.</AttentionItem> : null}
                {pausedMailboxes.length > 0 ? <AttentionItem>{pausedMailboxes.length} mailbox{pausedMailboxes.length !== 1 && "es"} paused.</AttentionItem> : null}
                {sentToday < expectedByNow && sentToday < DAILY_TARGET ? (
                  <AttentionItem>Behind pace by {expectedByNow - sentToday}. Need {neededPerHour}/hr.</AttentionItem>
                ) : null}
              </ul>
            </Panel>
          ) : null}

          {overview.recentRuns.length > 0 ? (
            <Panel>
              <SectionHeader title="Run log" />
              <ul className="space-y-1.5">
                {overview.recentRuns.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between text-xs tabular-nums">
                    <span className="text-zinc-400">{fmtDt(r.startedAt)}</span>
                    <span className="text-zinc-500">
                      <span className="text-emerald-300">{r.sentCount}s</span>{" "}
                      <span className="text-rose-300">{r.failedCount}f</span>{" "}
                      <span>{r.skippedCount || 0}sk</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttentionItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
      <span>{children}</span>
    </li>
  );
}

function SeqRow({ seq }: { seq: AutomationSequence }) {
  return (
    <tr className="transition-colors hover:bg-white/[0.02]">
      <td className="px-4 py-2.5">
        <div className="text-sm font-medium text-zinc-100">{seq.lead?.businessName || `#${seq.id.slice(0, 6)}`}</div>
        {seq.lead?.email ? <div className="text-xs text-zinc-500">{seq.lead.email}</div> : null}
      </td>
      <td className="px-3 py-2.5 text-xs text-zinc-400">{stageLabel(seq)}</td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-zinc-200">{fmtCountdown(seq.nextSendAt)}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-zinc-500">{seq.mailbox?.gmailAddress?.split("@")[0] || "-"}</td>
      <td className="px-3 py-2.5">
        <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium", stateColor(seq.state))}>
          {stateLabel(seq.state)}
        </span>
      </td>
    </tr>
  );
}

function PipelineRow({
  label,
  value,
  warn,
  active,
}: {
  label: string;
  value: number;
  warn?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          warn ? "text-amber-300" : active && value > 0 ? "text-cyan-300" : value > 0 ? "text-zinc-100" : "text-zinc-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}
