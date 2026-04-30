import {
  generateSequenceStepEmail,
  type OutreachSequenceStepType,
} from "@/lib/outreach-email-generator";
import { getValidAccessToken, getGmailThreadMetadata, normalizeGmailAddress, sendGmailEmail } from "@/lib/gmail";
import {
  AUTOMATION_SETTINGS_DEFAULTS,
  AUTONOMOUS_SEND_MIN_SCORE,
  isAdequateAutonomousLead,
  isHardDisqualified,
  MAILBOX_DAILY_SEND_TARGET,
  MAILBOX_HOURLY_SEND_TARGET,
  MAILBOX_MAX_DELAY_SECONDS,
  MAILBOX_MIN_DELAY_SECONDS,
} from "@/lib/automation-policy";
import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { resolveLeadEnrichment } from "@/lib/outreach-enrichment";
import { getPrisma } from "@/lib/prisma";
import { READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import type {
  GmailConnectionRecord,
  LeadRecord,
  OutreachAutomationSettingRecord,
  OutreachEmailRecord,
  OutreachMailboxRecord,
  OutreachRunRecord,
  OutreachSequenceRecord,
  OutreachSequenceStepRecord,
  OutreachSuppressionRecord,
} from "@/lib/prisma";

type PrismaLike = ReturnType<typeof getPrisma>;

export type OutreachSequenceConfig = {
  timezone: string;
  weekdaysOnly: boolean;
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  initialDelayMinMinutes: number;
  initialDelayMaxMinutes: number;
  followUp1BusinessDays: number;
  followUp2BusinessDays: number;
  schedulerClaimBatch: number;
  replySyncStaleMinutes: number;
  leadSnapshot: {
    id: number;
    businessName: string;
    city: string;
    niche: string;
    email: string;
    contactName: string | null;
    websiteStatus: string | null;
    axiomScore: number | null;
    axiomTier: string | null;
  };
  enrichmentSnapshot: unknown;
};

export type MailboxAllocationResult = {
  mailbox: OutreachMailboxRecord;
  reason: "least-loaded";
};

export type ReplyDetectionResult = {
  detected: boolean;
  inboundMessageId?: string;
  inboundFrom?: string;
  threadId?: string;
};

export type SchedulerClaim = {
  sequence: OutreachSequenceRecord;
  step: OutreachSequenceStepRecord;
  mailbox: OutreachMailboxRecord;
};

export type StepGenerationContext = {
  lead: LeadRecord;
  mailbox: OutreachMailboxRecord;
  previousStep?: OutreachSequenceStepRecord | null;
  sequence: OutreachSequenceRecord;
  step: OutreachSequenceStepRecord;
};

export type QueueAutomationResult = {
  queued: Array<{ leadId: number; sequenceId: string; mailboxId: string }>;
  skipped: Array<{ leadId: number; reason: string }>;
};

export type OutreachSequenceSummary = OutreachSequenceRecord & {
  lead?: LeadRecord | null;
  mailbox?: OutreachMailboxRecord | null;
  nextStep?: OutreachSequenceStepRecord | null;
};

export type AutomationOverview = {
  settings: OutreachAutomationSettingRecord;
  ready: LeadRecord[];
  mailboxes: Array<OutreachMailboxRecord & { sentToday: number; sentThisHour: number }>;
  sequences: Array<
    OutreachSequenceSummary & {
      state: AutomationCanonicalState;
      blockerReason: string | null;
      blockerLabel: string | null;
      blockerDetail: string | null;
      nextSendAt: Date | null;
      hasSentAnyStep: boolean;
      secondaryBlockers: string[];
    }
  >;
  queued: Array<
    OutreachSequenceSummary & {
      state: AutomationCanonicalState;
      blockerReason: string | null;
      blockerLabel: string | null;
      blockerDetail: string | null;
      nextSendAt: Date | null;
      hasSentAnyStep: boolean;
      secondaryBlockers: string[];
    }
  >;
  active: Array<
    OutreachSequenceSummary & {
      state: AutomationCanonicalState;
      blockerReason: string | null;
      blockerLabel: string | null;
      blockerDetail: string | null;
      nextSendAt: Date | null;
      hasSentAnyStep: boolean;
      secondaryBlockers: string[];
    }
  >;
  finished: Array<
    OutreachSequenceSummary & {
      state: AutomationCanonicalState;
      blockerReason: string | null;
      blockerLabel: string | null;
      blockerDetail: string | null;
      nextSendAt: Date | null;
      hasSentAnyStep: boolean;
      secondaryBlockers: string[];
    }
  >;
  recentSent: Array<{
    id: string;
    sentAt: Date;
    subject: string;
    senderEmail: string;
    recipientEmail: string;
    sequenceId: string | null;
    lead?: LeadRecord | null;
  }>;
  engine: {
    mode: "ACTIVE" | "PAUSED" | "DISABLED";
    nextSendAt: Date | null;
    scheduledToday: number;
    blockedCount: number;
    replyStoppedCount: number;
    readyCount: number;
    queuedCount: number;
    waitingCount: number;
    sendingCount: number;
  };
  pipeline: {
    needsEnrichment: number;
    enriching: number;
    enriched: number;
    readyForTouch: number;
  };
  recentRuns: OutreachRunRecord[];
  stats: {
    ready: number;
    queued: number;
    sending: number;
    waiting: number;
    blocked: number;
    active: number;
    paused: number;
    stopped: number;
    completed: number;
    replied: number;
    scheduledToday: number;
  };
};

type AutomationCanonicalState = "QUEUED" | "SENDING" | "WAITING" | "BLOCKED" | "STOPPED" | "COMPLETED";

type AutomationBlockerReason =
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
  | "global_daily_cap_reached";

const AUTOMATION_BLOCKER_REASONS = [
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
  "global_daily_cap_reached",
] as const satisfies readonly AutomationBlockerReason[];

const ACTIVE_SEQUENCE_STATUSES = ["QUEUED", "ACTIVE", "PAUSED", "SENDING"] as const;
const CLAIMABLE_SEQUENCE_STATUSES = ["QUEUED", "ACTIVE", "SENDING"] as const;
const TERMINAL_SEQUENCE_STATUSES = ["STOPPED", "FAILED", "COMPLETED"] as const;
const MAILBOX_SENDABLE_STATUSES = ["ACTIVE", "WARMING"] as const;
const D1_IN_CLAUSE_CHUNK_SIZE = 40;
const REQUEUEABLE_STALE_STOP_REASONS = new Set([
  "below_send_min_score",
  "generation_failed_retryable",
  "send_failed_retryable",
  "stale_sender_claim_recovered",
  "stale_claim_recovered",
  "mailbox_cooldown",
  "hourly_cap_reached",
  "daily_cap_reached",
  "global_daily_cap_reached",
  "domain_cooldown_active",
]);

function normalizeEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

const SHARED_EMAIL_PROVIDER_EXACT_DOMAINS = new Set([
  "aol.com",
  "fastmail.com",
  "gmail.com",
  "googlemail.com",
  "hey.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "tutanota.com",
  "yahoo.com",
  "ymail.com",
  "zoho.com",
]);

const SHARED_EMAIL_PROVIDER_PREFIXES = [
  "aol.",
  "hotmail.",
  "live.",
  "outlook.",
  "rocketmail.",
  "yahoo.",
];

const NON_BUSINESS_DOMAIN_EXACTS = new Set([
  "facebook.com",
  "google.com",
  "instagram.com",
  "linktr.ee",
  "linkedin.com",
  "maps.google.com",
  "tiktok.com",
  "x.com",
]);

function normalizeDomain(domain: string | null | undefined) {
  const raw = (domain || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function isSharedEmailProviderDomain(domain: string | null | undefined) {
  const normalized = normalizeDomain(domain);
  return (
    SHARED_EMAIL_PROVIDER_EXACT_DOMAINS.has(normalized) ||
    SHARED_EMAIL_PROVIDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function isNonBusinessDomain(domain: string | null | undefined) {
  const normalized = normalizeDomain(domain);
  return !normalized || NON_BUSINESS_DOMAIN_EXACTS.has(normalized) || isSharedEmailProviderDomain(normalized);
}

function getAutomationBusinessDomain(lead: Pick<LeadRecord, "websiteDomain" | "email"> | null | undefined) {
  const websiteDomain = normalizeDomain(lead?.websiteDomain);
  if (websiteDomain && !isNonBusinessDomain(websiteDomain)) {
    return websiteDomain;
  }

  const emailDomain = normalizeDomain(getDomainFromEmail(lead?.email));
  return emailDomain && !isSharedEmailProviderDomain(emailDomain) ? emailDomain : "";
}

function chunkArray<T>(values: T[], size = D1_IN_CLAUSE_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get("year") || "0"),
    month: Number(map.get("month") || "1"),
    day: Number(map.get("day") || "1"),
    hour: Number(map.get("hour") || "0"),
    minute: Number(map.get("minute") || "0"),
    second: Number(map.get("second") || "0"),
    weekday: map.get("weekday") || "Mon",
  };
}

function setMinutesInTimezone(base: Date, timeZone: string, targetHour: number, targetMinute: number) {
  const local = getLocalDateParts(base, timeZone);
  // Create a naive UTC guess using the target hour/minute
  const utcGuess = Date.UTC(local.year, local.month - 1, local.day, targetHour, targetMinute, 0);
  const guessDate = new Date(utcGuess);
  // Check what local time this UTC value actually maps to in the target timezone
  const guessLocal = getLocalDateParts(guessDate, timeZone);
  // Compute the minute-level offset between desired and actual local time
  const offsetMs =
    ((targetHour - guessLocal.hour) * 60 + (targetMinute - guessLocal.minute)) * 60 * 1000;
  return new Date(utcGuess + offsetMs);
}

function getRandomInt(min: number, max: number) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function startOfNextUtcDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/**
 * Add N days to a date. When weekdaysOnly is true, skip Saturday/Sunday in
 * the given timezone so follow-ups don't land on a weekend. When false, this
 * is just calendar-day addition (correct for 24/7 operation).
 */
function addDaysRespectingWeekdays(
  date: Date,
  days: number,
  timeZone: string,
  weekdaysOnly: boolean,
) {
  if (!weekdaysOnly) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }
  let remaining = days;
  let cursor = new Date(date);
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const parts = getLocalDateParts(cursor, timeZone);
    const dow = parts.weekday; // "Mon".."Sun"
    if (dow !== "Sat" && dow !== "Sun") remaining -= 1;
  }
  return cursor;
}

function startOfHour(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(0, 0, 0);
  return copy;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function coerceDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeBlockerReason(value: string | null | undefined): AutomationBlockerReason | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");
  return AUTOMATION_BLOCKER_REASONS.includes(normalized as AutomationBlockerReason)
    ? (normalized as AutomationBlockerReason)
    : null;
}

function getBlockerMeta(reason: AutomationBlockerReason) {
  switch (reason) {
    case "reply_detected":
      return {
        label: "Reply detected",
        detail: "A reply was found in the thread, so future sends are stopped.",
      };
    case "suppressed":
      return {
        label: "Suppressed",
        detail: "This contact is suppressed from future automated sends.",
      };
    case "already_contacted":
      return {
        label: "Already contacted",
        detail: "This lead already has another sent email, so automation will not send another sequence.",
      };
    case "duplicate_active_sequence":
      return {
        label: "Duplicate sequence",
        detail: "Another active automation sequence already owns this lead.",
      };
    case "manual_pause":
      return {
        label: "Paused manually",
        detail: "This sequence is paused until you resume it.",
      };
    case "global_pause":
      return {
        label: "Global pause is on",
        detail: "Automation is paused for every sequence right now.",
      };
    case "emergency_stop":
      return {
        label: "Emergency stop active",
        detail: "A manual emergency stop is engaged across the automation engine.",
      };
    case "mailbox_disconnected":
      return {
        label: "Mailbox disconnected",
        detail: "The assigned mailbox needs attention before this sequence can continue.",
      };
    case "mailbox_disabled":
      return {
        label: "Mailbox unavailable",
        detail: "The assigned mailbox is paused or disabled.",
      };
    case "missing_valid_email":
      return {
        label: "No valid email",
        detail: "This lead does not have a vetted pipeline-usable email.",
      };
    case "missing_enrichment":
      return {
        label: "Missing enrichment",
        detail: "This lead needs enrichment before automation can send.",
      };
    case "policy_ineligible":
      return {
        label: "Not automation-ready",
        detail: "This lead no longer meets the automation qualification rules.",
      };
    case "outside_send_window":
      return {
        label: "Outside send window",
        detail: "The mailbox is waiting for the next business-hour send window.",
      };
    case "mailbox_cooldown":
      return {
        label: "Mailbox cooldown",
        detail: "The mailbox minimum delay has not elapsed yet.",
      };
    case "hourly_cap_reached":
      return {
        label: "Hourly cap reached",
        detail: "The mailbox has no hourly capacity left right now.",
      };
    case "daily_cap_reached":
      return {
        label: "Daily cap reached",
        detail: "The mailbox has no daily capacity left today.",
      };
    case "awaiting_follow_up_window":
      return {
        label: "Waiting for follow-up",
        detail: "The next follow-up is scheduled for a later business-day window.",
      };
    case "generation_failed_retryable":
      return {
        label: "Email generation needs retry",
        detail: "The last email draft failed validation and is waiting for retry or manual review.",
      };
    case "send_failed_retryable":
      return {
        label: "Send failed, retry queued",
        detail: "A transient send failure occurred and the step was rescheduled.",
      };
    case "below_send_min_score":
      return {
        label: "Below adequate score",
        detail: "This lead is below the adequate-lead threshold for automated email.",
      };
    case "blocked_segment":
      return {
        label: "Blocked segment",
        detail: "This business is in a segment that automation is not allowed to email.",
      };
    case "blocked_email_domain":
      return {
        label: "Blocked email domain",
        detail: "This contact uses an email domain that automation is not allowed to email.",
      };
    case "hard_disqualified":
      return {
        label: "Hard disqualified",
        detail: "This lead matched a hard disqualification rule.",
      };
    case "domain_cooldown_active":
      return {
        label: "Domain cooldown",
        detail: "Another contact at this domain was recently emailed.",
      };
    case "global_daily_cap_reached":
      return {
        label: "Daily send cap reached",
        detail: "The global daily automation send cap has been reached.",
      };
  }
}

const BLOCKER_PRECEDENCE: AutomationBlockerReason[] = [
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
  "global_daily_cap_reached",
];

function getPrimaryBlocker(blockers: AutomationBlockerReason[]) {
  if (blockers.length === 0) return null;
  const deduped = Array.from(new Set(blockers));
  deduped.sort((a, b) => {
    const aIndex = BLOCKER_PRECEDENCE.indexOf(a);
    const bIndex = BLOCKER_PRECEDENCE.indexOf(b);
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  return deduped[0] || null;
}

function isTerminalSendBlocker(reason: AutomationBlockerReason) {
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

function getBlockedRecheckDelayMinutes(reason: AutomationBlockerReason, mailbox?: OutreachMailboxRecord | null) {
  switch (reason) {
    case "mailbox_cooldown":
      return Math.max(1, Math.ceil((mailbox?.minDelaySeconds || MAILBOX_MIN_DELAY_SECONDS) / 60));
    case "hourly_cap_reached":
      return 60;
    case "daily_cap_reached":
    case "domain_cooldown_active":
    case "global_daily_cap_reached":
    case "below_send_min_score":
      return 24 * 60;
    case "mailbox_disconnected":
    case "mailbox_disabled":
    case "missing_enrichment":
      return 60;
    case "generation_failed_retryable":
    case "send_failed_retryable":
      return 6 * 60;
    case "outside_send_window":
      return 15;
    case "global_pause":
    case "emergency_stop":
    case "manual_pause":
      return 5;
    default:
      return 24 * 60;
  }
}

async function getMailboxHourlyCapResetAt(prisma: PrismaLike, mailboxId: string, now: Date) {
  const windowStart = addHours(now, -1);
  const oldestRecentSend = await prisma.outreachEmail.findFirst({
    where: {
      mailboxId,
      status: "sent",
      sentAt: { gte: windowStart },
    },
    orderBy: { sentAt: "asc" },
  }) as OutreachEmailRecord | null;

  const resetAt = oldestRecentSend?.sentAt
    ? addHours(coerceDate(oldestRecentSend.sentAt) || now, 1)
    : addMinutes(now, 60);
  return addSeconds(resetAt.getTime() > now.getTime() ? resetAt : now, 5);
}

async function getRateLimitRecheckAt(
  prisma: PrismaLike,
  claim: SchedulerClaim,
  reason: AutomationBlockerReason,
  config: OutreachSequenceConfig,
  now: Date,
) {
  let baseRecheckAt: Date;

  if (reason === "global_daily_cap_reached" || reason === "daily_cap_reached") {
    baseRecheckAt = addSeconds(startOfNextUtcDay(now), 5);
  } else if (reason === "hourly_cap_reached") {
    baseRecheckAt = await getMailboxHourlyCapResetAt(prisma, claim.mailbox.id, now);
  } else if (reason === "mailbox_cooldown") {
    const lastSentAt = coerceDate(claim.mailbox.lastSentAt);
    const cooldownReadyAt = lastSentAt ? addSeconds(lastSentAt, claim.mailbox.minDelaySeconds) : now;
    baseRecheckAt = addSeconds(cooldownReadyAt.getTime() > now.getTime() ? cooldownReadyAt : now, 5);
  } else {
    baseRecheckAt = addMinutes(now, getBlockedRecheckDelayMinutes(reason, claim.mailbox));
  }

  return adjustToAllowedSendWindow(baseRecheckAt, config);
}

function isWithinSendWindow(date: Date, config: OutreachSequenceConfig) {
  const parts = getLocalDateParts(date, config.timezone);
  const localMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = config.sendWindowStartHour * 60 + config.sendWindowStartMinute;
  const endMinutes = config.sendWindowEndHour * 60 + config.sendWindowEndMinute;

  return localMinutes >= startMinutes && localMinutes <= endMinutes;
}

function adjustToAllowedSendWindow(date: Date, config: OutreachSequenceConfig) {
  let candidate = new Date(date);

  for (let attempts = 0; attempts < 48; attempts++) {
    const parts = getLocalDateParts(candidate, config.timezone);
    const localMinutes = parts.hour * 60 + parts.minute;
    const startMinutes = config.sendWindowStartHour * 60 + config.sendWindowStartMinute;
    const endMinutes = config.sendWindowEndHour * 60 + config.sendWindowEndMinute;

    if (localMinutes < startMinutes) {
      return setMinutesInTimezone(candidate, config.timezone, config.sendWindowStartHour, config.sendWindowStartMinute);
    }

    if (localMinutes > endMinutes) {
      candidate = setMinutesInTimezone(addMinutes(candidate, 24 * 60), config.timezone, config.sendWindowStartHour, config.sendWindowStartMinute);
      continue;
    }

    return candidate;
  }

  return candidate;
}

function getStepType(stepNumber: number): OutreachSequenceStepType {
  if (stepNumber === 1) return "INITIAL";
  if (stepNumber === 2) return "FOLLOW_UP_1";
  return "FOLLOW_UP_2";
}

function normalizeAutomationSettings(settings: OutreachAutomationSettingRecord) {
  // DB is the source of truth; only fill in missing/invalid values from defaults.
  const pickNumber = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const pickBool = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  const pickText = (value: unknown, fallback: string | null) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  return {
    ...settings,
    weekdaysOnly: pickBool(settings.weekdaysOnly, AUTOMATION_SETTINGS_DEFAULTS.weekdaysOnly),
    emergencyPaused: pickBool(settings.emergencyPaused, AUTOMATION_SETTINGS_DEFAULTS.emergencyPaused),
    emergencyPausedAt: coerceDate(settings.emergencyPausedAt),
    emergencyPausedBy: pickText(settings.emergencyPausedBy, AUTOMATION_SETTINGS_DEFAULTS.emergencyPausedBy),
    emergencyPauseReason: pickText(settings.emergencyPauseReason, AUTOMATION_SETTINGS_DEFAULTS.emergencyPauseReason),
    sendWindowStartHour: pickNumber(settings.sendWindowStartHour, AUTOMATION_SETTINGS_DEFAULTS.sendWindowStartHour),
    sendWindowStartMinute: pickNumber(settings.sendWindowStartMinute, AUTOMATION_SETTINGS_DEFAULTS.sendWindowStartMinute),
    sendWindowEndHour: pickNumber(settings.sendWindowEndHour, AUTOMATION_SETTINGS_DEFAULTS.sendWindowEndHour),
    sendWindowEndMinute: pickNumber(settings.sendWindowEndMinute, AUTOMATION_SETTINGS_DEFAULTS.sendWindowEndMinute),
    initialDelayMinMinutes: pickNumber(settings.initialDelayMinMinutes, AUTOMATION_SETTINGS_DEFAULTS.initialDelayMinMinutes),
    initialDelayMaxMinutes: pickNumber(settings.initialDelayMaxMinutes, AUTOMATION_SETTINGS_DEFAULTS.initialDelayMaxMinutes),
    followUp1BusinessDays: pickNumber(settings.followUp1BusinessDays, AUTOMATION_SETTINGS_DEFAULTS.followUp1BusinessDays),
    followUp2BusinessDays: pickNumber(settings.followUp2BusinessDays, AUTOMATION_SETTINGS_DEFAULTS.followUp2BusinessDays),
    schedulerClaimBatch: pickNumber(settings.schedulerClaimBatch, AUTOMATION_SETTINGS_DEFAULTS.schedulerClaimBatch),
    replySyncStaleMinutes: pickNumber(settings.replySyncStaleMinutes, AUTOMATION_SETTINGS_DEFAULTS.replySyncStaleMinutes),
  };
}

export async function getAutomationSettings(prisma: PrismaLike = getPrisma()) {
  return getSettings(prisma);
}

export async function isAutomationEmergencyPaused(prisma: PrismaLike = getPrisma()) {
  const settings = await getSettings(prisma);
  return settings.emergencyPaused;
}

async function getSettings(prisma: PrismaLike) {
  const existing = await prisma.outreachAutomationSetting.findUnique({
    where: { id: "global" },
  });

  if (existing) {
    return normalizeAutomationSettings(existing);
  }

  const created = await prisma.outreachAutomationSetting.create({
    data: {
      id: "global",
      ...AUTOMATION_SETTINGS_DEFAULTS,
      updatedAt: new Date(),
    },
  });

  return normalizeAutomationSettings(created);
}

export async function ensureMailboxForConnection(
  connection: GmailConnectionRecord,
  options?: { label?: string; timezone?: string; status?: string; forceStatus?: boolean },
) {
  const prisma = getPrisma();
  const gmailAddress = normalizeGmailAddress(connection.gmailAddress);
  const existing = await prisma.outreachMailbox.findFirst({
    where: {
      OR: [
        { gmailConnectionId: connection.id },
        { gmailAddress },
      ],
    },
  });
  const status = options?.forceStatus
    ? (options?.status ?? existing?.status ?? "WARMING")
    : (existing?.status ?? options?.status ?? "WARMING");

  const data = {
    userId: connection.userId,
    gmailConnectionId: connection.id,
    gmailAddress,
    label: options?.label ?? existing?.label ?? gmailAddress.split("@")[0],
    timezone: options?.timezone ?? existing?.timezone ?? "America/Toronto",
    status,
    dailyLimit: MAILBOX_DAILY_SEND_TARGET,
    hourlyLimit: MAILBOX_HOURLY_SEND_TARGET,
    minDelaySeconds: MAILBOX_MIN_DELAY_SECONDS,
    maxDelaySeconds: MAILBOX_MAX_DELAY_SECONDS,
    warmupLevel: existing?.warmupLevel ?? 0,
    updatedAt: new Date(),
  };

  if (existing) {
    return prisma.outreachMailbox.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.outreachMailbox.create({
    data: {
      id: crypto.randomUUID(),
      ...data,
      updatedAt: new Date(),
    },
  });
}

export async function syncMailboxesForGmailConnections(userId?: string) {
  const prisma = getPrisma();
  const connections = await prisma.gmailConnection.findMany({
    ...(userId ? { where: { userId } } : {}),
    orderBy: { updatedAt: "desc" },
  }) as GmailConnectionRecord[];

  const mailboxes = await Promise.all(
    connections.map((connection) => ensureMailboxForConnection(connection, { status: "ACTIVE" })),
  );
  const byAddress = new Map<string, OutreachMailboxRecord>();

  for (const mailbox of mailboxes) {
    byAddress.set(normalizeGmailAddress(mailbox.gmailAddress), mailbox);
  }

  return Array.from(byAddress.values());
}

export async function getMailboxForManualSend(userId: string) {
  const prisma = getPrisma();
  const mailboxes = await prisma.outreachMailbox.findMany({
    where: {
      userId,
      status: { in: [...MAILBOX_SENDABLE_STATUSES] },
    },
    orderBy: { updatedAt: "desc" },
  }) as OutreachMailboxRecord[];

  if (mailboxes.length > 0) {
    const mailbox = mailboxes[0];
    const connection = mailbox.gmailConnectionId
      ? await prisma.gmailConnection.findUnique({ where: { id: mailbox.gmailConnectionId } })
      : null;
    if (connection) {
      return { mailbox, connection };
    }
  }

  const fallbackConnection = await prisma.gmailConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  if (!fallbackConnection) {
    return null;
  }

  const mailbox = await ensureMailboxForConnection(fallbackConnection, { status: "ACTIVE" });
  return { mailbox, connection: fallbackConnection };
}

async function getSequenceSnapshotConfig(
  settings: OutreachAutomationSettingRecord,
  mailbox: OutreachMailboxRecord,
  lead: LeadRecord,
) {
  if (!lead.email) {
    throw new Error(`Lead ${lead.id} is missing email`);
  }

  return {
    timezone: mailbox.timezone,
    weekdaysOnly: settings.weekdaysOnly,
    sendWindowStartHour: settings.sendWindowStartHour,
    sendWindowStartMinute: settings.sendWindowStartMinute,
    sendWindowEndHour: settings.sendWindowEndHour,
    sendWindowEndMinute: settings.sendWindowEndMinute,
    initialDelayMinMinutes: settings.initialDelayMinMinutes,
    initialDelayMaxMinutes: settings.initialDelayMaxMinutes,
    followUp1BusinessDays: settings.followUp1BusinessDays,
    followUp2BusinessDays: settings.followUp2BusinessDays,
    schedulerClaimBatch: settings.schedulerClaimBatch,
    replySyncStaleMinutes: settings.replySyncStaleMinutes,
    leadSnapshot: {
      id: lead.id,
      businessName: lead.businessName,
      city: lead.city,
      niche: lead.niche,
      email: lead.email,
      contactName: lead.contactName,
      websiteStatus: lead.websiteStatus,
      axiomScore: lead.axiomScore,
      axiomTier: lead.axiomTier,
    },
    enrichmentSnapshot: resolveLeadEnrichment(lead),
  } satisfies OutreachSequenceConfig;
}

function buildScheduledTimeline(now: Date, config: OutreachSequenceConfig) {
  const initialDelay = getRandomInt(config.initialDelayMinMinutes, config.initialDelayMaxMinutes);
  const initial = adjustToAllowedSendWindow(addMinutes(now, initialDelay), config);

  // Follow-up 1: N days after the initial send (weekend-aware when weekdaysOnly=true).
  const followUp1 = adjustToAllowedSendWindow(
    addDaysRespectingWeekdays(initial, config.followUp1BusinessDays, config.timezone, config.weekdaysOnly),
    config,
  );
  // Follow-up 2: N days after follow-up 1.
  const followUp2 = adjustToAllowedSendWindow(
    addDaysRespectingWeekdays(followUp1, config.followUp2BusinessDays, config.timezone, config.weekdaysOnly),
    config,
  );

  return [initial, followUp1, followUp2];
}

function applyLiveSendWindowSettings(
  config: OutreachSequenceConfig,
  settings: OutreachAutomationSettingRecord,
): OutreachSequenceConfig {
  return {
    ...config,
    weekdaysOnly: settings.weekdaysOnly,
    sendWindowStartHour: settings.sendWindowStartHour,
    sendWindowStartMinute: settings.sendWindowStartMinute,
    sendWindowEndHour: settings.sendWindowEndHour,
    sendWindowEndMinute: settings.sendWindowEndMinute,
  };
}

function getFollowUpDelayBusinessDays(stepNumber: number, config: OutreachSequenceConfig) {
  if (stepNumber === 2) return config.followUp1BusinessDays;
  if (stepNumber === 3) return config.followUp2BusinessDays;
  return 0;
}

function getEarliestFollowUpSendAt(
  previousSentAt: Date,
  stepNumber: number,
  config: OutreachSequenceConfig,
) {
  const delayDays = getFollowUpDelayBusinessDays(stepNumber, config);
  return adjustToAllowedSendWindow(
    addDaysRespectingWeekdays(previousSentAt, delayDays, config.timezone, config.weekdaysOnly),
    config,
  );
}

async function listSendableMailboxes(prisma: PrismaLike) {
  return prisma.outreachMailbox.findMany({
    where: {
      status: { in: [...MAILBOX_SENDABLE_STATUSES] },
      gmailConnectionId: { not: null },
    },
    orderBy: { lastSentAt: "asc" },
  }) as Promise<OutreachMailboxRecord[]>;
}

async function getMailboxLoad(prisma: PrismaLike, mailboxId: string, now: Date) {
  const [sentToday, sentThisHour] = await Promise.all([
    prisma.outreachEmail.count({
      where: {
        mailboxId,
        status: "sent",
        sentAt: { gte: startOfDay(now) },
      },
    }),
    prisma.outreachEmail.count({
      where: {
        mailboxId,
        status: "sent",
        sentAt: { gte: startOfHour(now) },
      },
    }),
  ]);

  return { sentToday, sentThisHour };
}

async function allocateMailbox(
  prisma: PrismaLike,
  now: Date,
  pendingAssignments: Map<string, number> = new Map(),
): Promise<MailboxAllocationResult | null> {
  const mailboxes = await listSendableMailboxes(prisma);
  if (mailboxes.length === 0) return null;

  const loads = await Promise.all(
    mailboxes.map(async (mailbox) => ({
      mailbox,
      ...(await getMailboxLoad(prisma, mailbox.id, now)),
    })),
  );

  loads.sort((a, b) => {
    const pendingA = pendingAssignments.get(a.mailbox.id) || 0;
    const pendingB = pendingAssignments.get(b.mailbox.id) || 0;
    if (pendingA !== pendingB) return pendingA - pendingB;
    if (a.sentToday !== b.sentToday) return a.sentToday - b.sentToday;
    if (a.sentThisHour !== b.sentThisHour) return a.sentThisHour - b.sentThisHour;
    return (coerceDate(a.mailbox.lastSentAt)?.getTime() || 0) - (coerceDate(b.mailbox.lastSentAt)?.getTime() || 0);
  });

  return {
    mailbox: loads[0].mailbox,
    reason: "least-loaded",
  };
}

async function getActiveSequencesForLeads(prisma: PrismaLike, leadIds: number[]) {
  if (leadIds.length === 0) return [];
  const sequences: OutreachSequenceRecord[] = [];
  for (const chunk of chunkArray(leadIds)) {
    const chunkSequences = (await prisma.outreachSequence.findMany({
      where: {
        leadId: { in: chunk },
        status: { in: [...ACTIVE_SEQUENCE_STATUSES] },
      },
    })) as OutreachSequenceRecord[];
    sequences.push(...chunkSequences);
  }

  const blocking: OutreachSequenceRecord[] = [];
  for (const sequence of sequences) {
    if (!isRecoverableSequenceBlocker(sequence)) {
      blocking.push(sequence);
      continue;
    }

    const nextPendingStep = await getNextPendingStep(prisma, sequence.id);
    if (nextPendingStep) {
      blocking.push(sequence);
      continue;
    }

    await stopSequenceInternal(prisma, sequence, "stale_empty_sequence_recovered").catch(() => null);
  }

  return blocking;
}

export async function getBlockingAutomationLeadIdsForLeads(leadIds: number[]) {
  const prisma = getPrisma();
  const sequences = await getActiveSequencesForLeads(prisma, leadIds);
  return Array.from(new Set(sequences.map((sequence) => sequence.leadId)));
}

function getDomainFromEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized.includes("@") ? normalized.split("@")[1] || "" : "";
}

function hasAlreadyReceivedAutomationEmail(lead: LeadRecord) {
  return Boolean(lead.firstContactedAt);
}

function isLeadRecoverableForAutomation(lead: LeadRecord) {
  if (lead.isArchived) return false;
  if (hasAlreadyReceivedAutomationEmail(lead)) return false;
  if (lead.outreachStatus === "REPLIED" || lead.outreachStatus === "SUPPRESSED") return false;
  if (!hasValidPipelineEmail(lead)) return false;
  if (!isLeadOutreachEligible(lead)) return false;
  return isAdequateAutonomousLead(lead);
}

function isLeadQueueReady(lead: LeadRecord) {
  if (!lead.enrichmentData) return false;
  return isLeadRecoverableForAutomation(lead);
}

function isRecoverableSequenceBlocker(sequence: OutreachSequenceRecord) {
  const reason = normalizeBlockerReason(sequence.stopReason);
  return !reason || REQUEUEABLE_STALE_STOP_REASONS.has(reason);
}

function getSequenceProgressTime(sequence: OutreachSequenceRecord) {
  return coerceDate(sequence.lastSentAt || sequence.createdAt)?.getTime() || 0;
}

function sortBySequenceOwnership(a: OutreachSequenceRecord, b: OutreachSequenceRecord) {
  const progressDiff = getSequenceProgressTime(b) - getSequenceProgressTime(a);
  if (progressDiff !== 0) return progressDiff;
  return a.id.localeCompare(b.id);
}

async function stopDuplicateSiblingSequences(prisma: PrismaLike, sequence: OutreachSequenceRecord) {
  const siblings = (await prisma.outreachSequence.findMany({
    where: {
      leadId: sequence.leadId,
      status: { in: [...CLAIMABLE_SEQUENCE_STATUSES] },
    },
  })) as OutreachSequenceRecord[];

  if (siblings.length <= 1) {
    return false;
  }

  siblings.sort(sortBySequenceOwnership);
  const keeper = siblings[0];
  const duplicates = siblings.slice(1);
  for (const duplicate of duplicates) {
    await stopSequenceInternal(prisma, duplicate, "duplicate_active_sequence").catch(() => null);
  }

  return keeper.id !== sequence.id;
}

async function hasExternalSentEmailForSequence(prisma: PrismaLike, sequence: OutreachSequenceRecord) {
  void prisma;
  const { getDatabase } = await import("@/lib/cloudflare");
  const externalEmail = await getDatabase()
    .prepare(
      `SELECT "id"
       FROM "OutreachEmail"
       WHERE "leadId" = ?
         AND "status" = 'sent'
         AND ("sequenceId" IS NULL OR "sequenceId" != ?)
       LIMIT 1`,
    )
    .bind(sequence.leadId, sequence.id)
    .first<{ id: string }>();

  return Boolean(externalEmail);
}

async function stopAlreadyContactedSequence(prisma: PrismaLike, sequence: OutreachSequenceRecord) {
  if (!(await hasExternalSentEmailForSequence(prisma, sequence))) {
    return false;
  }

  await stopSequenceInternal(prisma, sequence, "already_contacted").catch(() => null);
  return true;
}

async function hasAnySentEmailForRecipient(recipientEmail: string | null | undefined) {
  if (!recipientEmail) {
    return false;
  }

  return Boolean(await findConflictingSentEmailForRecipient(recipientEmail, ""));
}

async function getSentRecipientEmails() {
  const { getDatabase } = await import("@/lib/cloudflare");
  const rows = await getDatabase()
    .prepare(
      `SELECT DISTINCT LOWER("recipientEmail") AS email
       FROM "OutreachEmail"
       WHERE "status" = 'sent'
         AND COALESCE("recipientEmail", '') != ''`,
    )
    .all<{ email: string }>();

  return new Set((rows.results ?? []).map((row) => normalizeEmail(row.email)).filter(Boolean));
}

type SentRecipientMatch = {
  id: string;
  leadId: number | null;
  sequenceId: string | null;
  sequenceStepId: string | null;
  sentAt: string | null;
};

async function findConflictingSentEmailForRecipient(
  recipientEmail: string,
  sequenceId: string,
  allowedSequenceStepIds: string[] = [],
) {
  const normalizedRecipient = normalizeEmail(recipientEmail);
  if (!normalizedRecipient) {
    return null;
  }

  const { getDatabase } = await import("@/lib/cloudflare");
  const params: unknown[] = [normalizedRecipient];
  const exclusions =
    allowedSequenceStepIds.length > 0
      ? `AND (
          "sequenceId" IS NULL
          OR "sequenceId" != ?
          OR "sequenceStepId" IS NULL
          OR "sequenceStepId" NOT IN (${allowedSequenceStepIds.map(() => "?").join(", ")})
        )`
      : "";

  if (allowedSequenceStepIds.length > 0) {
    params.push(sequenceId, ...allowedSequenceStepIds);
  }

  return getDatabase()
    .prepare(
      `SELECT "id", "leadId", "sequenceId", "sequenceStepId", "sentAt"
       FROM "OutreachEmail"
       WHERE "status" = 'sent'
         AND LOWER("recipientEmail") = ?
         ${exclusions}
       ORDER BY datetime("sentAt") DESC
       LIMIT 1`,
    )
    .bind(...params)
    .first<SentRecipientMatch>();
}

async function getSentSequenceStepIds(prisma: PrismaLike, sequenceId: string) {
  const sentSteps = (await prisma.outreachSequenceStep.findMany({
    where: {
      sequenceId,
      status: "SENT",
    },
    select: { id: true },
  })) as Array<Pick<OutreachSequenceStepRecord, "id">>;

  return sentSteps.map((step) => step.id);
}

async function rescheduleFollowUpForEarliestWindow(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
  step: OutreachSequenceStepRecord,
  earliestSendAt: Date,
) {
  await prisma.outreachSequenceStep.update({
    where: { id: step.id },
    data: {
      status: "SCHEDULED",
      claimedAt: null,
      claimedByRunId: null,
      scheduledFor: earliestSendAt,
      errorMessage: null,
    },
  });

  await prisma.outreachSequence.update({
    where: { id: sequence.id },
    data: {
      status: "ACTIVE",
      currentStep: step.stepType,
      nextScheduledAt: earliestSendAt,
      stopReason: null,
    },
  });

  await prisma.lead.update({
    where: { id: sequence.leadId },
    data: { nextFollowUpDue: earliestSendAt },
  }).catch(() => null);
}

async function rescheduleFollowUpIfTooEarly(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
  step: OutreachSequenceStepRecord,
  config: OutreachSequenceConfig,
  now: Date,
) {
  if (step.stepNumber <= 1) {
    return false;
  }

  const previousStep = (await prisma.outreachSequenceStep.findFirst({
    where: {
      sequenceId: sequence.id,
      stepNumber: step.stepNumber - 1,
      status: "SENT",
    },
  })) as OutreachSequenceStepRecord | null;
  const previousSentAt = coerceDate(previousStep?.sentAt);

  if (!previousSentAt) {
    const recheckAt = addMinutes(now, 60);
    await prisma.outreachSequenceStep.update({
      where: { id: step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        scheduledFor: recheckAt,
        errorMessage: "send_failed_retryable",
      },
    });
    await prisma.outreachSequence.update({
      where: { id: sequence.id },
      data: {
        status: "ACTIVE",
        currentStep: step.stepType,
        nextScheduledAt: recheckAt,
        stopReason: "send_failed_retryable",
      },
    }).catch(() => null);
    return true;
  }

  const earliestSendAt = getEarliestFollowUpSendAt(previousSentAt, step.stepNumber, config);
  const scheduledFor = coerceDate(step.scheduledFor);
  if (
    earliestSendAt.getTime() <= now.getTime() &&
    scheduledFor &&
    scheduledFor.getTime() >= earliestSendAt.getTime()
  ) {
    return false;
  }

  await rescheduleFollowUpForEarliestWindow(prisma, sequence, step, earliestSendAt);
  return true;
}

export async function getActiveAutomationLeadIds() {
  const prisma = getPrisma();
  const sequences = await prisma.outreachSequence.findMany({
    where: { status: { in: [...ACTIVE_SEQUENCE_STATUSES] } },
  }) as OutreachSequenceRecord[];

  const blockingLeadIds: number[] = [];
  for (const sequence of sequences) {
    if (!isRecoverableSequenceBlocker(sequence)) {
      blockingLeadIds.push(sequence.leadId);
      continue;
    }

    const nextPendingStep = await getNextPendingStep(prisma, sequence.id);
    if (nextPendingStep) {
      blockingLeadIds.push(sequence.leadId);
      continue;
    }

    await stopSequenceInternal(prisma, sequence, "stale_empty_sequence_recovered").catch(() => null);
  }

  return Array.from(new Set(blockingLeadIds));
}

async function getActiveAutomationRecipientEmails(prisma: PrismaLike) {
  const sequences = (await prisma.outreachSequence.findMany({
    where: { status: { in: [...ACTIVE_SEQUENCE_STATUSES] } },
    select: { leadId: true },
  })) as Array<Pick<OutreachSequenceRecord, "leadId">>;
  const leadMap = await getLeadMap(prisma, Array.from(new Set(sequences.map((sequence) => sequence.leadId))));
  const emails = new Set<string>();

  for (const sequence of sequences) {
    const email = normalizeEmail(leadMap.get(sequence.leadId)?.email);
    if (email) {
      emails.add(email);
    }
  }

  return emails;
}

async function listAutomationReadyLeads(prisma: PrismaLike) {
  const activeLeadIds = new Set(await getActiveAutomationLeadIds());
  const [activeRecipientEmails, sentRecipientEmails] = await Promise.all([
    getActiveAutomationRecipientEmails(prisma),
    getSentRecipientEmails(),
  ]);
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: { not: null },
      isArchived: false,
    },
    orderBy: { enrichedAt: "desc" },
  })) as LeadRecord[];

  const seenRecipientEmails = new Set<string>();
  return leads
    .filter((lead) => {
      if (activeLeadIds.has(lead.id)) return false;
      const normalizedEmail = normalizeEmail(lead.email);
      if (!normalizedEmail) return false;
      if (seenRecipientEmails.has(normalizedEmail)) return false;
      if (activeRecipientEmails.has(normalizedEmail)) return false;
      if (sentRecipientEmails.has(normalizedEmail)) return false;
      if (!isLeadQueueReady(lead)) return false;
      seenRecipientEmails.add(normalizedEmail);
      return true;
    })
    .sort((a, b) => {
      const scoreDiff = (b.axiomScore || 0) - (a.axiomScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (coerceDate(b.enrichedAt)?.getTime() || 0) - (coerceDate(a.enrichedAt)?.getTime() || 0);
    });
}

function getMailboxNextAvailableAt(
  mailbox: OutreachMailboxRecord,
  settings: OutreachAutomationSettingRecord,
  now: Date,
) {
  if (!MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
    return null;
  }

  let next = new Date(now);
  const lastSentAt = coerceDate(mailbox.lastSentAt);
  if (lastSentAt) {
    const cooldownReadyAt = addSeconds(lastSentAt, mailbox.minDelaySeconds);
    if (cooldownReadyAt.getTime() > next.getTime()) {
      next = cooldownReadyAt;
    }
  }

  return adjustToAllowedSendWindow(next, {
    timezone: mailbox.timezone,
    weekdaysOnly: settings.weekdaysOnly,
    sendWindowStartHour: settings.sendWindowStartHour,
    sendWindowStartMinute: settings.sendWindowStartMinute,
    sendWindowEndHour: settings.sendWindowEndHour,
    sendWindowEndMinute: settings.sendWindowEndMinute,
    initialDelayMinMinutes: settings.initialDelayMinMinutes,
    initialDelayMaxMinutes: settings.initialDelayMaxMinutes,
    followUp1BusinessDays: settings.followUp1BusinessDays,
    followUp2BusinessDays: settings.followUp2BusinessDays,
    schedulerClaimBatch: settings.schedulerClaimBatch,
    replySyncStaleMinutes: settings.replySyncStaleMinutes,
    leadSnapshot: {
      id: 0,
      businessName: "",
      city: "",
      niche: "",
      email: "",
      contactName: null,
      websiteStatus: null,
      axiomScore: null,
      axiomTier: null,
    },
    enrichmentSnapshot: null,
  });
}

async function getSequenceRuntimeBlockers(
  prisma: PrismaLike,
  sequence: OutreachSequenceSummary,
  settings: OutreachAutomationSettingRecord,
  now: Date,
  context?: SequenceRuntimeContext,
) {
  const blockers: AutomationBlockerReason[] = [];
  const normalizedStatus = sequence.status.toUpperCase();

  if (normalizedStatus === "STOPPED" || normalizedStatus === "COMPLETED" || normalizedStatus === "FAILED") {
    const terminalReason = normalizeBlockerReason(sequence.stopReason);
    return terminalReason ? [terminalReason] : [];
  }

  if (normalizeBlockerReason(sequence.stopReason) === "reply_detected" || sequence.stopReason === "REPLIED") {
    blockers.push("reply_detected");
  }

  if (sequence.status === "PAUSED") {
    blockers.push("manual_pause");
  }

  if (settings.globalPaused) {
    blockers.push("global_pause");
  }

  if (settings.emergencyPaused) {
    blockers.push("emergency_stop");
  }

  const lead = sequence.lead;
  const mailbox = sequence.mailbox;

  if (!lead?.enrichmentData) {
    blockers.push("missing_enrichment");
  }

  if (!lead || !hasValidPipelineEmail(lead)) {
    blockers.push("missing_valid_email");
  }

  if (!lead || !isLeadOutreachEligible(lead)) {
    blockers.push("policy_ineligible");
  }

  if (lead?.email) {
    const email = normalizeEmail(lead.email);
    const domain = getAutomationBusinessDomain(lead);
    const isSuppressed = context
      ? Boolean(
          (email && context.suppressedEmails?.has(email)) ||
          (domain && context.suppressedDomains?.has(domain)),
        )
      : Boolean(
          await prisma.outreachSuppression.findFirst({
            where: {
              OR: [{ email }, { domain }],
            },
          }),
        );
    if (isSuppressed) {
      blockers.push("suppressed");
    }
  }

  if (!mailbox?.gmailConnectionId) {
    blockers.push("mailbox_disconnected");
  } else if (!MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
    blockers.push("mailbox_disabled");
  } else {
    const mailboxLoad = context?.mailboxLoadById?.get(mailbox.id) ?? (await getMailboxLoad(prisma, mailbox.id, now));
    const { sentToday, sentThisHour } = mailboxLoad;
    if (sentToday >= mailbox.dailyLimit) blockers.push("daily_cap_reached");
    if (sentThisHour >= mailbox.hourlyLimit) blockers.push("hourly_cap_reached");

    const lastSentAt = coerceDate(mailbox.lastSentAt);
    if (lastSentAt && now.getTime() - lastSentAt.getTime() < mailbox.minDelaySeconds * 1000) {
      blockers.push("mailbox_cooldown");
    }

    // Use CURRENT global settings for send window, not the frozen snapshot,
    // so window changes take effect immediately for all sequences.
    const liveConfig: OutreachSequenceConfig = {
      timezone: mailbox.timezone,
      weekdaysOnly: settings.weekdaysOnly,
      sendWindowStartHour: settings.sendWindowStartHour,
      sendWindowStartMinute: settings.sendWindowStartMinute,
      sendWindowEndHour: settings.sendWindowEndHour,
      sendWindowEndMinute: settings.sendWindowEndMinute,
      initialDelayMinMinutes: settings.initialDelayMinMinutes,
      initialDelayMaxMinutes: settings.initialDelayMaxMinutes,
      followUp1BusinessDays: settings.followUp1BusinessDays,
      followUp2BusinessDays: settings.followUp2BusinessDays,
      schedulerClaimBatch: settings.schedulerClaimBatch,
      replySyncStaleMinutes: settings.replySyncStaleMinutes,
      leadSnapshot: { id: 0, businessName: "", city: "", niche: "", email: "", contactName: null, websiteStatus: null, axiomScore: null, axiomTier: null },
      enrichmentSnapshot: null,
    };
    if (!isWithinSendWindow(now, liveConfig)) {
      blockers.push("outside_send_window");
    }
  }

  const nextSendAt = coerceDate(sequence.nextScheduledAt || sequence.nextStep?.scheduledFor || null);
  const hasSentAnyStep = Boolean(sequence.lastSentAt);
  if (hasSentAnyStep && nextSendAt && nextSendAt.getTime() > now.getTime()) {
    blockers.push("awaiting_follow_up_window");
  }

  const persistedReason = normalizeBlockerReason(sequence.stopReason || sequence.nextStep?.errorMessage);
  if (persistedReason) {
    blockers.push(persistedReason);
  }

  return Array.from(new Set(blockers));
}

async function enrichSequenceSummary(
  prisma: PrismaLike,
  sequence: OutreachSequenceSummary,
  settings: OutreachAutomationSettingRecord,
  now: Date,
  context?: SequenceRuntimeContext,
) {
  const blockers = await getSequenceRuntimeBlockers(prisma, sequence, settings, now, context);
  const primaryBlocker = getPrimaryBlocker(blockers);
  const nextSendAt = coerceDate(sequence.nextScheduledAt || sequence.nextStep?.scheduledFor || null);
  const hasSentAnyStep = Boolean(sequence.lastSentAt);
  const normalizedStatus = sequence.status.toUpperCase();

  let state: AutomationCanonicalState;
  if (normalizedStatus === "STOPPED" || normalizedStatus === "FAILED") {
    state = "STOPPED";
  } else if (normalizedStatus === "COMPLETED") {
    state = "COMPLETED";
  } else if (normalizedStatus === "SENDING") {
    state = "SENDING";
  } else if (primaryBlocker && !(primaryBlocker === "awaiting_follow_up_window" && hasSentAnyStep)) {
    state = "BLOCKED";
  } else if (hasSentAnyStep) {
    state = "WAITING";
  } else {
    state = "QUEUED";
  }

  const blockerMeta = primaryBlocker ? getBlockerMeta(primaryBlocker) : null;

  return {
    ...sequence,
    state,
    blockerReason: primaryBlocker,
    blockerLabel: blockerMeta?.label || null,
    blockerDetail: blockerMeta?.detail || null,
    nextSendAt,
    hasSentAnyStep,
    secondaryBlockers: blockers.filter((reason) => reason !== primaryBlocker),
  };
}

export async function queueLeadsForAutomation(input: {
  leadIds: number[];
  queuedByUserId: string;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const settings = await getSettings(prisma);
  const result: QueueAutomationResult = { queued: [], skipped: [] };
  const pendingAssignments = new Map<string, number>();

  if (!settings.enabled || settings.globalPaused || settings.emergencyPaused) {
    return {
      queued: [],
      skipped: input.leadIds.map((leadId) => ({
        leadId,
        reason: settings.emergencyPaused
          ? "Emergency stop is active"
          : settings.globalPaused
            ? "Automation is globally paused"
            : "Automation is disabled",
      })),
    };
  }

  const leadMap = await getLeadMap(prisma, input.leadIds);
  const activeSequences = await getActiveSequencesForLeads(prisma, input.leadIds);
  const activeLeadIds = new Set(activeSequences.map((sequence) => sequence.leadId));
  const activeRecipientEmails = await getActiveAutomationRecipientEmails(prisma);
  const sentRecipientEmails = await getSentRecipientEmails();
  const pendingRecipientEmails = new Set<string>();

  for (const leadId of input.leadIds) {
    const lead = leadMap.get(leadId);
    if (!lead) {
      result.skipped.push({ leadId, reason: "Lead not found" });
      continue;
    }

    if (!isLeadRecoverableForAutomation(lead)) {
      result.skipped.push({ leadId, reason: "Lead is not an adequate, uncontacted automation candidate" });
      continue;
    }

    if (!lead.enrichmentData) {
      result.skipped.push({
        leadId,
        reason: "Lead must be enriched before automation can queue it",
      });
      continue;
    }

    const normalizedLeadEmail = normalizeEmail(lead.email);
    if (!normalizedLeadEmail) {
      result.skipped.push({ leadId, reason: "Lead is missing a normalized email" });
      continue;
    }

    if (pendingRecipientEmails.has(normalizedLeadEmail)) {
      result.skipped.push({ leadId, reason: "Another lead with this email is already being queued" });
      continue;
    }

    if (activeLeadIds.has(leadId)) {
      result.skipped.push({ leadId, reason: "Lead already has an active automation sequence" });
      continue;
    }

    if (activeRecipientEmails.has(normalizedLeadEmail)) {
      result.skipped.push({ leadId, reason: "Recipient already has an active automation sequence" });
      continue;
    }

    if (sentRecipientEmails.has(normalizedLeadEmail) || await hasAnySentEmailForRecipient(normalizedLeadEmail)) {
      result.skipped.push({ leadId, reason: "Recipient has already received an email" });
      continue;
    }

    const suppression = await prisma.outreachSuppression.findFirst({
      where: {
        OR: [
          { email: normalizedLeadEmail },
          { domain: getAutomationBusinessDomain(lead) },
        ],
      },
    });
    if (suppression) {
      result.skipped.push({ leadId, reason: "Lead is suppressed from automation" });
      continue;
    }

    const allocation = await allocateMailbox(prisma, now, pendingAssignments);
    if (!allocation) {
      result.skipped.push({ leadId, reason: "No active mailbox is available right now" });
      continue;
    }

    const config = await getSequenceSnapshotConfig(settings, allocation.mailbox, lead);
    const timeline = buildScheduledTimeline(now, config);
    const sequence = await prisma.outreachSequence.create({
      data: {
        id: crypto.randomUUID(),
        leadId: lead.id,
        queuedByUserId: input.queuedByUserId,
        assignedMailboxId: allocation.mailbox.id,
        status: "QUEUED",
        currentStep: "INITIAL",
        nextScheduledAt: timeline[0],
        sequenceConfigSnapshot: JSON.stringify(config),
        updatedAt: now,
      },
    });

    for (let index = 0; index < timeline.length; index++) {
      await prisma.outreachSequenceStep.create({
        data: {
          id: crypto.randomUUID(),
          sequenceId: sequence.id,
          stepNumber: index + 1,
          stepType: getStepType(index + 1),
          status: "SCHEDULED",
          scheduledFor: timeline[index],
          updatedAt: now,
        },
      });
    }

    result.queued.push({
      leadId: lead.id,
      sequenceId: sequence.id,
      mailboxId: allocation.mailbox.id,
    });
    pendingRecipientEmails.add(normalizedLeadEmail);
    activeRecipientEmails.add(normalizedLeadEmail);
    if (lead.outreachStatus !== READY_FOR_FIRST_TOUCH_STATUS) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { outreachStatus: READY_FOR_FIRST_TOUCH_STATUS },
      });
    }
    pendingAssignments.set(
      allocation.mailbox.id,
      (pendingAssignments.get(allocation.mailbox.id) || 0) + 1,
    );
  }

  return result;
}

