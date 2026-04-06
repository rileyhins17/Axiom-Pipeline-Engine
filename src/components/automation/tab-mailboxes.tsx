"use client";

import Link from "next/link";
import { Loader2, Mail, Pause, Play } from "lucide-react";
import type { AutomationMailbox } from "./types";
import { fmtDt, mbStatusColor } from "./helpers";

export function MailboxesTab({
  mailboxes, busyKey, onUpdateMailbox,
}: {
  mailboxes: AutomationMailbox[];
  busyKey: string | null;
  onUpdateMailbox: (id: string, status: string) => Promise<void>;
}) {
  const activeCount = mailboxes.filter((m) => m.status === "ACTIVE").length;
  const pausedCount = mailboxes.filter((m) => m.status === "PAUSED").length;
  const atCapCount = mailboxes.filter((m) => m.sentToday >= m.dailyLimit).length;

  if (mailboxes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No mailboxes connected. <Link href="/outreach" className="text-zinc-300 underline underline-offset-2 hover:text-white">Connect Gmail →</Link>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact summary strip */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Stat label="Active" value={activeCount} />
        <Stat label="Paused" value={pausedCount} warn={pausedCount > 0} />
        <Stat label="At cap" value={atCapCount} warn={atCapCount > 0} />
        <Stat label="Total" value={mailboxes.length} />
      </div>

      {/* Mailbox table */}
      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-[11px] text-zinc-500">
              <th className="px-3 py-2 text-left font-medium">Sender</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Today</th>
              <th className="px-3 py-2 text-left font-medium">This hour</th>
              <th className="px-3 py-2 text-left font-medium">Next slot</th>
              <th className="px-3 py-2 text-left font-medium">Last send</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {mailboxes.map((mb, i) => (
              <tr key={mb.id} className="group hover:bg-white/[0.02]">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white">{mb.label || mb.gmailAddress.split("@")[0]}</span>
                        {i === 0 && mailboxes.length > 1 && (
                          <span className="rounded border border-emerald-500/20 bg-emerald-500/8 px-1 py-px text-[9px] font-medium text-emerald-300">NEXT</span>
                        )}
                      </div>
                      <div className="truncate font-mono text-xs text-zinc-500">{mb.gmailAddress}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${mbStatusColor(mb.status)}`}>{mb.status}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="tabular-nums text-zinc-200">{mb.sentToday}</span>
                  <span className="text-zinc-600">/{mb.dailyLimit}</span>
                  {mb.sentToday >= mb.dailyLimit && <span className="ml-1 text-[10px] text-amber-400">cap</span>}
                </td>
                <td className="px-3 py-3">
                  <span className="tabular-nums text-zinc-200">{mb.sentThisHour}</span>
                  <span className="text-zinc-600">/{mb.hourlyLimit}</span>
                </td>
                <td className="px-3 py-3 text-xs text-zinc-400">{fmtDt(mb.nextAvailableAt, "Ready")}</td>
                <td className="px-3 py-3 text-xs text-zinc-500">{fmtDt(mb.lastSentAt, "Never")}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => void onUpdateMailbox(mb.id, mb.status === "PAUSED" ? "ACTIVE" : "PAUSED")}
                    disabled={busyKey === `mb:${mb.id}`}
                    className="rounded-md border border-white/8 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-300" : "text-zinc-100"}`}>{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}
