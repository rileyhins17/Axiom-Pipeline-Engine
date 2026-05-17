/**
 * Scheduler State Machine
 *
 * Canonical states, blocker reasons, error classes, and precedence logic
 * for the outreach automation scheduler. Extracted from outreach-automation.ts
 * to make the state machine testable in isolation.
 */

export type AutomationCanonicalState = "QUEUED" | "SENDING" | "WAITING" | "BLOCKED" | "STOPPED" | "COMPLETED";

export type AutomationBlockerReason =
  | "reply_detected"
  | "suppressed"
  | "already_contacted"
  | "duplicate_active_sequence"
  | "manual_pause"
  | "global_pause"
  | "emergency_stop"
  | "mailbox_disconnected"
  | "mailbox_disabled"
  | "missing_valid_email"
  | "missing_enrichment"
  | "policy_ineligible"
  | "outside_send_window"
  | "mailbox_cooldown"
  | "hourly_cap_reached"
  | "daily_cap_reached"
  | "awaiting_follow_up_window"
  | "generation_failed_retryable"
  | "send_failed_retryable"
  | "below_send_min_score"
  | "blocked_segment"
  | "blocked_email_domain"
  | "hard_disqualified"
  | "domain_cooldown_active"
  | "follow_up_daily_cap_reached"
  | "global_daily_cap_reached";

export const AUTOMATION_BLOCKER_REASONS = [
  "reply_detected",
  "suppressed",
  "already_contacted",
  "duplicate_active_sequence",
  "manual_pause",
  "global_pause",
  "emergency_stop",
  "mailbox_disconnected",
  "mailbox_disabled",
  "missing_valid_email",
  "missing_enrichment",
  "policy_ineligible",
  "outside_send_window",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "daily_cap_reached",
  "awaiting_follow_up_window",
  "generation_failed_retryable",
  "send_failed_retryable",
  "below_send_min_score",
  "blocked_segment",
  "blocked_email_domain",
  "hard_disqualified",
  "domain_cooldown_active",
  "follow_up_daily_cap_reached",
  "global_daily_cap_reached",
] as const satisfies readonly AutomationBlockerReason[];

export const ACTIVE_SEQUENCE_STATUSES = ["QUEUED", "ACTIVE", "PAUSED", "SENDING"] as const;
export const CLAIMABLE_SEQUENCE_STATUSES = ["QUEUED", "ACTIVE", "SENDING"] as const;
export const TERMINAL_SEQUENCE_STATUSES = ["STOPPED", "FAILED", "COMPLETED"] as const;
export const MAILBOX_SENDABLE_STATUSES = ["ACTIVE", "WARMING"] as const;
export const OPEN_FIRST_TOUCH_STEP_STATUSES = ["SCHEDULED", "CLAIMED", "SENDING"] as const;

export const BLOCKER_PRECEDENCE: AutomationBlockerReason[] = [
  "reply_detected",
  "suppressed",
  "already_contacted",
  "duplicate_active_sequence",
  "manual_pause",
  "global_pause",
  "emergency_stop",
  "mailbox_disconnected",
  "mailbox_disabled",
  "missing_valid_email",
  "missing_enrichment",
  "policy_ineligible",
  "outside_send_window",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "daily_cap_reached",
  "awaiting_follow_up_window",
  "generation_failed_retryable",
  "send_failed_retryable",
  "below_send_min_score",
  "blocked_segment",
  "blocked_email_domain",
  "hard_disqualified",
  "domain_cooldown_active",
  "follow_up_daily_cap_reached",
  "global_daily_cap_reached",
];

export const TRANSIENT_BLOCKER_REASONS = new Set([
  "mailbox_cooldown",
  "hourly_cap_reached",
  "daily_cap_reached",
  "follow_up_daily_cap_reached",
  "global_daily_cap_reached",
  "outside_send_window",
  "generation_failed_retryable",
  "send_failed_retryable",
  "below_send_min_score",
  "missing_enrichment",
  "mailbox_disconnected",
  "mailbox_disabled",
  "global_pause",
  "emergency_stop",
  "manual_pause",
  "stale_claim_recovered",
  "stale_sender_claim_recovered",
]);

export const REQUEUEABLE_STALE_STOP_REASONS = new Set([
  "below_send_min_score",
  "generation_failed_retryable",
  "send_failed_retryable",
  "stale_sender_claim_recovered",
  "stale_claim_recovered",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "daily_cap_reached",
  "follow_up_daily_cap_reached",
  "global_daily_cap_reached",
  "domain_cooldown_active",
]);

export class AutomationSkipError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

export class AutomationRetryableSendError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

export class AutomationStoppedError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

export function normalizeBlockerReason(value: string | null | undefined): AutomationBlockerReason | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");
  return AUTOMATION_BLOCKER_REASONS.includes(normalized as AutomationBlockerReason)
    ? (normalized as AutomationBlockerReason)
    : null;
}