async function getLeadMap(prisma: PrismaLike, leadIds: number[]) {
  if (leadIds.length === 0) return new Map<number, LeadRecord>();
  const leads: LeadRecord[] = [];
  for (const chunk of chunkArray(leadIds)) {
    const chunkLeads = (await prisma.lead.findMany({
      where: { id: { in: chunk } },
    })) as LeadRecord[];
    leads.push(...chunkLeads);
  }
  return new Map(leads.map((lead) => [lead.id, lead]));
}

async function getMailboxMap(prisma: PrismaLike, mailboxIds: string[]) {
  if (mailboxIds.length === 0) return new Map<string, OutreachMailboxRecord>();
  const mailboxes: OutreachMailboxRecord[] = [];
  for (const chunk of chunkArray(mailboxIds)) {
    const chunkMailboxes = (await prisma.outreachMailbox.findMany({
      where: { id: { in: chunk } },
    })) as OutreachMailboxRecord[];
    mailboxes.push(...chunkMailboxes);
  }
  return new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
}

async function getNextPendingStep(prisma: PrismaLike, sequenceId: string) {
  return prisma.outreachSequenceStep.findFirst({
    where: {
      sequenceId,
      status: { in: ["SCHEDULED", "CLAIMED", "SENDING"] },
    },
    orderBy: { stepNumber: "asc" },
  }) as Promise<OutreachSequenceStepRecord | null>;
}

