"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Loader2, Pause, Play, Square } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtCountdown, stageLabel, stateColor, stateLabel } from "./helpers";
import { EmptyState, OperatorLabel, Panel, SegmentedControl, StatusDot } from "./shared";
import type { AutomationOverview, AutomationSequence } from "./types";

type Filter = "all" | "initial" | "followup" | "blocked" | "paused";

export function QueueTab({
  overview,
  busyKey,
  onUpdateSeq,
}: {
  overview: AutomationOverview;
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const allActive = useMemo(
    () =>
      overview.sequences.filter(
        (s) => s.state === "QUEUED" || s.state === "SENDING" || s.state === "WAITING" || s.state === "BLOCKED",
      ),
    [overview.sequences],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "initial":
        return allActive.filter((s) => !s.hasSentAnyStep);
      case "followup":
        return allActive.filter((s) => s.hasSentAnyStep);
      case "blocked":
        return allActive.filter((s) => s.state === "BLOCKED");
      case "paused":
        return allActive.filter((s) => s.status === "PAUSED");
      default:
        return allActive;
    }
  }, [allActive, filter]);

  const [now] = useState(() => Date.now());
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = a.nextSendAt ? new Date(a.nextSendAt).getTime() : Infinity;
      const tb = b.nextSendAt ? new Date(b.nextSendAt).getTime() : Infinity;
      return ta - tb;
    });
  }, [filtered]);

  const sendingSoon = sorted.filter((s) => s.nextSendAt && new Date(s.nextSendAt).getTime() <= now + 3_600_000);
  const laterToday = sorted.filter((s) => {
    if (!s.nextSendAt) return false;
    const t = new Date(s.nextSendAt).getTime();
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    return t > now + 3_600_000 && t <= eod.getTime();
  });
  const upcoming = sorted.filter((s) => {
    if (!s.nextSendAt) return true;
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    return new Date(s.nextSendAt).getTime() > eod.getTime();
  });

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: allActive.length },
    { id: "initial", label: "Initial", count: allActive.filter((s) => !s.hasSentAnyStep).length },
    { id: "followup", label: "Follow-ups", count: allActive.filter((s) => s.hasSentAnyStep).length },
    { id: "blocked", label: "Blocked", count: allActive.filter((s) => s.state === "BLOCKED").length },
    { id: "paused", label: "Paused", count: allActive.filter((s) => s.status === "PAUSED").length },
  ];

  return (
    <div className="space-y-4">
      <SegmentedControl items={filters} value={filter} onChange={setFilter} ariaLabel="Queue filters" />

      {filtered.length === 0 ? (
        <EmptyState title={filter === "all" ? "Queue is empty." : `No ${filter} items.`} detail="Automation will pick up qualified leads when they enter the queue." />
      ) : (
        <div className="space-y-5">
          {sendingSoon.length > 0 ? (
            <QueueSection title="Sending soon" seqs={sendingSoon} busyKey={busyKey} onAction={onUpdateSeq} dot="emerald" />
          ) : null}
          {laterToday.length > 0 ? (
            <QueueSection title="Later today" seqs={laterToday} busyKey={busyKey} onAction={onUpdateSeq} dot="blue" />
          ) : null}
          {upcoming.length > 0 ? (
            <QueueSection title="Upcoming" seqs={upcoming} busyKey={busyKey} onAction={onUpdateSeq} dot="zinc" />
          ) : null}
        </div>
      )}
    </div>
  );
}

function QueueSection({
  title,
  seqs,
  busyKey,
  onAction,
  dot,
}: {
  title: string;
  seqs: AutomationSequence[];
  busyKey: string | null;
  onAction: (id: string, action: string) => Promise<void>;
  dot: "emerald" | "blue" | "zinc";
}) {
  const tone: "emerald" | "cyan" | "zinc" = dot === "blue" ? "cyan" : dot;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} />
          <OperatorLabel>{title}</OperatorLabel>
        </div>
        <span className="text-[10px] tabular-nums text-zinc-500">{seqs.length} item{seqs.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto border-t border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5 text-left font-medium">Lead</th>
              <th className="px-3 py-2.5 text-left font-medium">Stage</th>
              <th className="px-3 py-2.5 text-left font-medium">Due</th>
              <th className="px-3 py-2.5 text-left font-medium">Mailbox</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {seqs.map((s) => (
              <tr key={s.id} className="group hover:bg-white/[0.02]">
                <td className="px-3 py-3">
                  <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</div>
                  {s.lead?.email ? <div className="text-xs text-zinc-500">{s.lead.email}</div> : null}
                </td>
                <td className="px-3 py-3 text-xs text-zinc-400">{stageLabel(s)}</td>
                <td className="px-3 py-3 text-xs tabular-nums text-zinc-300">{fmtCountdown(s.nextSendAt)}</td>
                <td className="px-3 py-3 text-xs font-mono text-zinc-500">{s.mailbox?.gmailAddress?.split("@")[0] || "-"}</td>
                <td className="px-3 py-3">
                  <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium", stateColor(s.state))}>
                    {stateLabel(s.state)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    {s.status !== "PAUSED" && s.state !== "STOPPED" && s.state !== "COMPLETED" ? (
                      <ActionButton icon={Pause} busy={busyKey === `pause:${s.id}`} onClick={() => void onAction(s.id, "pause")} title="Pause" />
                    ) : null}
                    {s.status === "PAUSED" ? (
                      <ActionButton icon={Play} busy={busyKey === `resume:${s.id}`} onClick={() => void onAction(s.id, "resume")} title="Resume" />
                    ) : null}
                    {s.state !== "STOPPED" && s.state !== "COMPLETED" ? (
                      <ActionButton icon={Square} busy={busyKey === `stop:${s.id}`} onClick={() => void onAction(s.id, "stop")} title="Stop" danger />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ActionButton({
  icon: Icon,
  busy,
  onClick,
  title,
  danger,
}: {
  icon: ComponentType<{ className?: string }>;
  busy: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={cn(
        "rounded-md p-1.5 text-zinc-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50",
        danger ? "hover:bg-red-500/20 hover:text-red-300" : "hover:bg-white/5 hover:text-zinc-300",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}
