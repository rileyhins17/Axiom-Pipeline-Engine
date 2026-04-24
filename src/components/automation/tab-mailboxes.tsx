"use client";

import Link from "next/link";
import { Loader2, Mail, Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtDt, mbStatusColor } from "./helpers";
import { EmptyState, OperatorLabel, Panel, StatCell, StatStrip } from "./shared";
import type { AutomationMailbox } from "./types";

export function MailboxesTab({
  mailboxes,
  busyKey,
  onUpdateMailbox,
}: {
  mailboxes: AutomationMailbox[];
  busyKey: string | null;
  onUpdateMailbox: (id: string, status: string) => Promise<void>;
}) {
  const activeCount = mailboxes.filter((m) => m.status === "ACTIVE").length;
  const pausedCount = mailboxes.filter((m) => m.status === "PAUSED").length;
  const atCapCount = mailboxes.filter((m) => m.sentToday >= m.dailyLimit).length;
  const totalSent = mailboxes.reduce((sum, m) => sum + m.sentToday, 0);

  if (mailboxes.length === 0) {
    return (
      <EmptyState
        title="No mailboxes connected."
        detail="Connect a Gmail sender before automation can schedule outbound mail."
        action={
          <div className="flex gap-3">
            <a
              href="/api/outreach/gmail/connect"
              className="text-sm font-medium text-emerald-300 underline underline-offset-4 hover:text-emerald-200"
            >
              Connect Gmail
            </a>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <StatStrip className="grid-cols-2 md:grid-cols-4">
        <StatCell label="Active" value={activeCount} />
        <StatCell label="Paused" value={pausedCount} tone={pausedCount > 0 ? "warn" : "default"} />
        <StatCell label="At cap" value={atCapCount} tone={atCapCount > 0 ? "warn" : "default"} />
        <StatCell label="Sent today" value={totalSent} emphasis />
      </StatStrip>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" />
            <OperatorLabel>Sender mailboxes</OperatorLabel>
          </div>
          <span className="text-[10px] text-zinc-500">Daily and hourly caps are enforced server-side.</span>
        </div>

        <div className="overflow-x-auto border-t border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2.5 text-left font-medium">Sender</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-left font-medium">Today</th>
                <th className="px-3 py-2.5 text-left font-medium">This hour</th>
                <th className="px-3 py-2.5 text-left font-medium">Next slot</th>
                <th className="px-3 py-2.5 text-left font-medium">Last send</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {mailboxes.map((mb, i) => {
                const pct = mb.dailyLimit > 0 ? Math.min(100, Math.round((mb.sentToday / mb.dailyLimit) * 100)) : 0;
                return (
                  <tr key={mb.id} className="group hover:bg-white/[0.02]">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-white">{mb.label || mb.gmailAddress.split("@")[0]}</span>
                            {i === 0 && mailboxes.length > 1 ? (
                              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-px text-[9px] font-medium text-emerald-300">
                                Next
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate font-mono text-xs text-zinc-500">{mb.gmailAddress}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium", mbStatusColor(mb.status))}>
                        {mb.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[96px]">
                        <div>
                          <span className="tabular-nums text-zinc-200">{mb.sentToday}</span>
                          <span className="text-zinc-600">/{mb.dailyLimit}</span>
                          {mb.sentToday >= mb.dailyLimit ? <span className="ml-1 text-[10px] text-amber-400">cap</span> : null}
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className={cn("h-full rounded-full", pct >= 90 ? "bg-amber-500" : "bg-emerald-500/75")} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="tabular-nums text-zinc-200">{mb.sentThisHour}</span>
                      <span className="text-zinc-600">/{mb.hourlyLimit}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-400">{fmtDt(mb.nextAvailableAt, "Ready")}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500">{fmtDt(mb.lastSentAt, "Never")}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onUpdateMailbox(mb.id, mb.status === "PAUSED" ? "ACTIVE" : "PAUSED")}
                        disabled={busyKey === `mb:${mb.id}`}
                        className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50"
                      >
                        {busyKey === `mb:${mb.id}` ? (
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                        ) : mb.status === "PAUSED" ? (
                          <Play className="mr-1 inline h-3 w-3" />
                        ) : (
                          <Pause className="mr-1 inline h-3 w-3" />
                        )}
                        {mb.status === "PAUSED" ? "Resume" : "Pause"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