async function getNextPendingStepMap(prisma: PrismaLike, sequenceIds: string[]) {
  const nextBySequenceId = new Map<string, OutreachSequenceStepRecord>();
  if (sequenceIds.length === 0) {
    return nextBySequenceId;
  }

  const pendingSteps: OutreachSequenceStepRecord[] = [];
  for (const chunk of chunkArray(sequenceIds)) {
    const chunkSteps = (await prisma.outreachSequenceStep.findMany({
      where: {
        sequenceId: { in: chunk },
        status: { in: ["SCHEDULED", "CLAIMED", "SENDING"] },
      },
    })) as OutreachSequenceStepRecord[];
    pendingSteps.push(...chunkSteps);
  }

  pendingSteps.sort((a, b) => {
    if (a.sequenceId !== b.sequenceId) {
      return a.sequenceId.localeCompare(b.sequenceId);
    }
    if (a.stepNumber !== b.stepNumber) {
      return a.stepNumber - b.stepNumber;
    }
    return (coerceDate(a.scheduledFor)?.getTime() || 0) - (coerceDate(b.scheduledFor)?.getTime() || 0);
  });

  for (const step of pendingSteps) {
    if (!nextBySequenceId.has(step.sequenceId)) {
      nextBySequenceId.set(step.sequenceId, step);
    }
  }

  return nextBySequenceId;
}

