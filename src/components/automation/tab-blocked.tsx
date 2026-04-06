"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Play, Square } from "lucide-react";
import type { AutomationSequence } from "./types";
import { fmtDt, stageLabel } from "./helpers";

export function BlockedTab({
  sequences, busyKey, onUpdateSeq,
}: {
  sequences: AutomationSequence[];
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const blocked = useMemo(
    () => sequences.filter((s) => s.state === "BLOCKED"),
    [sequences],
  );

  const groups = useMemo(() => {
    const m = new Map<string, AutomationSequence[]>();
    for (const s of blocked) {
      const k = s.blockerLabel || "Other";
      m.set(k, [...(m.get(k) || []), s]);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [blocked]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.map(([l]) => l)));

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">No blocked sequences. Everything is clear.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {blocked.length} blocked across {groups.length} reason{groups.length !== 1 && "s"}
      </p>

      {groups.map(([label, seqs]) => (
        <div key={label} className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015]">
          {/* Group header */}
          <button
            onClick={() => toggle(label)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-2">
              {expanded.has(label) ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-300">{seqs.length}</span>
            </div>
          </button>

          {/* Expanded table */}
          {expanded.has(label) && (
            <div className="border-t border-white/[0.04]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.03] text-[11px] text-zinc-600">
                    <th className="px-4 py-1.5 text-left font-medium">Lead</th>
                    <th className="px-3 py-1.5 text-left font-medium">Stage</th>
                    <th className="px-3 py-1.5 text-left font-medium">Detail</th>
                    <th className="px-3 py-1.5 text-left font-medium">Mailbox</th>
                    <th className="px-3 py-1.5 text-left font-medium">Last sent</th>
                    <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {seqs.map((s) => (
                    <tr key={s.id} className="group hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</div>
                        {s.lead?.email && <div className="text-xs text-zinc-500">{s.lead.email}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">{stageLabel(s)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-zinc-400">{s.blockerDetail || s.blockerReason || "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-zinc-500">{s.mailbox?.gmailAddress?.split("@")[0] || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-500">{fmtDt(s.lastSentAt, "Never")}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {s.status === "PAUSED" ? (
                            <ActionBtn icon={Play} busy={busyKey === `resume:${s.id}`} onClick={() => void onUpdateSeq(s.id, "resume")} title="Resume" />
                          ) : (
                            <ActionBtn icon={Square} busy={busyKey === `stop:${s.id}`} onClick={() => void onUpdateSeq(s.id, "stop")} title="Stop" danger />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ActionBtn({ icon: Icon, busy, onClick, title, danger }: { icon: any; busy: boolean; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} title={title}
      className={`rounded p-1 text-zinc-500 transition-colors ${danger ? "hover:bg-red-500/20 hover:text-red-300" : "hover:bg-white/5 hover:text-zinc-300"}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}
