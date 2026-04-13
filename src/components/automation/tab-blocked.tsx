"use client";

import { useMemo, useState, type ComponentType } from "react";
import { ChevronDown, ChevronRight, Loader2, Play, Square } from "lucide-react";
import type { AutomationSequence } from "./types";
import { fmtDt, stageLabel } from "./helpers";

/*
 * Transient blockers = system-managed, will auto-resolve. Don't alarm the user.
 * Real issues = need human review or action.
 */
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
  "Reply detected": "Lead replied — sequence auto-stopped. Review the conversation.",
  "Suppressed": "Contact is suppressed from future automated sends.",
  "Paused manually": "You paused this sequence. Resume when ready.",
  "Mailbox disconnected": "Gmail connection lost. Reconnect in Settings.",
  "Mailbox unavailable": "Assigned mailbox is paused or disabled.",
  "No valid email": "Lead is missing a usable email address.",
  "Missing enrichment": "Lead needs enrichment data before sending.",
  "Not automation-ready": "Lead doesn't meet automation qualification rules.",
  "Email generation needs retry": "AI draft failed validation — will retry automatically.",
  "Send failed, retry queued": "Transient send failure — rescheduled for retry.",
  "Daily cap reached": "Mailbox hit its daily sending limit. Resets tomorrow.",
};

export function IssuesTab({
  sequences, busyKey, onUpdateSeq,
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

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.map(([l]) => l)));

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary line */}
      <div className="flex items-baseline gap-4 text-sm">
        <div>
          <span className={`text-lg font-semibold tabular-nums ${issues.length > 0 ? "text-amber-300" : "text-zinc-100"}`}>{issues.length}</span>
          <span className="ml-1.5 text-xs text-zinc-500">{issues.length === 1 ? "issue" : "issues"} needing review</span>
        </div>
        {transient.length > 0 && (
          <div>
            <span className="text-lg font-semibold tabular-nums text-zinc-400">{transient.length}</span>
            <span className="ml-1.5 text-xs text-zinc-500">waiting (auto-resolve)</span>
          </div>
        )}
      </div>

      {/* Issues */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-6 text-center">
          <p className="text-sm text-zinc-400">No issues needing your attention.</p>
          {transient.length > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              {transient.length} sequence{transient.length !== 1 && "s"} are waiting for business hours or cooldowns and will auto-resume.
            </p>
          )}
        </div>
      ) : (
        groups.map(([label, seqs]) => (
          <div key={label} className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.015]">
            <button
              onClick={() => toggle(label)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-2">
                {expanded.has(label) ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
                <span className="text-sm font-medium text-white">{label}</span>
                <span className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-300">{seqs.length}</span>
              </div>
              <span className="max-w-xs truncate text-xs text-zinc-500">{ISSUE_EXPLANATION[label] || "Requires attention."}</span>
            </button>

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
        ))
      )}

      {/* Transient items (collapsed by default, just informational) */}
      {transient.length > 0 && (
        <details className="rounded-lg border border-white/[0.04] bg-white/[0.01]">
          <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-500 hover:text-zinc-400">
            {transient.length} sequence{transient.length !== 1 && "s"} waiting for business hours / cooldowns
          </summary>
          <div className="border-t border-white/[0.03] px-4 py-3">
            <div className="space-y-1.5">
              {transient.slice(0, 10).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{s.lead?.businessName || `#${s.id.slice(0, 6)}`}</span>
                  <span className="text-zinc-500">{s.blockerLabel || s.blockerReason}</span>
                </div>
              ))}
              {transient.length > 10 && <div className="text-xs text-zinc-600">+{transient.length - 10} more</div>}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, busy, onClick, title, danger }: { icon: ComponentType<{ className?: string }>; busy: boolean; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} title={title}
      className={`rounded p-1 text-zinc-500 transition-colors ${danger ? "hover:bg-red-500/20 hover:text-red-300" : "hover:bg-white/5 hover:text-zinc-300"}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}