async function getSuppressionContextForLeads(prisma: PrismaLike, leads: Array<LeadRecord | null>) {
  const emails = new Set<string>();
  const domains = new Set<string>();

  for (const lead of leads) {
    if (!lead?.email) {
      continue;
    }
    const email = normalizeEmail(lead.email);
    const domain = getAutomationBusinessDomain(lead);
    if (email) emails.add(email);
    if (domain) domains.add(domain);
  }

  const suppressedEmails = new Set<string>();
  const suppressedDomains = new Set<string>();
  if (emails.size === 0 && domains.size === 0) {
    return { suppressedEmails, suppressedDomains };
  }

  const suppressions: OutreachSuppressionRecord[] = [];
  for (const chunk of chunkArray(Array.from(emails))) {
    const chunkSuppressions = (await prisma.outreachSuppression.findMany({
      where: { email: { in: chunk } },
    })) as OutreachSuppressionRecord[];
    suppressions.push(...chunkSuppressions);
  }
  for (const chunk of chunkArray(Array.from(domains))) {
    const chunkSuppressions = (await prisma.outreachSuppression.findMany({
      where: { domain: { in: chunk } },
    })) as OutreachSuppressionRecord[];
    suppressions.push(...chunkSuppressions);
  }

  for (const suppression of suppressions) {
    const email = normalizeEmail(suppression.email);
    const domain = normalizeEmail(suppression.domain);
    if (email) suppressedEmails.add(email);
    if (domain) suppressedDomains.add(domain);
  }

  return { suppressedEmails, suppressedDomains };
}

