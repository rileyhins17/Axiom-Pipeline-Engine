import { APP_TIME_ZONE_LABEL, formatAppClock, formatAppDateTime } from "@/lib/time";

import type { AutomationSequence, AutomationSettings } from "./types";

export function fmtDt(v: string | Date | null | undefined, fb = "-") {
  return formatAppDateTime(v, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, fb);
}

export function fmtCountdown(v: string | null | undefined) {
  if (!v) return "-";
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return "-";
  const ms = t.getTime() - Date.now();
  if (ms <= 0) return "Now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

export function fmtStep(v: string) {
  switch (v) {
    case "INITIAL":
      return "Initial outreach";
    case "FOLLOW_UP_1":
      return "Follow-up 1";
    case "FOLLOW_UP_2":
      return "Follow-up 2";
    default:
      return v.toLowerCase().replaceAll("_", " ");
  }
}

export function fmtWindow(s: AutomationSettings) {
  return `${formatAppClock(s.sendWindowStartHour, s.sendWindowStartMinute)}-${formatAppClock(
    s.sendWindowEndHour,
    s.sendWindowEndMinute,
  )} ${APP_TIME_ZONE_LABEL}`;
}

export function stageLabel(seq: AutomationSequence) {
  if (!seq.hasSentAnyStep && seq.state === "QUEUED") return "Initial outreach";
  return fmtStep(seq.currentStep);
}

export function stateColor(state: AutomationSequence["state"]) {
  switch (state) {
    case "QUEUED":
      return "text-cyan-300 bg-cyan-500/10 border-cyan-500/20";
    case "SENDING":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    case "WAITING":
      return "text-blue-300 bg-blue-500/10 border-blue-500/20";
    case "BLOCKED":
      return "text-amber-300 bg-amber-500/10 border-amber-500/20";
    case "COMPLETED":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    default:
      return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  }
}

export function stateLabel(state: AutomationSequence["state"]) {
  switch (state) {
    case "QUEUED":
      return "Queued";
    case "SENDING":
      return "Sending";
    case "WAITING":
      return "Waiting";
    case "BLOCKED":
      return "Blocked";
    case "COMPLETED":
      return "Done";
    case "STOPPED":
      return "Stopped";
    default:
      return state;
  }
}

export function mbStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    case "PAUSED":
      return "text-amber-300 bg-amber-500/10 border-amber-500/20";
    case "WARMUP":
      return "text-blue-300 bg-blue-500/10 border-blue-500/20";
    default:
      return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  }
}
