"use client";

import { useMemo, useState } from "react";
import { Loader2, Pause, Play, Square } from "lucide-react";
import type { AutomationOverview, AutomationSequence } from "./types";
import { fmtCountdown, fmtDt, stageLabel, stateColor, stateLabel } from "./helpers";

type Filter = "all" | "initial" | "followup" | "blocked" | "paused";

export function QueueTab({
  overview, busyKey, onUpdateSeq,
}: {
  overview: AutomationOverview;
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const allActive = useMemo(() => {
    return overview.sequences.filter(
      (s) => s.state === "QUEUED" || s.state === "SENDING" || s.state === "WAITING" || s.state === "BLOCKED",
    );
  }, [overview.sequences]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "initial": return allActive.filter((s) => !s.hasSentAnyStep);
      case "followup": return allActive.filter((s) => s.hasSentAnyStep);
      case "blocked": return allActive.filter((s) => s.state === "BLOCKED");
      case "paused": return allActive.filter((s) => s.status === "PAUSED");
      default: return allActive;
    }
  }, [allActive, filter]);

  const now = Date.now();
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.nextSendAt ? new Date(a.nextSendAt).getTime() : Infinity;
      const tb = b.nextSendAt ? new Date(b.nextSendAt).getTime() : Infinity;
      return ta - tb;
    });
  }, [filtered]);

  const sendingSoon = sorted.filter((s) => s.nextSendAt && new Date(s.nextSendAt).getTime() <= now + 3600000);
  const laterToday = sorted.filter((s) => {
    if (!s.nextSendAt) return false;
    const t = new Date(s.nextSendAt).getTime();
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    return t > now + 3600000 && t <= eod.getTime();
  });
  const upcoming = sorted.filter((s) => {
    if (!s.nextSendAt) return true;
    const eod = new Date(); eod.setHours(23, 59, 59, 999);
    return new Date(s.nextSendAt).getTime() > eod.getTime();
  });

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: allActive.length },
    { id: "initial", label: "Initial outreach", count: allActive.filter((s) => !s.hasSentAnyStep).length },
    { id: "followup", label: "Follow-ups", count: allActive.filter((s) => s.hasSentAnyStep).length },
    { id: "blocked", label: "Blocked", count: allActive.filter((s) => s.state === "BLOCKED").length },
    { id: "paused", label: "Paused", count: allActive.filter((s) => s.status === "PAUSED").length },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-white/10 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            {f.label}
            {f.count > 0 && <span className="ml-1 tabular-nums text-[10px] opacity-60">{f.count}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">
          {filter === "all" ? "No active outreach in the queue." : `No ${filter} items.`}
        </p>
      ) : (
        <div className="space-y-5">
          {sendingSoon.length > 0 && <QueueSection title="Sending soon" seqs={sendingSoon} busyKey={busyKey} onAction={onUpdateSeq} dot="emerald" />}
          {laterToday.length > 0 && <QueueSection title="Later today" seqs={laterToday} busyKey={busyKey} onAction={onUpdateSeq} dot="blue" />}
          {upcoming.length > 0 && <QueueSection title="Upcoming" seqs={upcoming} busyKey={busyKey} onAction={onUpdateSeq} dot="zinc" />}
        </div>
      )}
    </div>
  );
}

function QueueSection({
  title, seqs, busyKey, onAction, dot,
}: {
  title: string;
  seqs: AutomationSequence[];
  busyKey: string | null;
  onAction: (id: string, action: string) => Promise<void>;
  dot: "emerald" | "blue" | "zinc";
}) {
  const dotCls = dot === "emerald" ? "bg-emerald-400" : dot === "blue" ? "bg-blue-400" : "bg-zinc-500";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
        <span className="text-[10px] tabular-nums text-zinc-600">{seqs.length}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-[11px] text-zinc-500">
              <th className="px-3 py-2 text-left font-medium">Lead</th>
              <th className="px-3 py-2 text-left font-medium">Stage</th>
              <th className="px-3 py-2 text-left font-medium">Due</th>
              <th className="px-3 py-2 text-left font-medium">Mailbox</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {seqs.map((s) => (
              <tr key={s.id} className="group hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">
                  <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</div>
                  {s.lead?.email && <div className="text-xs text-zinc-500">{s.lead.email}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{stageLabel(s)}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-300">{fmtCountdown(s.nextSendAt)}</td>
                <td className="px-3 py-2.5 text-xs font-mono text-zinc-500">{s.mailbox?.gmailAddress?.split("@")[0] || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${stateColor(s.state)}`}>
                    {stateLabel(s.state)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {s.status !== "PAUSED" && s.state !== "STOPPED" && s.state !== "COMPLETED" && (
                      <Btn icon={Pause} busy={busyKey === `pause:${s.id}`} onClick={() => void onAction(s.id, "pause")} title="Pause" />
                    )}
                    {s.status === "PAUSED" && (
                      <Btn icon={Play} busy={busyKey === `resume:${s.id}`} onClick={() => void onAction(s.id, "resume")} title="Resume" />
                    )}
                    {s.state !== "STOPPED" && s.state !== "COMPLETED" && (
                      <Btn icon={Square} busy={busyKey === `stop:${s.id}`} onClick={() => void onAction(s.id, "stop")} title="Stop" danger />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Btn({ icon: Icon, busy, onClick, title, danger }: { icon: any; busy: boolean; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} title={title}
      className={`rounded p-1 text-zinc-500 transition-colors ${danger ? "hover:bg-red-500/20 hover:text-red-300" : "hover:bg-white/5 hover:text-zinc-300"}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}