type SequenceRuntimeContext = {
  mailboxLoadById?: Map<string, { sentToday: number; sentThisHour: number }>;
  suppressedEmails?: Set<string>;
  suppressedDomains?: Set<string>;
};

export async function listAutomationOverview() {
  const prisma = getPrisma();
  const now = new Date();
  const settings = await getSettings(prisma);
  await syncMailboxesForGmailConnections().catch((error) => {
    console.warn("[automation] Failed to sync Gmail mailboxes before overview:", error);
  });
  const [mailboxes, sequences, recentRuns, ready, recentSentRaw] = await Promise.all([
    prisma.outreachMailbox.findMany({ orderBy: { updatedAt: "desc" } }) as Promise<OutreachMailboxRecord[]>,
    prisma.outreachSequence.findMany({ orderBy: { createdAt: "desc" }, take: 300 }) as Promise<OutreachSequenceRecord[]>,
    prisma.outreachRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }) as Promise<OutreachRunRecord[]>,
    listAutomationReadyLeads(prisma),
    prisma.outreachEmail.findMany({
      where: { status: "sent", sequenceId: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 12,
    }),
  ]);

  const sequenceIds = sequences.map((sequence) => sequence.id);
  const [leadMap, mailboxMap, nextStepMap] = await Promise.all([
    getLeadMap(prisma, Array.from(new Set(sequences.map((sequence) => sequence.leadId)))),
    getMailboxMap(prisma, Array.from(new Set(sequences.map((sequence) => sequence.assignedMailboxId).filter(Boolean) as string[]))),
    getNextPendingStepMap(prisma, sequenceIds),
  ]);

  const rawSummaries = sequences.map((sequence) => ({
    ...sequence,
    lead: leadMap.get(sequence.leadId) ?? null,
    mailbox: sequence.assignedMailboxId ? mailboxMap.get(sequence.assignedMailboxId) ?? null : null,
    nextStep: nextStepMap.get(sequence.id) ?? null,
  }));

  const mailboxStats = await Promise.all(
    mailboxes.map(async (mailbox) => ({
      ...mailbox,
      ...(await getMailboxLoad(prisma, mailbox.id, now)),
      nextAvailableAt: getMailboxNextAvailableAt(mailbox, settings, now),
    })),
  );

  const mailboxLoadById = new Map(
    mailboxStats.map((mailbox) => [mailbox.id, { sentToday: mailbox.sentToday, sentThisHour: mailbox.sentThisHour }]),
  );
  const suppressionContext = await getSuppressionContextForLeads(
    prisma,
    rawSummaries.map((sequence) => sequence.lead),
  );
  const runtimeContext: SequenceRuntimeContext = {
    mailboxLoadById,
    ...suppressionContext,
  };
  const summaries = await Promise.all(
    rawSummaries.map((sequence) => enrichSequenceSummary(prisma, sequence, settings, now, runtimeContext)),
  );

  const recentSentLeadMap = await getLeadMap(
    prisma,
    Array.from(new Set(recentSentRaw.map((email) => email.leadId).filter((value): value is number => typeof value === "number"))),
  );

  const recentSent = recentSentRaw.map((email) => ({
    id: email.id,
    sentAt: email.sentAt || new Date(),
    subject: email.subject,
    senderEmail: email.senderEmail,
    recipientEmail: email.recipientEmail,
    sequenceId: email.sequenceId,
    lead: email.leadId ? recentSentLeadMap.get(email.leadId) ?? null : null,
  }));

  const queued = summaries.filter((sequence) => sequence.state === "QUEUED");
  const active = summaries.filter((sequence) =>
    sequence.state === "SENDING" || sequence.state === "WAITING" || sequence.state === "BLOCKED",
  );
  const finished = summaries.filter((sequence) => sequence.state === "STOPPED" || sequence.state === "COMPLETED");
  const nextSendAt =
    summaries
      .map((sequence) => sequence.nextSendAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  const todayEnd = startOfDay(addMinutes(now, 24 * 60));
  const scheduledToday = summaries.filter(
    (sequence) =>
      sequence.nextSendAt &&
      sequence.nextSendAt.getTime() >= startOfDay(now).getTime() &&
      sequence.nextSendAt.getTime() < todayEnd.getTime(),
  ).length;
  const blockedCount = summaries.filter((sequence) => sequence.state === "BLOCKED").length;
  const sendingCount = summaries.filter((sequence) => sequence.state === "SENDING").length;
  const waitingCount = summaries.filter((sequence) => sequence.state === "WAITING").length;
  const repliedCount = summaries.filter((sequence) => sequence.blockerReason === "reply_detected").length;

  // Pipeline stage counts (for auto-pipeline visibility)
  const [needsEnrichCount, enrichingCount, enrichedCount, readyForTouchCount] = await Promise.all([
    prisma.lead.count({ where: { enrichedAt: null, enrichmentData: null, email: { not: null }, axiomScore: { not: null }, isArchived: false, outreachStatus: "NOT_CONTACTED" } }),
    prisma.lead.count({ where: { outreachStatus: "ENRICHING", isArchived: false } }),
    prisma.lead.count({ where: { outreachStatus: "ENRICHED", isArchived: false } }),
    prisma.lead.count({ where: { outreachStatus: READY_FOR_FIRST_TOUCH_STATUS, isArchived: false } }),
  ]);
  const sendReadyCount = enrichedCount + readyForTouchCount;

  return {
    settings,
    ready,
    mailboxes: mailboxStats,
    sequences: summaries,
    queued,
    active,
    finished,
    recentSent,
    engine: {
      mode: !settings.enabled ? "DISABLED" : settings.emergencyPaused ? "DISABLED" : settings.globalPaused ? "PAUSED" : "ACTIVE",
      nextSendAt,
      scheduledToday,
      blockedCount,
      replyStoppedCount: repliedCount,
      readyCount: ready.length,
      queuedCount: queued.length,
      waitingCount,
      sendingCount,
    },
    pipeline: {
      needsEnrichment: needsEnrichCount,
      enriching: enrichingCount,
      enriched: 0,
      readyForTouch: sendReadyCount,
    },
    recentRuns,
    stats: {
      ready: ready.length,
      queued: queued.length,
      sending: sendingCount,
      waiting: waitingCount,
      blocked: blockedCount,
      active: sendingCount + waitingCount + blockedCount,
      paused: summaries.filter((sequence) => sequence.status === "PAUSED").length,
      stopped: summaries.filter((sequence) => sequence.state === "STOPPED").length,
      completed: summaries.filter((sequence) => sequence.state === "COMPLETED").length,
      replied: repliedCount,
      scheduledToday,
    },
  } satisfies AutomationOverview;
}

export async function updateAutomationSettings(data: Partial<OutreachAutomationSettingRecord>) {
  const prisma = getPrisma();
  const settings = await getSettings(prisma);
  return prisma.outreachAutomationSetting.update({
    where: { id: settings.id },
    data,
  });
}

export async function updateMailbox(mailboxId: string, data: Partial<OutreachMailboxRecord>) {
  const prisma = getPrisma();
  return prisma.outreachMailbox.update({
    where: { id: mailboxId },
    data,
  });
}

async function stopSequenceInternal(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
  stopReason: string,
  replyDetectedAt?: Date,
) {
  await prisma.outreachSequence.update({
    where: { id: sequence.id },
    data: {
      status: "STOPPED",
      stopReason,
      replyDetectedAt: replyDetectedAt || sequence.replyDetectedAt,
      nextScheduledAt: null,
    },
  });

  await prisma.outreachSequenceStep.updateMany({
    where: {
      sequenceId: sequence.id,
      status: { in: ["SCHEDULED", "CLAIMED", "SENDING"] },
    },
    data: {
      status: stopReason === "REPLIED" ? "BLOCKED" : "SKIPPED",
      claimedAt: null,
      claimedByRunId: null,
      errorMessage: stopReason,
    },
  });

  const lead = await prisma.lead.findUnique({ where: { id: sequence.leadId } }) as LeadRecord | null;
  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        outreachStatus: stopReason === "REPLIED" ? "REPLIED" : lead.outreachStatus,
        outreachChannel: "EMAIL",
      },
    });
  }
}

export async function mutateSequence(
  sequenceId: string,
  action: "pause" | "resume" | "stop" | "remove",
) {
  const prisma = getPrisma();
  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
  }) as OutreachSequenceRecord | null;

  if (!sequence) {
    throw new Error("Automation sequence not found");
  }

  if (action === "pause") {
    return prisma.outreachSequence.update({
      where: { id: sequence.id },
      data: { status: "PAUSED", stopReason: "manual_pause" },
    });
  }

  if (action === "resume") {
    const nextStep = await getNextPendingStep(prisma, sequence.id);
    return prisma.outreachSequence.update({
      where: { id: sequence.id },
      data: {
        status: nextStep ? "ACTIVE" : "QUEUED",
        nextScheduledAt: nextStep?.scheduledFor ?? null,
        stopReason: null,
      },
    });
  }

  await stopSequenceInternal(prisma, sequence, "MANUAL");
  return prisma.outreachSequence.findUnique({ where: { id: sequence.id } });
}