export function getPrimaryBlocker(blockers: AutomationBlockerReason[]) {
  if (blockers.length === 0) return null;
  const deduped = Array.from(new Set(blockers));
  deduped.sort((a, b) => {
    const aIndex = BLOCKER_PRECEDENCE.indexOf(a);
    const bIndex = BLOCKER_PRECEDENCE.indexOf(b);
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  return deduped[0] || null;
}

export function isTerminalSendBlocker(reason: AutomationBlockerReason) {
  return (
    reason === "missing_valid_email" ||
    reason === "policy_ineligible" ||
    reason === "blocked_segment" ||
    reason === "blocked_email_domain" ||
    reason === "hard_disqualified" ||
    reason === "suppressed" ||
    reason === "already_contacted" ||
    reason === "duplicate_active_sequence"
  );
}

export function getBlockerMeta(reason: AutomationBlockerReason) {
  switch (reason) {
    case "reply_detected":
      return { label: "Reply detected", detail: "A reply was found in the thread, so future sends are stopped." };
    case "suppressed":
      return { label: "Suppressed", detail: "This contact is suppressed from future automated sends." };
    case "already_contacted":
      return { label: "Already contacted", detail: "This lead already has another sent email, so automation will not send another sequence." };
    case "duplicate_active_sequence":
      return { label: "Duplicate sequence", detail: "Another active automation sequence already owns this lead." };
    case "manual_pause":
      return { label: "Paused manually", detail: "This sequence is paused until you resume it." };
    case "global_pause":
      return { label: "Global pause is on", detail: "Automation is paused for every sequence right now." };
    case "emergency_stop":
      return { label: "Emergency stop active", detail: "A manual emergency stop is engaged across the automation engine." };
    case "mailbox_disconnected":
      return { label: "Mailbox disconnected", detail: "The assigned mailbox needs attention before this sequence can continue." };
    case "mailbox_disabled":
      return { label: "Mailbox unavailable", detail: "The assigned mailbox is paused or disabled." };
    case "missing_valid_email":
      return { label: "No valid email", detail: "This lead does not have a vetted pipeline-usable email." };
    case "missing_enrichment":
      return { label: "Missing enrichment", detail: "This lead needs enrichment before automation can send." };
    case "policy_ineligible":
      return { label: "Not automation-ready", detail: "This lead no longer meets the automation qualification rules." };
    case "outside_send_window":
      return { label: "Outside send window", detail: "The mailbox is waiting for the next business-hour send window." };
    case "mailbox_cooldown":
      return { label: "Mailbox cooldown", detail: "The mailbox minimum delay has not elapsed yet." };
    case "hourly_cap_reached":
      return { label: "Hourly cap reached", detail: "The mailbox has no hourly capacity left right now." };
    case "daily_cap_reached":
      return { label: "Daily cap reached", detail: "The mailbox has no daily capacity left today." };
    case "awaiting_follow_up_window":
      return { label: "Waiting for follow-up", detail: "The next follow-up is scheduled for a later business-day window." };
    case "generation_failed_retryable":
      return { label: "Email generation needs retry", detail: "The last email draft failed validation and is waiting for retry or manual review." };
    case "send_failed_retryable":
      return { label: "Send failed, retry queued", detail: "A transient send failure occurred and the step was rescheduled." };
    case "below_send_min_score":
      return { label: "Below adequate score", detail: "This lead is below the adequate-lead threshold for automated email." };
    case "blocked_segment":
      return { label: "Blocked segment", detail: "This business is in a segment that automation is not allowed to email." };
    case "blocked_email_domain":
      return { label: "Blocked email domain", detail: "This contact uses an email domain that automation is not allowed to email." };
    case "hard_disqualified":
      return { label: "Hard disqualified", detail: "This lead matched a hard disqualification rule." };
    case "domain_cooldown_active":
      return { label: "Domain cooldown", detail: "Another contact at this domain was recently emailed." };
    case "follow_up_daily_cap_reached":
      return { label: "Follow-up cap reached", detail: "Today's follow-up send budget is used, reserving remaining capacity for new initial outreach." };
    case "global_daily_cap_reached":
      return { label: "Daily send cap reached", detail: "The global daily automation send cap has been reached." };
  }
}

export function classifySendFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    message.includes("unauthorized") ||
    message.includes("invalid_grant") ||
    message.includes("refresh token") ||
    message.includes("gmail connection is missing")
  ) {
    return { kind: "blocked" as const, reason: "mailbox_disconnected" as AutomationBlockerReason };
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return { kind: "rate_limited" as const, reason: "mailbox_cooldown" as AutomationBlockerReason };
  }

  if (
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("temporar") ||
    message.includes("network")
  ) {
    return { kind: "retryable" as const, reason: "send_failed_retryable" as AutomationBlockerReason };
  }

  if (message.includes("suppressed")) {
    return { kind: "stopped" as const, reason: "suppressed" as AutomationBlockerReason };
  }

  if (message.includes("recipient") || message.includes("invalid to")) {
    return { kind: "stopped" as const, reason: "policy_ineligible" as AutomationBlockerReason };
  }

  return { kind: "retryable" as const, reason: "send_failed_retryable" as AutomationBlockerReason };
}
