"use client";

import { useMemo, useState, type ComponentType } from "react";
import { ChevronDown, ChevronRight, Loader2, Play, Square } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtDt, stageLabel } from "./helpers";
import { EmptyState, OperatorLabel, Panel, StatCell, StatStrip } from "./shared";
import type { AutomationSequence } from "./types";

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

function isTransient(seq: AutomationSequence) {
  return seq.state === "BLOCKED" && TRANSIENT_BLOCKERS.has(seq.blockerReason || "");
}

const ISSUE_EXPLANATION: Record<string, string> = {
  "Reply detected": "Lead replied. Review the conversation.",
  "Suppressed": "Contact is suppressed from future automated sends.",
  "Paused manually": "Paused by an operator. Resume when ready.",
  "Mailbox disconnected": "Gmail connection is unavailable.",
  "Mailbox unavailable": "Assigned mailbox is paused or disabled.",
  "No valid email": "Lead is missing a usable email address.",
  "Missing enrichment": "Lead needs enrichment data before sending.",
  "Not automation-ready": "Lead does not meet automation rules.",
  "Email generation needs retry": "Draft failed validation. Retry is queued.",
  "Send failed, retry queued": "Transient send failure. Retry is queued.",
  "Daily cap reached": "Mailbox hit its daily sending limit.",
};

export function IssuesTab({
  sequences,
  busyKey,
  onUpdateSeq,
}: {
  sequences: AutomationSequence[];
  busyKey: string | null;
  onUpdateSeq: (id: string, action: string) => Promise<void>;
}) {
  const issues = useMemo(() => sequences.filter(isRealIssue), [sequences]);
  const transient = useMemo(() => sequences.filter(isTransient), [sequences]);

  const groups = useMemo(() => {
    const m = new Map<string, AutomationSequence[]>();
    for (const s of issues) {
      const k = s.blockerLabel || "Other";
      m.set(k, [...(m.get(k) || []), s]);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [issues]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <StatStrip className="grid-cols-2 md:grid-cols-3">
        <StatCell label="Needs review" value={issues.length} tone={issues.length > 0 ? "warn" : "default"} emphasis />
        <StatCell label="Auto-waiting" value={transient.length} />
        <StatCell label="Groups" value={groups.length} />
      </StatStrip>

      {groups.length === 0 ? (
        <EmptyState
          title="No issues need review."
          detail={
            transient.length > 0
              ? `${transient.length} sequence${transient.length !== 1 ? "s are" : " is"} waiting for send windows or cooldowns.`
              : "Automation has no active blockers."
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map(([label, seqs]) => (
            <Panel key={label} className="overflow-hidden p-0" tone="warn">
              <button
                type="button"
                onClick={() => toggle(label)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {!collapsed.has(label) ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  )}
                  <span className="truncate text-sm font-medium text-white">{label}</span>
                  <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-300">
                    {seqs.length}
                  </span>
                </div>
                <span className="hidden max-w-sm truncate text-xs text-zinc-500 md:block">
                  {ISSUE_EXPLANATION[label] || "Requires attention."}
                </span>
              </button>

              {!collapsed.has(label) ? (
                <div className="overflow-x-auto border-t border-white/[0.06]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-2.5 text-left font-medium">Lead</th>
                        <th className="px-3 py-2.5 text-left font-medium">Stage</th>
                        <th className="px-3 py-2.5 text-left font-medium">Detail</th>
                        <th className="px-3 py-2.5 text-left font-medium">Mailbox</th>
                        <th className="px-3 py-2.5 text-left font-medium">Last sent</th>
                        <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {seqs.map((s) => (
                        <tr key={s.id} className="group hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-white">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</div>
                            {s.lead?.email ? <div className="text-xs text-zinc-500">{s.lead.email}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-xs text-zinc-400">{stageLabel(s)}</td>
                          <td className="max-w-[240px] truncate px-3 py-3 text-xs text-zinc-400">{s.blockerDetail || s.blockerReason || "-"}</td>
                          <td className="px-3 py-3 text-xs font-mono text-zinc-500">{s.mailbox?.gmailAddress?.split("@")[0] || "-"}</td>
                          <td className="px-3 py-3 text-xs text-zinc-500">{fmtDt(s.lastSentAt, "Never")}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                              {s.status === "PAUSED" ? (
                                <ActionButton icon={Play} busy={busyKey === `resume:${s.id}`} onClick={() => void onUpdateSeq(s.id, "resume")} title="Resume" />
                              ) : (
                                <ActionButton icon={Square} busy={busyKey === `stop:${s.id}`} onClick={() => void onUpdateSeq(s.id, "stop")} title="Stop" danger />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      )}

      {transient.length > 0 ? (
        <Panel className="p-0">
          <details>
            <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-500 hover:text-zinc-400">
              {transient.length} sequence{transient.length !== 1 && "s"} waiting for windows or cooldowns
            </summary>
            <div className="border-t border-white/[0.06] px-4 py-3">
              <div className="mb-2">
                <OperatorLabel>Auto-resolving</OperatorLabel>
              </div>
              <div className="space-y-1.5">
                {transient.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 text-xs">
                    <span className="min-w-0 truncate text-zinc-400">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</span>
                    <span className="shrink-0 text-zinc-500">{s.blockerLabel || s.blockerReason}</span>
                  </div>
                ))}
                {transient.length > 10 ? <div className="text-xs text-zinc-600">+{transient.length - 10} more</div> : null}
              </div>
            </div>
          </details>
        </Panel>
      ) : null}
    </div>
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