async function canMailboxSend(prisma: PrismaLike, mailbox: OutreachMailboxRecord, now: Date, _config: OutreachSequenceConfig, liveSettings?: OutreachAutomationSettingRecord) {
  if (!MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
    return { allowed: false, reason: "mailbox_disabled" as AutomationBlockerReason };
  }

  // Use live settings for send window check if available, so window changes take effect immediately
  const windowConfig = liveSettings ? applyLiveSendWindowSettings(_config, liveSettings) : _config;
  if (!isWithinSendWindow(now, windowConfig)) {
    return { allowed: false, reason: "outside_send_window" as AutomationBlockerReason };
  }

  const { sentToday, sentThisHour } = await getMailboxLoad(prisma, mailbox.id, now);
  if (sentToday >= mailbox.dailyLimit) {
    return { allowed: false, reason: "daily_cap_reached" as AutomationBlockerReason };
  }
  if (sentThisHour >= mailbox.hourlyLimit) {
    return { allowed: false, reason: "hourly_cap_reached" as AutomationBlockerReason };
  }

  const lastSentAt = coerceDate(mailbox.lastSentAt);
  if (lastSentAt) {
    const minGapMs = mailbox.minDelaySeconds * 1000;
    if (now.getTime() - lastSentAt.getTime() < minGapMs) {
      return { allowed: false, reason: "mailbox_cooldown" as AutomationBlockerReason };
    }
  }

  return { allowed: true as const };
}

async function markReplyStop(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
  reply: ReplyDetectionResult,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: sequence.leadId },
  }) as LeadRecord | null;

  if (lead?.email) {
    await prisma.outreachSuppression.create({
      data: {
        id: crypto.randomUUID(),
        email: normalizeEmail(lead.email),
        domain: getAutomationBusinessDomain(lead),
        reason: `Reply detected from ${reply.inboundFrom || lead.email}`,
        source: "REPLY",
        leadId: lead.id,
        sequenceId: sequence.id,
      },
    }).catch(() => null);
  }

  await stopSequenceInternal(prisma, sequence, "REPLIED", new Date());
}

async function detectReplyForSequence(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
) {
  if (!sequence.assignedMailboxId || !sequence.lastSentAt) {
    return { detected: false } satisfies ReplyDetectionResult;
  }

  const mailbox = await prisma.outreachMailbox.findUnique({
    where: { id: sequence.assignedMailboxId },
  }) as OutreachMailboxRecord | null;
  if (!mailbox?.gmailConnectionId) {
    return { detected: false } satisfies ReplyDetectionResult;
  }

  const connection = await prisma.gmailConnection.findUnique({
    where: { id: mailbox.gmailConnectionId },
  }) as GmailConnectionRecord | null;
  if (!connection) {
    return { detected: false } satisfies ReplyDetectionResult;
  }

  const latestSentStep = await prisma.outreachSequenceStep.findFirst({
    where: {
      sequenceId: sequence.id,
      status: "SENT",
      gmailThreadId: { not: null },
    },
    orderBy: { sentAt: "desc" },
  }) as OutreachSequenceStepRecord | null;

  if (!latestSentStep?.gmailThreadId) {
    return { detected: false } satisfies ReplyDetectionResult;
  }

  const tokenResult = await getValidAccessToken(connection);
  if (tokenResult.updated) {
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: tokenResult.updated,
    });
  }

  const thread = await getGmailThreadMetadata(tokenResult.accessToken, latestSentStep.gmailThreadId);
  const lastSentAt = coerceDate(sequence.lastSentAt);
  const mailboxEmail = normalizeEmail(mailbox.gmailAddress);

  for (const message of thread.messages) {
    if (!message.internalDate) continue;
    const internalDate = new Date(Number(message.internalDate));
    if (!lastSentAt || internalDate.getTime() <= lastSentAt.getTime()) {
      continue;
    }

    const fromHeader = normalizeEmail(message.headers.from);
    if (!fromHeader || fromHeader.includes(mailboxEmail)) {
      continue;
    }

    return {
      detected: true,
      inboundMessageId: message.id,
      inboundFrom: message.headers.from,
      threadId: thread.id,
    } satisfies ReplyDetectionResult;
  }

  return { detected: false } satisfies ReplyDetectionResult;
}

export async function syncAutomationReplies() {
  const prisma = getPrisma();
  const settings = await getSettings(prisma);
  const staleBefore = addMinutes(new Date(), -settings.replySyncStaleMinutes);

  const mailboxes = await prisma.outreachMailbox.findMany({
    where: {
      OR: [
        { lastReplyCheckAt: null },
        { lastReplyCheckAt: { lte: staleBefore } },
      ],
      gmailConnectionId: { not: null },
    },
  }) as OutreachMailboxRecord[];

  let checked = 0;
  let stopped = 0;

  for (const mailbox of mailboxes) {
    const sequences = await prisma.outreachSequence.findMany({
      where: {
        assignedMailboxId: mailbox.id,
        status: { in: ["QUEUED", "ACTIVE", "SENDING"] },
        lastSentAt: { not: null },
      },
    }) as OutreachSequenceRecord[];

    if (sequences.length === 0) {
      await prisma.outreachMailbox.update({
        where: { id: mailbox.id },
        data: { lastReplyCheckAt: new Date() },
      });
      continue;
    }

    for (let i = 0; i < sequences.length; i += 5) {
      const batch = sequences.slice(i, i + 5);
      await Promise.all(
        batch.map(async (sequence) => {
          try {
            checked += 1;
            const reply = await detectReplyForSequence(prisma, sequence);
            if (reply.detected) {
              await markReplyStop(prisma, sequence, reply);
              stopped += 1;
            }
          } catch (error) {
            console.error(`[automation] Reply sync failed for sequence ${sequence.id}:`, error);
            if (isMailboxAuthFailure(error)) {
              await markMailboxDisconnected(prisma, mailbox.id);
            }
          }
        }),
      );
    }

    await prisma.outreachMailbox.update({
      where: { id: mailbox.id },
      data: { lastReplyCheckAt: new Date() },
    });
  }

  return { checked, stopped };
}

async function buildStepContext(
  prisma: PrismaLike,
  sequence: OutreachSequenceRecord,
  step: OutreachSequenceStepRecord,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: sequence.leadId },
  }) as LeadRecord | null;
  const mailbox = sequence.assignedMailboxId
    ? (await prisma.outreachMailbox.findUnique({ where: { id: sequence.assignedMailboxId } }) as OutreachMailboxRecord | null)
    : null;
  const previousStep = step.stepNumber > 1
    ? (await prisma.outreachSequenceStep.findFirst({
      where: {
        sequenceId: sequence.id,
        stepNumber: step.stepNumber - 1,
        status: "SENT",
      },
    }) as OutreachSequenceStepRecord | null)
    : null;

  if (!lead || !mailbox) {
    return null;
  }

  return {
    lead,
    mailbox,
    previousStep,
    sequence,
    step,
  } satisfies StepGenerationContext;
}

function getSenderName(mailbox: OutreachMailboxRecord) {
  return mailbox.label?.trim() || mailbox.gmailAddress.split("@")[0];
}

class AutomationSkipError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

class AutomationRetryableSendError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

class AutomationStoppedError extends Error {
  reason: AutomationBlockerReason;
  constructor(reason: AutomationBlockerReason) {
    super(reason);
    this.reason = reason;
  }
}

function classifySendFailure(error: unknown) {
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
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
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

function isMailboxAuthFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("invalid_grant") ||
    message.includes("refresh token") ||
    message.includes("gmail connection is missing")
  );
}

async function markMailboxDisconnected(prisma: PrismaLike, mailboxId: string) {
  await prisma.outreachMailbox.update({
    where: { id: mailboxId },
    data: { status: "DISCONNECTED", updatedAt: new Date() },
  }).catch((error) => {
    console.warn(`[automation] Failed to mark mailbox ${mailboxId} disconnected:`, error);
  });
}

async function sendScheduledStep(
  prisma: PrismaLike,
  claim: SchedulerClaim,
  runId: string,
) {
  const context = await buildStepContext(prisma, claim.sequence, claim.step);
  if (!context) {
    throw new Error("Sequence context could not be loaded");
  }

  if (await stopAlreadyContactedSequence(prisma, claim.sequence)) {
    throw new AutomationStoppedError("already_contacted");
  }

  const settings = await getSettings(prisma);
  if (settings.emergencyPaused) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "emergency_stop",
      },
    });
    throw new AutomationSkipError("emergency_stop");
  }

  const config = JSON.parse(claim.sequence.sequenceConfigSnapshot) as OutreachSequenceConfig;
  const liveConfig = applyLiveSendWindowSettings(config, settings);
  const connection = claim.mailbox.gmailConnectionId
    ? (await prisma.gmailConnection.findUnique({ where: { id: claim.mailbox.gmailConnectionId } }) as GmailConnectionRecord | null)
    : null;
  if (!connection) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
      },
    });
    throw new AutomationSkipError("mailbox_disconnected");
  }

  if (!context.lead.enrichmentData) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
      },
    });
    throw new AutomationSkipError("missing_enrichment");
  }

  if (!hasValidPipelineEmail(context.lead)) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
      },
    });
    throw new AutomationSkipError("missing_valid_email");
  }

  if (!isLeadOutreachEligible(context.lead)) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
      },
    });
    throw new AutomationSkipError("policy_ineligible");
  }

  // Defense-in-depth: refuse to send to generic role inboxes
  // (info@, contact@, sales@, etc.) at the moment of send, even if a sequence
  // somehow got created for one. Auto-queue already filters these, but a
  // legacy sequence could still exist.
  const sendEmailType = (context.lead.emailType || "").toLowerCase();
  if (sendEmailType === "generic") {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "generic_email_blocked",
      },
    });
    throw new AutomationSkipError("policy_ineligible");
  }

  // Send-time gate matches the adequate-lead threshold, so anything the
  // autonomous intake counts as adequate can move all the way to delivery.
  if (
    typeof context.lead.axiomScore !== "number" ||
    !Number.isFinite(context.lead.axiomScore) ||
    context.lead.axiomScore < AUTONOMOUS_SEND_MIN_SCORE
  ) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "below_send_min_score",
      },
    });
    throw new AutomationSkipError("below_send_min_score");
  }

  // Hard disqualifiers (gov / school / chain / blocked email domain).
  const hardDq = isHardDisqualified({
    businessName: context.lead.businessName,
    category: context.lead.category,
    email: context.lead.email,
  });
  if (hardDq.disqualified) {
    const reason = (hardDq.reason || "hard_disqualified") as AutomationBlockerReason;
    await stopSequenceInternal(prisma, claim.sequence, reason);
    throw new AutomationStoppedError(reason);
  }

  const recipientEmail = context.lead.email;
  if (!recipientEmail) {
    throw new AutomationSkipError("missing_valid_email");
  }

  // Exact-recipient safety: never start a second automated thread for an
  // address that already has a sent email. Follow-ups are allowed only when
  // they belong to already-sent steps in this same sequence.
  const allowedSentStepIds =
    claim.step.stepNumber > 1
      ? await getSentSequenceStepIds(prisma, claim.sequence.id)
      : [];
  const conflictingRecipientSend = await findConflictingSentEmailForRecipient(
    recipientEmail,
    claim.sequence.id,
    allowedSentStepIds,
  );
  if (conflictingRecipientSend) {
    await stopSequenceInternal(prisma, claim.sequence, "already_contacted");
    throw new AutomationStoppedError("already_contacted");
  }

  if (claim.step.stepNumber > 1) {
    const previousSentAt = coerceDate(context.previousStep?.sentAt);
    if (!previousSentAt) {
      await rescheduleFollowUpForEarliestWindow(
        prisma,
        claim.sequence,
        claim.step,
        adjustToAllowedSendWindow(addMinutes(new Date(), 60), liveConfig),
      );
      throw new AutomationSkipError("awaiting_follow_up_window");
    }

    const earliestFollowUpAt = getEarliestFollowUpSendAt(previousSentAt, claim.step.stepNumber, liveConfig);
    const scheduledFor = coerceDate(claim.step.scheduledFor);
    if (
      earliestFollowUpAt.getTime() > Date.now() ||
      !scheduledFor ||
      scheduledFor.getTime() < earliestFollowUpAt.getTime()
    ) {
      await rescheduleFollowUpForEarliestWindow(prisma, claim.sequence, claim.step, earliestFollowUpAt);
      throw new AutomationSkipError("awaiting_follow_up_window");
    }
  }

  const recipientDomain = getAutomationBusinessDomain(context.lead);
  if (recipientDomain) {
    const { getServerEnv: _getEnv } = await import("@/lib/env");
    const { getDatabase } = await import("@/lib/cloudflare");
    const cooldownDays = _getEnv().AUTONOMOUS_DOMAIN_COOLDOWN_DAYS;
    if (cooldownDays > 0) {
      const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
      const row = await getDatabase()
        .prepare(
          `SELECT 1 AS hit FROM "OutreachEmail"
           LEFT JOIN "Lead" sentLead ON sentLead."id" = "OutreachEmail"."leadId"
           WHERE "OutreachEmail"."status" = 'sent'
             AND "OutreachEmail"."sentAt" >= ?
             AND "OutreachEmail"."leadId" != ?
             AND (
               LOWER(COALESCE(sentLead."websiteDomain", '')) = ?
               OR LOWER(SUBSTR("OutreachEmail"."recipientEmail", INSTR("OutreachEmail"."recipientEmail", '@') + 1)) = ?
             )
           LIMIT 1`,
        )
        .bind(since.toISOString(), context.lead.id, recipientDomain, recipientDomain)
        .first<{ hit: number }>();
      if (row) {
        await prisma.outreachSequenceStep.update({
          where: { id: claim.step.id },
          data: {
            status: "SCHEDULED",
            claimedAt: null,
            claimedByRunId: null,
            errorMessage: "domain_cooldown_active",
            scheduledFor: addMinutes(new Date(), 60 * 24),
          },
        });
        throw new AutomationSkipError("domain_cooldown_active");
      }
    }
  }

  // Global daily cap across ALL mailboxes (separate from per-mailbox cap).
  // Default matches two warmed mailboxes at 40/day each.
  const { getServerEnv: _envFn } = await import("@/lib/env");
  const globalCap = _envFn().AUTONOMOUS_MAX_SENDS_PER_DAY;
  if (globalCap > 0) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const sentToday = await prisma.outreachEmail.count({
      where: { status: "sent", sentAt: { gte: startOfDay } },
    });
    if (sentToday >= globalCap) {
      const now = new Date();
      const nextAttempt = await getRateLimitRecheckAt(
        prisma,
        claim,
        "global_daily_cap_reached",
        liveConfig,
        now,
      );
      await prisma.outreachSequenceStep.update({
        where: { id: claim.step.id },
        data: {
          status: "SCHEDULED",
          claimedAt: null,
          claimedByRunId: null,
          errorMessage: "global_daily_cap_reached",
          scheduledFor: nextAttempt,
        },
      });
      throw new AutomationSkipError("global_daily_cap_reached");
    }
  }

  const suppression = await prisma.outreachSuppression.findFirst({
    where: {
      OR: [
        { email: normalizeEmail(context.lead.email) },
        { domain: getAutomationBusinessDomain(context.lead) },
      ],
    },
  });
  if (suppression) {
    await stopSequenceInternal(prisma, claim.sequence, "SUPPRESSED");
    throw new AutomationStoppedError("suppressed");
  }

  const mailboxGate = await canMailboxSend(prisma, claim.mailbox, new Date(), config, settings);
  if (!mailboxGate.allowed) {
    const now = new Date();
    const nextAttempt = await getRateLimitRecheckAt(prisma, claim, mailboxGate.reason, liveConfig, now);
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        scheduledFor: nextAttempt,
      },
    });
    throw new AutomationSkipError(mailboxGate.reason);
  }

  await prisma.outreachSequence.update({
    where: { id: claim.sequence.id },
    data: {
      status: "SENDING",
      currentStep: claim.step.stepType,
      nextScheduledAt: claim.step.scheduledFor,
    },
  });

  await prisma.outreachSequenceStep.update({
    where: { id: claim.step.id },
    data: {
      status: "SENDING",
      attemptCount: { increment: 1 },
    },
  });

  const tokenResult = await getValidAccessToken(connection);
  if (tokenResult.updated) {
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: tokenResult.updated,
    });
  }

  const senderName = getSenderName(claim.mailbox);
  let email: Awaited<ReturnType<typeof generateSequenceStepEmail>>;
  try {
    email = await generateSequenceStepEmail(
      context.lead,
      config.enrichmentSnapshot as Parameters<typeof generateSequenceStepEmail>[1],
      senderName,
      claim.step.stepType as OutreachSequenceStepType,
      context.previousStep
        ? {
            subject: context.previousStep.subject || "",
            bodyPlain: context.previousStep.bodyPlain || "",
            sentAt: context.previousStep.sentAt || context.previousStep.createdAt,
          }
        : undefined,
    );
  } catch {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "generation_failed_retryable",
      },
    });
    throw new AutomationRetryableSendError("generation_failed_retryable");
  }

  let sendResult: Awaited<ReturnType<typeof sendGmailEmail>>;
  try {
    sendResult = await sendGmailEmail({
      accessToken: tokenResult.accessToken,
      from: claim.mailbox.gmailAddress,
      fromName: senderName,
      to: recipientEmail,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyPlain: email.bodyPlain,
      threadId: context.previousStep?.gmailThreadId || undefined,
    });
  } catch (error) {
    const classification = classifySendFailure(error);
    if (classification.kind === "retryable") {
      throw new AutomationRetryableSendError(classification.reason);
    }
    if (classification.kind === "blocked") {
      throw new AutomationSkipError(classification.reason);
    }
    await stopSequenceInternal(prisma, claim.sequence, classification.reason.toUpperCase());
    throw new AutomationStoppedError(classification.reason);
  }

  const sentAt = new Date();
  await prisma.outreachSequenceStep.update({
    where: { id: claim.step.id },
    data: {
      status: "SENT",
      sentAt,
      gmailMessageId: sendResult.messageId,
      gmailThreadId: sendResult.threadId || context.previousStep?.gmailThreadId || null,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyPlain: email.bodyPlain,
      generationModel: "deepseek-chat",
      claimedByRunId: runId,
    },
  });

  await prisma.outreachEmail.create({
    data: {
      id: crypto.randomUUID(),
      leadId: context.lead.id,
      senderUserId: claim.mailbox.userId,
      senderEmail: claim.mailbox.gmailAddress,
      mailboxId: claim.mailbox.id,
      sequenceId: claim.sequence.id,
      sequenceStepId: claim.step.id,
      recipientEmail: recipientEmail,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyPlain: email.bodyPlain,
      gmailMessageId: sendResult.messageId,
      gmailThreadId: sendResult.threadId || context.previousStep?.gmailThreadId || null,
      status: "sent",
      sentAt,
    },
  });

  const nextStep = await prisma.outreachSequenceStep.findFirst({
    where: {
      sequenceId: claim.sequence.id,
      stepNumber: claim.step.stepNumber + 1,
    },
  }) as OutreachSequenceStepRecord | null;
  const nextStepScheduledFor = nextStep
    ? getEarliestFollowUpSendAt(sentAt, nextStep.stepNumber, liveConfig)
    : null;

  if (nextStep && nextStepScheduledFor) {
    await prisma.outreachSequenceStep.update({
      where: { id: nextStep.id },
      data: {
        status: "SCHEDULED",
        scheduledFor: nextStepScheduledFor,
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: null,
      },
    });
  }

  await prisma.outreachMailbox.update({
    where: { id: claim.mailbox.id },
    data: { lastSentAt: sentAt },
  });

  await prisma.lead.update({
    where: { id: context.lead.id },
    data: {
      outreachStatus: "OUTREACHED",
      outreachChannel: "EMAIL",
      firstContactedAt: context.lead.firstContactedAt || sentAt,
      lastContactedAt: sentAt,
      nextFollowUpDue: nextStepScheduledFor,
    },
  });

  if (!nextStep) {
    await prisma.outreachSequence.update({
      where: { id: claim.sequence.id },
      data: {
        status: "COMPLETED",
        currentStep: claim.step.stepType,
        lastSentAt: sentAt,
        nextScheduledAt: null,
        stopReason: "EXHAUSTED",
      },
    });
  } else {
    await prisma.outreachSequence.update({
      where: { id: claim.sequence.id },
      data: {
        status: "ACTIVE",
        currentStep: nextStep.stepType,
        lastSentAt: sentAt,
        nextScheduledAt: nextStepScheduledFor,
        stopReason: null,
      },
    });
  }
}

