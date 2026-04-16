"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Clock, Gauge, Mail, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import type { AutomationOverview, AutomationSequence } from "./types";
import { DAILY_TARGET } from "./types";
import { fmtCountdown, fmtDt, fmtWindow, stageLabel, stateColor, stateLabel } from "./helpers";

/* Transient blockers that don't need human attention */
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

export function OverviewTab({ overview }: { overview: AutomationOverview }) {
  const allSeqs = overview.sequences;
  const queued = useMemo(() => allSeqs.filter((s) => s.state === "QUEUED"), [allSeqs]);
  const sending = useMemo(() => allSeqs.filter((s) => s.state === "SENDING"), [allSeqs]);
  const waiting = useMemo(() => allSeqs.filter((s) => s.state === "WAITING" && s.hasSentAnyStep), [allSeqs]);
  const blocked = useMemo(() => allSeqs.filter((s) => s.state === "BLOCKED"), [allSeqs]);
  const issues = useMemo(() => allSeqs.filter(isRealIssue), [allSeqs]);
  const waitingForWindow = useMemo(() => blocked.filter((s) => TRANSIENT_BLOCKERS.has(s.blockerReason || "")), [blocked]);

  const nextUp = useMemo(() => {
    const active = [...queued, ...sending, ...waiting]
      .filter((s) => s.nextSendAt)
      .sort((a, b) => new Date(a.nextSendAt!).getTime() - new Date(b.nextSendAt!).getTime());
    return active.slice(0, 10);
  }, [queued, sending, waiting]);

  const atCapMailboxes = overview.mailboxes.filter((m) => m.sentToday >= m.dailyLimit);
  const pausedMailboxes = overview.mailboxes.filter((m) => m.status === "PAUSED");
  const hasAttention = issues.length > 0 || atCapMailboxes.length > 0 || pausedMailboxes.length > 0 || overview.settings.globalPaused;

  // Throughput calculations
  const sentToday = overview.stats.scheduledToday;
  const totalMailboxCapacity = overview.mailboxes
    .filter((m) => m.status === "ACTIVE" || m.status === "WARMING")
    .reduce((sum, m) => sum + m.dailyLimit, 0);
  const remainingCapacity = overview.mailboxes
    .filter((m) => m.status === "ACTIVE" || m.status === "WARMING")
    .reduce((sum, m) => sum + Math.max(0, m.dailyLimit - m.sentToday), 0);

  // Pacing
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const ws = overview.settings.sendWindowStartHour + overview.settings.sendWindowStartMinute / 60;
  const we = overview.settings.sendWindowEndHour + overview.settings.sendWindowEndMinute / 60;
  const windowHrs = we - ws;
  const elapsed = Math.max(0, Math.min(h - ws, windowHrs));
  const hoursRemaining = Math.max(0, we - h);
  const emailsPerHour = elapsed > 0 ? (sentToday / elapsed).toFixed(1) : "0";
  const neededPerHour = hoursRemaining > 0 ? ((DAILY_TARGET - sentToday) / hoursRemaining).toFixed(1) : "—";
  const expectedByNow = windowHrs > 0 ? Math.round((elapsed / windowHrs) * DAILY_TARGET) : 0;

  return (
    <div className="space-y-5">
      {/* Throughput dashboard */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "Engine", value: overview.settings.globalPaused ? "Paused" : overview.engine.mode, warn: overview.settings.globalPaused },
          { label: "Sent today", value: `${sentToday} / ${DAILY_TARGET}`, warn: false, highlight: sentToday >= DAILY_TARGET },
          { label: "Emails/hour", value: emailsPerHour, warn: false },
          { label: "Needed/hour", value: neededPerHour, warn: Number(neededPerHour) > 8 },
          { label: "Queue depth", value: `${queued.length + sending.length}`, warn: queued.length + sending.length === 0 && sentToday < DAILY_TARGET },
          { label: "Capacity left", value: `${remainingCapacity}`, warn: remainingCapacity < DAILY_TARGET - sentToday },
          { label: "Issues", value: String(issues.length), warn: issues.length > 0 },
        ].map((item) => (
          <div key={item.label} className="border-r border-b border-white/[0.04] px-4 py-3 last:border-r-0">
            <div className="text-[11px] text-zinc-500">{item.label}</div>
            <div className={`mt-0.5 text-sm font-medium tabular-nums ${
              (item as any).highlight ? "text-emerald-300" : item.warn ? "text-amber-300" : "text-zinc-100"
            }`}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Daily progress bar */}
          <section className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <TrendingUp className="h-3 w-3" /> Daily progress
              </h3>
              <span className="text-xs tabular-nums text-zinc-400">{Math.round((sentToday / DAILY_TARGET) * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  sentToday >= DAILY_TARGET ? "bg-emerald-500"
                  : sentToday >= DAILY_TARGET * 0.6 ? "bg-cyan-500"
                  : sentToday >= DAILY_TARGET * 0.3 ? "bg-blue-500"
                  : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, (sentToday / DAILY_TARGET) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
              <span>0</span>
              <span>{Math.round(DAILY_TARGET * 0.25)}</span>
              <span>{Math.round(DAILY_TARGET * 0.5)}</span>
              <span>{Math.round(DAILY_TARGET * 0.75)}</span>
              <span>{DAILY_TARGET}</span>
            </div>
          </section>

          {/* Sending next */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <Clock className="h-3 w-3" /> Sending next
            </h3>
            {nextUp.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[11px] text-zinc-500">
                      <th className="px-3 py-2 text-left font-medium">Lead</th>
                      <th className="px-3 py-2 text-left font-medium">Stage</th>
                      <th className="px-3 py-2 text-left font-medium">Due</th>
                      <th className="px-3 py-2 text-left font-medium">Mailbox</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {nextUp.map((s) => (
                      <SeqRow key={s.id} seq={s} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : waitingForWindow.length > 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-4 text-sm text-zinc-400">
                <span className="text-zinc-200">{waitingForWindow.length} sequence{waitingForWindow.length !== 1 && "s"}</span> waiting for business hours.
                {overview.engine.nextSendAt && <span> Next send window opens {fmtCountdown(overview.engine.nextSendAt)}.</span>}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-4 py-4 text-sm text-amber-300/80">
                <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                No outreach queued — queue more leads to hit the {DAILY_TARGET}/day target.
                <Link href="/outreach" className="ml-1 underline underline-offset-2 hover:text-amber-200">Open Outreach →</Link>
              </div>
            )}
          </section>

          {/* Recent sends */}
          {overview.recentSent.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Zap className="h-3 w-3" /> Recent sends
              </h3>
              <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] bg-white/[0.015]">
                {overview.recentSent.slice(0, 8).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-white">{e.lead?.businessName || e.recipientEmail}</span>
                      <span className="ml-2 truncate text-xs text-zinc-500">{e.subject}</span>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">{fmtDt(e.sentAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Mailbox health */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <Mail className="h-3 w-3" /> Mailbox health
            </h3>
            {overview.mailboxes.length > 0 ? (
              <div className="space-y-2.5">
                {overview.mailboxes.map((mb) => {
                  const pct = mb.dailyLimit > 0 ? Math.round((mb.sentToday / mb.dailyLimit) * 100) : 0;
                  return (
                    <div key={mb.id}>
                      <div className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <div className="truncate text-zinc-200">{mb.label || mb.gmailAddress.split("@")[0]}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <span className="tabular-nums text-zinc-400">{mb.sentToday}/{mb.dailyLimit}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            mb.status === "ACTIVE" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : mb.status === "PAUSED" ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                            : "border-white/10 bg-white/5 text-zinc-400"
                          }`}>{mb.status}</span>
                        </div>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "bg-emerald-500/60"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1 text-[10px] text-zinc-600">
                  Combined capacity: {totalMailboxCapacity}/day · {remainingCapacity} remaining
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No mailboxes connected.</p>
            )}
          </div>

          {/* Pipeline stages */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <Gauge className="h-3 w-3" /> Pipeline
            </h3>
            <div className="space-y-1.5">
              <PipelineRow label="Needs enrichment" value={overview.pipeline?.needsEnrichment ?? 0} />
              <PipelineRow label="Enriching" value={overview.pipeline?.enriching ?? 0} active />
              <PipelineRow label="Qualified" value={overview.pipeline?.enriched ?? 0} />
              <PipelineRow label="Ready to send" value={overview.pipeline?.readyForTouch ?? 0} />
              <div className="border-t border-white/[0.04] pt-1.5 mt-1.5" />
              <PipelineRow label="Queued (initial)" value={overview.stats.queued} />
              <PipelineRow label="Follow-ups active" value={overview.stats.waiting + overview.stats.sending} />
              <PipelineRow label="Waiting for window" value={waitingForWindow.length} />
              <PipelineRow label="Issues" value={issues.length} warn={issues.length > 0} />
              <div className="border-t border-white/[0.04] pt-1.5 mt-1.5" />
              <PipelineRow label="Completed" value={overview.stats.completed} />
              <PipelineRow label="Replied" value={overview.stats.replied} />
            </div>
            <p className="mt-3 text-[10px] text-zinc-600">Business hours: {fmtWindow(overview.settings)}</p>
          </div>

          {/* Needs attention */}
          {hasAttention && (
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-400/80">
                <AlertTriangle className="h-3 w-3" /> Needs attention
              </h3>
              <ul className="space-y-1.5 text-sm text-zinc-300">
                {overview.settings.globalPaused && <li>• Engine is globally paused</li>}
                {issues.length > 0 && <li>• {issues.length} sequence{issues.length !== 1 && "s"} need review</li>}
                {atCapMailboxes.length > 0 && <li>• {atCapMailboxes.length} mailbox{atCapMailboxes.length !== 1 && "es"} at daily cap</li>}
                {pausedMailboxes.length > 0 && <li>• {pausedMailboxes.length} mailbox{pausedMailboxes.length !== 1 && "es"} paused</li>}
                {sentToday < expectedByNow && sentToday < DAILY_TARGET && (
                  <li className="text-amber-300">• Behind pace by {expectedByNow - sentToday} emails — need {neededPerHour}/hr to catch up</li>
                )}
              </ul>
            </div>
          )}

          {/* Recent runs */}
          {overview.recentRuns.length > 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Recent runs</h3>
              <div className="space-y-1.5">
                {overview.recentRuns.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-baseline justify-between text-xs">
                    <span className="text-zinc-400">{fmtDt(r.startedAt)}</span>
                    <span className="tabular-nums text-zinc-500">{r.sentCount}s {r.failedCount}f {r.skippedCount || 0}sk</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeqRow({ seq }: { seq: AutomationSequence }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-3 py-2">
        <div className="text-sm font-medium text-white">{seq.lead?.businessName || `#${seq.id.slice(0, 6)}`}</div>
        {seq.lead?.email && <div className="text-xs text-zinc-500">{seq.lead.email}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-400">{stageLabel(seq)}</td>
      <td className="px-3 py-2 text-xs text-zinc-300">{fmtCountdown(seq.nextSendAt)}</td>
      <td className="px-3 py-2 text-xs font-mono text-zinc-500">{seq.mailbox?.gmailAddress?.split("@")[0] || "—"}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${stateColor(seq.state)}`}>
          {stateLabel(seq.state)}
        </span>
      </td>
    </tr>
  );
}

function PipelineRow({ label, value, warn, active }: { label: string; value: number; warn?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums font-medium ${warn ? "text-amber-300" : active && value > 0 ? "text-cyan-300" : value > 0 ? "text-zinc-200" : "text-zinc-600"}`}>
        {value}
      </span>
    </div>
  );
}