async function recoverStaleClaims(prisma: PrismaLike) {
  const staleThreshold = addMinutes(new Date(), -2);
  const staleClaims = await prisma.outreachSequenceStep.findMany({
    where: {
      status: { in: ["CLAIMED", "SENDING"] },
      OR: [
        { claimedAt: { lte: staleThreshold } },
        { claimedAt: null },
      ],
    },
    take: 100,
  }) as OutreachSequenceStepRecord[];

  for (const step of staleClaims) {
    await prisma.outreachSequenceStep.update({
      where: { id: step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "stale_claim_recovered",
      },
    }).catch(() => null);
  }

  return staleClaims.length;
}

async function cleanupTerminalSequenceSteps(prisma: PrismaLike) {
  const terminalSequences = (await prisma.outreachSequence.findMany({
    where: {
      status: { in: [...TERMINAL_SEQUENCE_STATUSES] },
    },
    select: { id: true },
    take: 1000,
  })) as Array<{ id: string }>;

  if (terminalSequences.length === 0) {
    return 0;
  }

  const terminalSequenceIds = terminalSequences.map((sequence) => sequence.id);
  let cleanedCount = 0;
  for (const chunk of chunkArray(terminalSequenceIds)) {
    const cleaned = await prisma.outreachSequenceStep.updateMany({
      where: {
        sequenceId: { in: chunk },
        status: { in: ["SCHEDULED", "CLAIMED", "SENDING"] },
      },
      data: {
        status: "SKIPPED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: "terminal_sequence_cleaned",
      },
    });
    cleanedCount += cleaned.count;

    await prisma.outreachSequence.updateMany({
      where: {
        id: { in: chunk },
        nextScheduledAt: { not: null },
      },
      data: {
        nextScheduledAt: null,
      },
    }).catch(() => null);
  }

  return cleanedCount;
}

async function fastForwardInitialTouches(prisma: PrismaLike, now: Date) {
  const initialSteps = (await prisma.outreachSequenceStep.findMany({
    where: {
      stepNumber: 1,
      status: "SCHEDULED",
      scheduledFor: { gt: now },
    },
    select: { id: true, sequenceId: true },
    take: 500,
  })) as Array<Pick<OutreachSequenceStepRecord, "id" | "sequenceId">>;

  if (initialSteps.length === 0) return 0;

  const candidateSequenceIds = Array.from(new Set(initialSteps.map((step) => step.sequenceId)));
  const activeSequences: Array<{ id: string }> = [];
  for (const chunk of chunkArray(candidateSequenceIds)) {
    const rows = (await prisma.outreachSequence.findMany({
      where: {
        id: { in: chunk },
        status: { in: [...ACTIVE_SEQUENCE_STATUSES] },
        nextScheduledAt: { gt: now },
      },
      select: { id: true },
    })) as Array<{ id: string }>;
    activeSequences.push(...rows);
  }

  const activeSequenceIds = new Set(activeSequences.map((sequence) => sequence.id));
  const stepIds = initialSteps
    .filter((step) => activeSequenceIds.has(step.sequenceId))
    .map((step) => step.id);
  const sequenceIds = Array.from(new Set(initialSteps
    .filter((step) => activeSequenceIds.has(step.sequenceId))
    .map((step) => step.sequenceId)));

  if (stepIds.length === 0 || sequenceIds.length === 0) return 0;

  let updatedCount = 0;
  for (const chunk of chunkArray(stepIds)) {
    const updated = await prisma.outreachSequenceStep.updateMany({
      where: {
        id: { in: chunk },
        stepNumber: 1,
        status: "SCHEDULED",
        scheduledFor: { gt: now },
      },
      data: {
        scheduledFor: now,
      },
    });
    updatedCount += updated.count;
  }

  if (updatedCount > 0) {
    for (const chunk of chunkArray(sequenceIds)) {
      await prisma.outreachSequence.updateMany({
        where: {
          id: { in: chunk },
          status: { in: [...ACTIVE_SEQUENCE_STATUSES] },
          nextScheduledAt: { gt: now },
        },
        data: { nextScheduledAt: now },
      });
    }
  }

  return updatedCount;
}

async function claimDueSteps(prisma: PrismaLike, runId: string, batchSize: number) {
  const cleanedTerminalSteps = await cleanupTerminalSequenceSteps(prisma);
  if (cleanedTerminalSteps > 0) {
    console.log(`[scheduler] Cleaned ${cleanedTerminalSteps} terminal sequence steps`);
  }

  // First recover any stale claims from crashed runs
  const recovered = await recoverStaleClaims(prisma);
  if (recovered > 0) {
    console.log(`[scheduler] Recovered ${recovered} stale claimed steps`);
  }

  const now = new Date();
  const settings = await getSettings(prisma);
  const dueStepScanLimit = Math.max(batchSize * 50, 500);
  const [initialDueSteps, followUpDueSteps] = await Promise.all([
    prisma.outreachSequenceStep.findMany({
      where: {
        status: "SCHEDULED",
        stepNumber: 1,
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: "asc" },
      take: dueStepScanLimit,
    }) as Promise<OutreachSequenceStepRecord[]>,
    prisma.outreachSequenceStep.findMany({
      where: {
        status: "SCHEDULED",
        stepNumber: { not: 1 },
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: "asc" },
      take: dueStepScanLimit,
    }) as Promise<OutreachSequenceStepRecord[]>,
  ]);
  const dueSteps = initialDueSteps.length > 0 ? initialDueSteps : followUpDueSteps;

  const claims: SchedulerClaim[] = [];
  // Track per-mailbox claims to ensure equal distribution
  const mailboxClaimCounts = new Map<string, number>();

  for (const step of dueSteps) {
    const sequence = await prisma.outreachSequence.findUnique({
      where: { id: step.sequenceId },
    }) as OutreachSequenceRecord | null;
    if (!sequence || !sequence.assignedMailboxId) {
      continue;
    }
    if (TERMINAL_SEQUENCE_STATUSES.includes(sequence.status as (typeof TERMINAL_SEQUENCE_STATUSES)[number])) {
      await prisma.outreachSequenceStep.update({
        where: { id: step.id },
        data: {
          status: "SKIPPED",
          claimedAt: null,
          claimedByRunId: null,
          errorMessage: "terminal_sequence_cleaned",
        },
      }).catch(() => null);
      continue;
    }
    if (!CLAIMABLE_SEQUENCE_STATUSES.includes(sequence.status as (typeof CLAIMABLE_SEQUENCE_STATUSES)[number])) {
      continue;
    }
    if (await stopDuplicateSiblingSequences(prisma, sequence)) {
      continue;
    }

    const mailbox = await prisma.outreachMailbox.findUnique({
      where: { id: sequence.assignedMailboxId },
    }) as OutreachMailboxRecord | null;
    if (!mailbox) {
      continue;
    }
    if (!mailbox.gmailConnectionId || !MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
      continue;
    }

    const nextPendingStep = await getNextPendingStep(prisma, sequence.id);
    if (!nextPendingStep || nextPendingStep.id !== step.id) {
      continue;
    }

    const sequenceConfig = JSON.parse(sequence.sequenceConfigSnapshot) as OutreachSequenceConfig;
    const liveSequenceConfig = applyLiveSendWindowSettings(sequenceConfig, settings);
    if (await rescheduleFollowUpIfTooEarly(prisma, sequence, step, liveSequenceConfig, now)) {
      continue;
    }

    // Fair distribution: one claim per mailbox per cron tick. The scheduler
    // runs every minute and send-time gates enforce cooldown/hour/day caps.
    // Claiming more than one per mailbox creates stuck CLAIMED rows when any
    // external provider call hangs.
    const currentMailboxClaims = mailboxClaimCounts.get(mailbox.id) || 0;
    const maxPerMailbox = 1;
    if (currentMailboxClaims >= maxPerMailbox) {
      continue;
    }

    const updateResult = await prisma.outreachSequenceStep.updateMany({
      where: {
        id: step.id,
        status: "SCHEDULED",
      },
      data: {
        status: "CLAIMED",
        claimedAt: now,
        claimedByRunId: runId,
      },
    }).catch(() => ({ count: 0 }));

    if (updateResult.count === 0) {
      continue;
    }

    const updated = { ...step, status: "CLAIMED" as const, claimedAt: now, claimedByRunId: runId };
    claims.push({ sequence, step: updated, mailbox });
    mailboxClaimCounts.set(mailbox.id, currentMailboxClaims + 1);

    if (claims.length >= batchSize) {
      break;
    }
  }

  return claims;
}

async function rescheduleClaimStep(
  prisma: PrismaLike,
  claim: SchedulerClaim,
  minutes: number,
  reason: AutomationBlockerReason,
) {
  const config = JSON.parse(claim.sequence.sequenceConfigSnapshot) as OutreachSequenceConfig;
  const liveSettings = await getSettings(prisma);
  const windowConfig: OutreachSequenceConfig = {
    ...config,
    weekdaysOnly: liveSettings.weekdaysOnly,
    sendWindowStartHour: liveSettings.sendWindowStartHour,
    sendWindowStartMinute: liveSettings.sendWindowStartMinute,
    sendWindowEndHour: liveSettings.sendWindowEndHour,
    sendWindowEndMinute: liveSettings.sendWindowEndMinute,
  };
  const nextAttempt = adjustToAllowedSendWindow(addMinutes(new Date(), minutes), windowConfig);
  await prisma.outreachSequenceStep.update({
    where: { id: claim.step.id },
    data: {
      status: "SCHEDULED",
      claimedAt: null,
      claimedByRunId: null,
      scheduledFor: nextAttempt,
      errorMessage: reason,
    },
  });
  await prisma.outreachSequence.update({
    where: { id: claim.sequence.id },
    data: {
      status: claim.sequence.lastSentAt ? "ACTIVE" : "QUEUED",
      nextScheduledAt: nextAttempt,
      stopReason: reason,
    },
  });
}

async function setSequenceBlocked(
  prisma: PrismaLike,
  claim: SchedulerClaim,
  reason: AutomationBlockerReason,
) {
  if (isTerminalSendBlocker(reason)) {
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SKIPPED",
        claimedAt: null,
        claimedByRunId: null,
        errorMessage: reason,
      },
    }).catch(() => null);

    await stopSequenceInternal(prisma, claim.sequence, reason.toUpperCase()).catch(() => null);
    return;
  }

  const now = new Date();
  const latestStep = await prisma.outreachSequenceStep.findUnique({
    where: { id: claim.step.id },
  }) as OutreachSequenceStepRecord | null;
  const latestScheduledFor = coerceDate(latestStep?.scheduledFor);
  const recheckAt =
    latestScheduledFor && latestScheduledFor.getTime() > now.getTime()
      ? latestScheduledFor
      : addMinutes(now, getBlockedRecheckDelayMinutes(reason, claim.mailbox));

  await prisma.outreachSequenceStep.update({
    where: { id: claim.step.id },
    data: {
      status: "SCHEDULED",
      claimedAt: null,
      claimedByRunId: null,
      errorMessage: reason,
      scheduledFor: recheckAt,
    },
  }).catch(() => null);

  await prisma.outreachSequence.update({
    where: { id: claim.sequence.id },
    data: {
      status: claim.sequence.lastSentAt ? "ACTIVE" : "QUEUED",
      nextScheduledAt: recheckAt,
      stopReason: reason,
    },
  }).catch(() => null);
}

export async function runAutomationScheduler(options: { immediate?: boolean } = {}) {
  const { runAutoPipeline } = await import("@/lib/auto-pipeline");
  const { getServerEnv } = await import("@/lib/env");
  const env = getServerEnv();
  const prisma = getPrisma();
  await syncMailboxesForGmailConnections().catch((error) => {
    console.warn("[scheduler] Failed to sync Gmail mailboxes before run:", error);
  });
  const settings = await getSettings(prisma);
  const now = new Date();
  const staleRunThreshold = addMinutes(now, -5);

  const staleRuns = await prisma.outreachRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lte: staleRunThreshold },
    },
  }) as OutreachRunRecord[];
  await Promise.all(staleRuns.map((staleRun) => prisma.outreachRun.update({
    where: { id: staleRun.id },
    data: {
      status: "FAILED",
      finishedAt: now,
      metadata: JSON.stringify({
        source: "scheduler",
        error: "stale running run recovered before scheduler start",
      }),
    },
  }))).catch((error) => {
    console.warn("[scheduler] Failed to recover stale running runs:", error);
  });

  const activeRun = await prisma.outreachRun.findFirst({
    where: {
      status: "RUNNING",
      startedAt: { gt: staleRunThreshold },
    },
    orderBy: { startedAt: "desc" },
  }) as OutreachRunRecord | null;

  if (activeRun && !options.immediate) {
    console.log(`[scheduler] Skipped because run ${activeRun.id} is still active`);
    return {
      runId: "skipped-active-run",
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pipeline: { enriched: 0, enrichFailed: 0, qualified: 0, queued: 0, queueSkipped: 0 },
      replySync: { checked: 0, stopped: 0 },
    };
  }

  // Master kill switch — when scheduler kill switch is off, no enrich /
  // qualify / queue / send happens at all.
  if (!env.AUTONOMOUS_QUEUE_ENABLED && !env.AUTONOMOUS_SEND_ENABLED) {
    console.log("[scheduler] Skipped — both AUTONOMOUS_QUEUE_ENABLED and AUTONOMOUS_SEND_ENABLED are false");
    return {
      runId: "skipped",
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pipeline: { enriched: 0, enrichFailed: 0, qualified: 0, queued: 0, queueSkipped: 0 },
      replySync: { checked: 0, stopped: 0 },
    };
  }

  if (settings.emergencyPaused) {
    console.log("[scheduler] Skipped — emergency kill switch is active");
    return {
      runId: "skipped-emergency-stop",
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pipeline: { enriched: 0, enrichFailed: 0, qualified: 0, queued: 0, queueSkipped: 0 },
      replySync: { checked: 0, stopped: 0 },
    };
  }

  console.log(
    `[scheduler] Run starting at ${now.toISOString()} | enabled=${settings.enabled} paused=${settings.globalPaused} emergency=${settings.emergencyPaused}`,
  );

  const run = await prisma.outreachRun.create({
    data: {
      id: crypto.randomUUID(),
      startedAt: now,
      status: "RUNNING",
      metadata: JSON.stringify({ source: "scheduler" }),
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let fastForwardedCount = 0;
  let pipeline = { enriched: 0, enrichFailed: 0, qualified: 0, queued: 0, queueSkipped: 0 };

  try {
    if (!settings.enabled || settings.globalPaused) {
      await prisma.outreachRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: "SKIPPED",
          metadata: JSON.stringify({
            source: "scheduler",
            reason: settings.globalPaused ? "globalPaused" : "disabled",
          }),
        },
      });
      return {
        runId: run.id,
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pipeline,
        replySync: { checked: 0, stopped: 0 },
      };
    }

    // Auto-pipeline: enrich → qualify → queue new leads (gated by kill switch)
    if (env.AUTONOMOUS_QUEUE_ENABLED) {
      try {
        pipeline = await runAutoPipeline("system");
      } catch (pipelineError) {
        console.error("[scheduler] Auto-pipeline error (non-fatal):", pipelineError);
      }
    } else {
      console.log("[scheduler] AUTONOMOUS_QUEUE_ENABLED=false — skipping enrich/qualify/queue");
    }

    const replySync = await syncAutomationReplies();

    // Send loop is gated by AUTONOMOUS_SEND_ENABLED (default OFF). When off
    // we still run reply-sync and pipeline, but don't claim or send any
    // sequence steps.
    if (!env.AUTONOMOUS_SEND_ENABLED) {
      console.log("[scheduler] AUTONOMOUS_SEND_ENABLED=false — skipping send loop");
      await prisma.outreachRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: "OK",
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          claimedCount: 0,
          metadata: JSON.stringify({
            source: "scheduler",
            reason: "send_kill_switch_off",
            pipeline,
            replySync,
          }),
        },
      });
      return {
        runId: run.id,
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pipeline,
        replySync,
      };
    }

    const liveSettings = await getAutomationSettings(prisma);
    if (liveSettings.emergencyPaused) {
      await prisma.outreachRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: "SKIPPED",
          metadata: JSON.stringify({
            source: "scheduler",
            reason: "emergency_stop",
            pipeline,
            replySync,
          }),
        },
      });
      return {
        runId: run.id,
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pipeline,
        replySync,
      };
    }

    fastForwardedCount = await fastForwardInitialTouches(prisma, now);
    const claims = await claimDueSteps(prisma, run.id, settings.schedulerClaimBatch);

    console.log(`[scheduler] Pipeline: ${JSON.stringify(pipeline)} | Replies: checked=${replySync.checked} stopped=${replySync.stopped} | Fast-forwarded: ${fastForwardedCount} | Claims: ${claims.length}`);

    const { recordSendDecision } = await import("@/lib/send-decisions");

    for (const claim of claims) {
      const decisionLead = await prisma.lead.findUnique({
        where: { id: claim.sequence.leadId },
        select: {
          email: true,
          axiomScore: true,
          axiomTier: true,
          emailType: true,
        },
      }) as Pick<LeadRecord, "email" | "axiomScore" | "axiomTier" | "emailType"> | null;
      const baseDecision = {
        leadId: claim.sequence.leadId,
        sequenceId: claim.sequence.id,
        stepId: claim.step.id,
        mailboxId: claim.mailbox.id,
        senderEmail: claim.mailbox.gmailAddress,
        recipientEmail: normalizeEmail(decisionLead?.email),
        axiomScore: decisionLead?.axiomScore ?? null,
        axiomTier: decisionLead?.axiomTier ?? null,
        emailType: decisionLead?.emailType ?? null,
      };
      try {
        await sendScheduledStep(prisma, claim, run.id);
        sentCount += 1;
        await recordSendDecision({
          ...baseDecision,
          decision: "SENT",
          reason: null,
        });
        console.log(`[scheduler] SENT step ${claim.step.stepNumber} for sequence ${claim.sequence.id} (lead ${claim.sequence.leadId})`);
      } catch (error) {
        if (error instanceof AutomationSkipError) {
          skippedCount += 1;
          if (error.reason === "mailbox_disconnected") {
            await markMailboxDisconnected(prisma, claim.mailbox.id);
          }
          if (error.reason === "awaiting_follow_up_window") {
            await recordSendDecision({
              ...baseDecision,
              decision: "SKIPPED",
              reason: error.reason,
            });
            continue;
          }
          await recordSendDecision({
            ...baseDecision,
            decision: "BLOCKED",
            reason: error.reason,
          });
          await setSequenceBlocked(prisma, claim, error.reason);
          continue;
        }

        if (error instanceof AutomationStoppedError) {
          skippedCount += 1;
          await recordSendDecision({
            ...baseDecision,
            decision: "SKIPPED",
            reason: error.reason,
          });
          continue;
        }

        if (error instanceof AutomationRetryableSendError) {
          failedCount += 1;
          const latestStep = await prisma.outreachSequenceStep.findUnique({
            where: { id: claim.step.id },
          }) as OutreachSequenceStepRecord | null;
          const attemptCount = latestStep?.attemptCount || claim.step.attemptCount || 0;
          if (attemptCount <= 1) {
            await rescheduleClaimStep(prisma, claim, 15, error.reason);
          } else if (attemptCount <= 2) {
            await rescheduleClaimStep(prisma, claim, 60, error.reason);
          } else {
            await setSequenceBlocked(prisma, claim, error.reason);
          }
          continue;
        }

        const classification = classifySendFailure(error);
        if (classification.kind === "retryable") {
          failedCount += 1;
          const latestStep = await prisma.outreachSequenceStep.findUnique({
            where: { id: claim.step.id },
          }) as OutreachSequenceStepRecord | null;
          const attemptCount = latestStep?.attemptCount || claim.step.attemptCount || 0;
          if (attemptCount <= 1) {
            await rescheduleClaimStep(prisma, claim, 15, classification.reason);
          } else if (attemptCount <= 2) {
            await rescheduleClaimStep(prisma, claim, 60, classification.reason);
          } else {
            await setSequenceBlocked(prisma, claim, classification.reason);
          }
          continue;
        }

        if (classification.kind === "blocked") {
          failedCount += 1;
          if (classification.reason === "mailbox_disconnected") {
            await markMailboxDisconnected(prisma, claim.mailbox.id);
          }
          await setSequenceBlocked(prisma, claim, classification.reason);
          continue;
        }

        failedCount += 1;
        await stopSequenceInternal(prisma, claim.sequence, classification.reason.toUpperCase());
      }
    }

    await prisma.outreachRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "COMPLETED",
        claimedCount: claims.length,
        sentCount,
        failedCount,
        skippedCount,
        metadata: JSON.stringify({
          source: "scheduler",
          replySync,
          pipeline,
          fastForwarded: fastForwardedCount,
        }),
      },
    });

    return {
      runId: run.id,
      claimed: claims.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      fastForwarded: fastForwardedCount,
      pipeline,
      replySync,
    };
  } catch (error) {
    await prisma.outreachRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        claimedCount: 0,
        sentCount,
        failedCount: failedCount + 1,
        skippedCount,
        metadata: JSON.stringify({
          source: "scheduler",
          error: error instanceof Error ? error.message : String(error),
        }),
      },
    }).catch(() => null);
    throw error;
  }
}
