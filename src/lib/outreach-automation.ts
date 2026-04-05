import {
  generateSequenceStepEmail,
  type OutreachSequenceStepType,
} from "@/lib/outreach-email-generator";
import { getValidAccessToken, getGmailThreadMetadata, sendGmailEmail } from "@/lib/gmail";
import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { getPrisma } from "@/lib/prisma";
import { READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import type {
  GmailConnectionRecord,
  LeadRecord,
  OutreachAutomationSettingRecord,
  OutreachMailboxRecord,
  OutreachRunRecord,
  OutreachSequenceRecord,
  OutreachSequenceStepRecord,
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

type MailboxLoad = {
  sentToday: number;
  sentThisHour: number;
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
  | "manual_pause"
  | "global_pause"
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
  | "send_failed_retryable";

const ACTIVE_SEQUENCE_STATUSES = ["QUEUED", "ACTIVE", "PAUSED", "SENDING"] as const;
const MAILBOX_SENDABLE_STATUSES = ["ACTIVE", "WARMING"] as const;

function normalizeEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
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

function isWeekendInTimezone(date: Date, timeZone: string) {
  const weekday = getLocalDateParts(date, timeZone).weekday;
  return weekday === "Sat" || weekday === "Sun";
}

function setMinutesInTimezone(base: Date, timeZone: string, targetHour: number, targetMinute: number) {
  const local = getLocalDateParts(base, timeZone);
  const utcGuess = Date.UTC(local.year, local.month - 1, local.day, targetHour, targetMinute, 0);
  return new Date(utcGuess);
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
  const known: AutomationBlockerReason[] = [
    "reply_detected",
    "suppressed",
    "manual_pause",
    "global_pause",
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
  ];
  return known.includes(normalized as AutomationBlockerReason)
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
  }
}

const BLOCKER_PRECEDENCE: AutomationBlockerReason[] = [
  "reply_detected",
  "suppressed",
  "manual_pause",
  "global_pause",
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
];

function getPrimaryBlocker(blockers: AutomationBlockerReason[]) {
  if (blockers.length === 0) return null;
  const deduped = Array.from(new Set(blockers));
  deduped.sort((a, b) => BLOCKER_PRECEDENCE.indexOf(a) - BLOCKER_PRECEDENCE.indexOf(b));
  return deduped[0] || null;
}

function isWithinSendWindow(date: Date, config: OutreachSequenceConfig) {
  const parts = getLocalDateParts(date, config.timezone);
  const localMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = config.sendWindowStartHour * 60 + config.sendWindowStartMinute;
  const endMinutes = config.sendWindowEndHour * 60 + config.sendWindowEndMinute;

  if (config.weekdaysOnly && (parts.weekday === "Sat" || parts.weekday === "Sun")) {
    return false;
  }

  return localMinutes >= startMinutes && localMinutes <= endMinutes;
}

function adjustToAllowedSendWindow(date: Date, config: OutreachSequenceConfig) {
  let candidate = new Date(date);

  for (let attempts = 0; attempts < 48; attempts++) {
    const parts = getLocalDateParts(candidate, config.timezone);
    const localMinutes = parts.hour * 60 + parts.minute;
    const startMinutes = config.sendWindowStartHour * 60 + config.sendWindowStartMinute;
    const endMinutes = config.sendWindowEndHour * 60 + config.sendWindowEndMinute;

    if (config.weekdaysOnly && (parts.weekday === "Sat" || parts.weekday === "Sun")) {
      candidate = setMinutesInTimezone(addMinutes(candidate, 24 * 60), config.timezone, config.sendWindowStartHour, config.sendWindowStartMinute);
      continue;
    }

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

function addBusinessDays(date: Date, businessDays: number, timeZone: string) {
  let candidate = new Date(date);
  let remaining = businessDays;

  while (remaining > 0) {
    candidate = addMinutes(candidate, 24 * 60);
    if (!isWeekendInTimezone(candidate, timeZone)) {
      remaining -= 1;
    }
  }

  return candidate;
}

function getStepType(stepNumber: number): OutreachSequenceStepType {
  if (stepNumber === 1) return "INITIAL";
  if (stepNumber === 2) return "FOLLOW_UP_1";
  return "FOLLOW_UP_2";
}

async function getSettings(prisma: PrismaLike) {
  const existing = await prisma.outreachAutomationSetting.findUnique({
    where: { id: "global" },
  });

  if (existing) {
    return existing;
  }

  return prisma.outreachAutomationSetting.create({
    data: {
      id: "global",
      updatedAt: new Date(),
    },
  });
}

export async function ensureMailboxForConnection(
  connection: GmailConnectionRecord,
  options?: { label?: string; timezone?: string; status?: string },
) {
  const prisma = getPrisma();
  const existing = await prisma.outreachMailbox.findFirst({
    where: { gmailAddress: connection.gmailAddress },
  });

  const data = {
    userId: connection.userId,
    gmailConnectionId: connection.id,
    gmailAddress: connection.gmailAddress,
    label: options?.label ?? connection.gmailAddress.split("@")[0],
    timezone: options?.timezone ?? "America/Toronto",
    status: options?.status ?? "WARMING",
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
  if (!lead.email || !lead.enrichmentData) {
    throw new Error(`Lead ${lead.id} is missing enrichment data or email`);
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
    enrichmentSnapshot: JSON.parse(lead.enrichmentData),
  } satisfies OutreachSequenceConfig;
}

function buildScheduledTimeline(now: Date, config: OutreachSequenceConfig) {
  const initialDelay = getRandomInt(config.initialDelayMinMinutes, config.initialDelayMaxMinutes);
  const initial = adjustToAllowedSendWindow(addMinutes(now, initialDelay), config);
  const followUp1 = adjustToAllowedSendWindow(
    addBusinessDays(initial, config.followUp1BusinessDays, config.timezone),
    config,
  );
  const followUp2 = adjustToAllowedSendWindow(
    addBusinessDays(followUp1, config.followUp2BusinessDays, config.timezone),
    config,
  );

  return [initial, followUp1, followUp2];
}

async function listSendableMailboxes(prisma: PrismaLike) {
  return prisma.outreachMailbox.findMany({
    where: {
      status: { in: [...MAILBOX_SENDABLE_STATUSES] },
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

async function getMailboxLoadMap(
  prisma: PrismaLike,
  mailboxIds: string[],
  now: Date,
) {
  if (mailboxIds.length === 0) {
    return new Map<string, MailboxLoad>();
  }

  const dayStart = startOfDay(now);
  const hourStartMs = startOfHour(now).getTime();
  const sentEmails = await prisma.outreachEmail.findMany({
    where: {
      mailboxId: { in: mailboxIds },
      status: "sent",
      sentAt: { gte: dayStart },
    },
    select: {
      mailboxId: true,
      sentAt: true,
    },
  });

  const loadMap = new Map<string, MailboxLoad>(
    mailboxIds.map((mailboxId) => [mailboxId, { sentToday: 0, sentThisHour: 0 }]),
  );

  for (const email of sentEmails) {
    if (!email.mailboxId) {
      continue;
    }

    const current = loadMap.get(email.mailboxId) || { sentToday: 0, sentThisHour: 0 };
    current.sentToday += 1;
    if (email.sentAt && new Date(email.sentAt).getTime() >= hourStartMs) {
      current.sentThisHour += 1;
    }
    loadMap.set(email.mailboxId, current);
  }

  return loadMap;
}

function getMailboxLoadFromMap(
  mailboxLoadMap: ReadonlyMap<string, MailboxLoad>,
  mailboxId: string,
) {
  return mailboxLoadMap.get(mailboxId) || { sentToday: 0, sentThisHour: 0 };
}

async function allocateMailbox(
  prisma: PrismaLike,
  now: Date,
  pendingAssignments: Map<string, number> = new Map(),
  options?: {
    mailboxes?: OutreachMailboxRecord[];
    mailboxLoadMap?: ReadonlyMap<string, MailboxLoad>;
  },
): Promise<MailboxAllocationResult | null> {
  const mailboxes = options?.mailboxes ?? (await listSendableMailboxes(prisma));
  if (mailboxes.length === 0) return null;

  const mailboxLoadMap =
    options?.mailboxLoadMap ??
    (await getMailboxLoadMap(
      prisma,
      mailboxes.map((mailbox) => mailbox.id),
      now,
    ));

  const loads = mailboxes.map((mailbox) => ({
    mailbox,
    ...getMailboxLoadFromMap(mailboxLoadMap, mailbox.id),
  }));

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
  return prisma.outreachSequence.findMany({
    where: {
      leadId: { in: leadIds },
      status: { in: [...ACTIVE_SEQUENCE_STATUSES] },
    },
  }) as Promise<OutreachSequenceRecord[]>;
}

function getDomainFromEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return normalized.includes("@") ? normalized.split("@")[1] || "" : "";
}

export async function getActiveAutomationLeadIds() {
  const prisma = getPrisma();
  const sequences = await prisma.outreachSequence.findMany({
    where: { status: { in: [...ACTIVE_SEQUENCE_STATUSES] } },
    select: { leadId: true },
  });
  return Array.from(new Set(sequences.map((sequence) => sequence.leadId)));
}

async function listAutomationReadyLeads(
  prisma: PrismaLike,
  activeLeadIds: ReadonlySet<number>,
) {
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: { not: null },
      isArchived: false,
    },
    orderBy: { enrichedAt: "desc" },
  })) as LeadRecord[];

  return leads
    .filter((lead) => {
      if (activeLeadIds.has(lead.id)) return false;
      if (lead.outreachStatus !== READY_FOR_FIRST_TOUCH_STATUS) return false;
      if (!isLeadOutreachEligible(lead)) return false;
      if (!lead.enrichmentData) return false;
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
  sequence: OutreachSequenceSummary,
  settings: OutreachAutomationSettingRecord,
  now: Date,
  mailboxLoadMap: ReadonlyMap<string, MailboxLoad>,
  suppressedEmails: ReadonlySet<string>,
  suppressedDomains: ReadonlySet<string>,
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
    const normalizedEmail = normalizeEmail(lead.email);
    const domain = getDomainFromEmail(lead.email);
    if (suppressedEmails.has(normalizedEmail) || (domain && suppressedDomains.has(domain))) {
      blockers.push("suppressed");
    }
  }

  if (!mailbox?.gmailConnectionId) {
    blockers.push("mailbox_disconnected");
  } else if (!MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
    blockers.push("mailbox_disabled");
  } else {
    const { sentToday, sentThisHour } = getMailboxLoadFromMap(mailboxLoadMap, mailbox.id);
    if (sentToday >= mailbox.dailyLimit) blockers.push("daily_cap_reached");
    if (sentThisHour >= mailbox.hourlyLimit) blockers.push("hourly_cap_reached");

    const lastSentAt = coerceDate(mailbox.lastSentAt);
    if (lastSentAt && now.getTime() - lastSentAt.getTime() < mailbox.minDelaySeconds * 1000) {
      blockers.push("mailbox_cooldown");
    }

    const config = sequence.sequenceConfigSnapshot
      ? (JSON.parse(sequence.sequenceConfigSnapshot) as OutreachSequenceConfig)
      : null;
    if (config && !isWithinSendWindow(now, config)) {
      blockers.push("outside_send_window");
    }
  }

  const nextSendAt = coerceDate(sequence.nextScheduledAt || sequence.nextStep?.scheduledFor || null);
  const hasSentAnyStep = Boolean(sequence.lastSentAt);
  if (hasSentAnyStep && nextSendAt && nextSendAt.getTime() > now.getTime()) {
    blockers.push("awaiting_follow_up_window");
  }

  const terminalRetry = normalizeBlockerReason((sequence as OutreachSequenceSummary & { blockerReason?: string | null }).blockerReason);
  if (terminalRetry === "generation_failed_retryable" || terminalRetry === "send_failed_retryable") {
    blockers.push(terminalRetry);
  }

  return Array.from(new Set(blockers));
}

async function enrichSequenceSummary(
  sequence: OutreachSequenceSummary,
  settings: OutreachAutomationSettingRecord,
  now: Date,
  mailboxLoadMap: ReadonlyMap<string, MailboxLoad>,
  suppressedEmails: ReadonlySet<string>,
  suppressedDomains: ReadonlySet<string>,
) {
  const blockers = await getSequenceRuntimeBlockers(
    sequence,
    settings,
    now,
    mailboxLoadMap,
    suppressedEmails,
    suppressedDomains,
  );
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
  } else if (primaryBlocker) {
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

  if (!settings.enabled || settings.globalPaused) {
    return {
      queued: [],
      skipped: input.leadIds.map((leadId) => ({
        leadId,
        reason: settings.globalPaused ? "Automation is globally paused" : "Automation is disabled",
      })),
    };
  }

  const leads = (await prisma.lead.findMany({
    where: { id: { in: input.leadIds } },
  })) as LeadRecord[];
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const activeSequences = await getActiveSequencesForLeads(prisma, input.leadIds);
  const activeLeadIds = new Set(activeSequences.map((sequence) => sequence.leadId));
  const sendableMailboxes = await listSendableMailboxes(prisma);
  const mailboxLoadMap = await getMailboxLoadMap(
    prisma,
    sendableMailboxes.map((mailbox) => mailbox.id),
    now,
  );
  const suppressionIndex = await getSuppressionIndex(
    prisma,
    leads
      .map((lead) => lead.email || null)
      .filter((email): email is string => Boolean(email)),
  );

  for (const leadId of input.leadIds) {
    const lead = leadMap.get(leadId);
    if (!lead) {
      result.skipped.push({ leadId, reason: "Lead not found" });
      continue;
    }

    if (!lead.enrichmentData) {
      result.skipped.push({ leadId, reason: "Lead must be enriched before automation can queue it" });
      continue;
    }

    if (!hasValidPipelineEmail(lead)) {
      result.skipped.push({ leadId, reason: "Lead needs a vetted pipeline-usable email" });
      continue;
    }

    if (!isLeadOutreachEligible(lead)) {
      result.skipped.push({ leadId, reason: "Lead is not automation-ready yet" });
      continue;
    }

    if (lead.outreachStatus !== READY_FOR_FIRST_TOUCH_STATUS) {
      result.skipped.push({
        leadId,
        reason: "Lead must be marked ready for first touch before queueing",
      });
      continue;
    }

    if (activeLeadIds.has(leadId)) {
      result.skipped.push({ leadId, reason: "Lead already has an active automation sequence" });
      continue;
    }

    const normalizedEmail = normalizeEmail(lead.email);
    const domain = getDomainFromEmail(lead.email);
    if (
      suppressionIndex.suppressedEmails.has(normalizedEmail) ||
      (domain && suppressionIndex.suppressedDomains.has(domain))
    ) {
      result.skipped.push({ leadId, reason: "Lead is suppressed from automation" });
      continue;
    }

    const allocation = await allocateMailbox(prisma, now, pendingAssignments, {
      mailboxes: sendableMailboxes,
      mailboxLoadMap,
    });
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
    pendingAssignments.set(
      allocation.mailbox.id,
      (pendingAssignments.get(allocation.mailbox.id) || 0) + 1,
    );
  }

  return result;
}

async function getLeadMap(prisma: PrismaLike, leadIds: number[]) {
  if (leadIds.length === 0) return new Map<number, LeadRecord>();
  const leads = (await prisma.lead.findMany({
    where: { id: { in: leadIds } },
  })) as LeadRecord[];
  return new Map(leads.map((lead) => [lead.id, lead]));
}

async function getNextPendingStepMap(prisma: PrismaLike, sequenceIds: string[]) {
  if (sequenceIds.length === 0) return new Map<string, OutreachSequenceStepRecord>();

  const steps = (await prisma.outreachSequenceStep.findMany({
    where: {
      sequenceId: { in: sequenceIds },
      status: { in: ["SCHEDULED", "CLAIMED", "SENDING"] },
    },
    orderBy: { stepNumber: "asc" },
  })) as OutreachSequenceStepRecord[];

  const stepMap = new Map<string, OutreachSequenceStepRecord>();
  for (const step of steps) {
    if (!stepMap.has(step.sequenceId)) {
      stepMap.set(step.sequenceId, step);
    }
  }

  return stepMap;
}

async function getNextPendingStep(prisma: PrismaLike, sequenceId: string) {
  return getNextPendingStepMap(prisma, [sequenceId]).then((stepMap) => stepMap.get(sequenceId) ?? null);
}

async function getSuppressionIndex(prisma: PrismaLike, emails: string[]) {
  const normalizedEmails = Array.from(
    new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean)),
  );
  const domains = Array.from(
    new Set(normalizedEmails.map((email) => getDomainFromEmail(email)).filter(Boolean)),
  );

  if (normalizedEmails.length === 0 && domains.length === 0) {
    return {
      suppressedEmails: new Set<string>(),
      suppressedDomains: new Set<string>(),
    };
  }

  const suppressions = await prisma.outreachSuppression.findMany({
    where: {
      OR: [
        ...(normalizedEmails.length > 0 ? [{ email: { in: normalizedEmails } }] : []),
        ...(domains.length > 0 ? [{ domain: { in: domains } }] : []),
      ],
    },
    select: {
      email: true,
      domain: true,
    },
  });

  return {
    suppressedEmails: new Set(
      suppressions.map((suppression) => normalizeEmail(suppression.email)).filter(Boolean),
    ),
    suppressedDomains: new Set(
      suppressions.map((suppression) => (suppression.domain || "").trim().toLowerCase()).filter(Boolean),
    ),
  };
}

export async function listAutomationOverview() {
  const prisma = getPrisma();
  const now = new Date();
  const settings = await getSettings(prisma);
  const [mailboxes, sequences, recentRuns, recentSentRaw] = await Promise.all([
    prisma.outreachMailbox.findMany({ orderBy: { updatedAt: "desc" } }) as Promise<OutreachMailboxRecord[]>,
    prisma.outreachSequence.findMany({ orderBy: { createdAt: "desc" }, take: 300 }) as Promise<OutreachSequenceRecord[]>,
    prisma.outreachRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }) as Promise<OutreachRunRecord[]>,
    prisma.outreachEmail.findMany({
      where: { status: "sent", sequenceId: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 12,
    }),
  ]);

  const activeLeadIds = new Set(sequences.map((sequence) => sequence.leadId));
  const sequenceIds = sequences.map((sequence) => sequence.id);
  const allLeadIds = Array.from(
    new Set([
      ...sequences.map((sequence) => sequence.leadId),
      ...recentSentRaw
        .map((email) => email.leadId)
        .filter((value): value is number => typeof value === "number"),
    ]),
  );

  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const [ready, leadMap, nextStepMap, mailboxLoadMap] = await Promise.all([
    listAutomationReadyLeads(prisma, activeLeadIds),
    getLeadMap(prisma, allLeadIds),
    getNextPendingStepMap(prisma, sequenceIds),
    getMailboxLoadMap(prisma, mailboxIds, now),
  ]);
  const suppressionIndex = await getSuppressionIndex(
    prisma,
    sequences
      .map((sequence) => leadMap.get(sequence.leadId)?.email || null)
      .filter((email): email is string => Boolean(email)),
  );

  const rawSummaries = sequences.map((sequence) => ({
    ...sequence,
    lead: leadMap.get(sequence.leadId) ?? null,
    mailbox: sequence.assignedMailboxId ? mailboxMap.get(sequence.assignedMailboxId) ?? null : null,
    nextStep: nextStepMap.get(sequence.id) ?? null,
  }));

  const mailboxStats = mailboxes.map((mailbox) => ({
    ...mailbox,
    ...getMailboxLoadFromMap(mailboxLoadMap, mailbox.id),
    nextAvailableAt: getMailboxNextAvailableAt(mailbox, settings, now),
  }));

  const summaries = await Promise.all(
    rawSummaries.map((sequence) =>
      enrichSequenceSummary(
        sequence,
        settings,
        now,
        mailboxLoadMap,
        suppressionIndex.suppressedEmails,
        suppressionIndex.suppressedDomains,
      ),
    ),
  );

  const recentSent = recentSentRaw.map((email) => ({
    id: email.id,
    sentAt: email.sentAt || new Date(),
    subject: email.subject,
    senderEmail: email.senderEmail,
    recipientEmail: email.recipientEmail,
    sequenceId: email.sequenceId,
    lead: email.leadId ? leadMap.get(email.leadId) ?? null : null,
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
      mode: !settings.enabled ? "DISABLED" : settings.globalPaused ? "PAUSED" : "ACTIVE",
      nextSendAt,
      scheduledToday,
      blockedCount,
      replyStoppedCount: repliedCount,
      readyCount: ready.length,
      queuedCount: queued.length,
      waitingCount,
      sendingCount,
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

async function canMailboxSend(prisma: PrismaLike, mailbox: OutreachMailboxRecord, now: Date, config: OutreachSequenceConfig) {
  if (!MAILBOX_SENDABLE_STATUSES.includes(mailbox.status as (typeof MAILBOX_SENDABLE_STATUSES)[number])) {
    return { allowed: false, reason: "mailbox_disabled" as AutomationBlockerReason };
  }

  if (!isWithinSendWindow(now, config)) {
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
        domain: getDomainFromEmail(lead.email),
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

  await prisma.outreachMailbox.update({
    where: { id: mailbox.id },
    data: { lastReplyCheckAt: new Date() },
  });

  return { detected: false } satisfies ReplyDetectionResult;
}

export async function syncAutomationReplies() {
  const prisma = getPrisma();
  const settings = await getSettings(prisma);
  const staleBefore = addMinutes(new Date(), -settings.replySyncStaleMinutes);
  const sequences = await prisma.outreachSequence.findMany({
    where: {
      status: { in: ["QUEUED", "ACTIVE", "SENDING"] },
      lastSentAt: { not: null },
    },
    orderBy: { lastSentAt: "asc" },
  }) as OutreachSequenceRecord[];

  let checked = 0;
  let stopped = 0;

  for (const sequence of sequences) {
    const mailbox = sequence.assignedMailboxId
      ? (await prisma.outreachMailbox.findUnique({ where: { id: sequence.assignedMailboxId } }) as OutreachMailboxRecord | null)
      : null;
    const lastCheck = coerceDate(mailbox?.lastReplyCheckAt);
    if (lastCheck && lastCheck.getTime() > staleBefore.getTime()) {
      continue;
    }

    checked += 1;
    const reply = await detectReplyForSequence(prisma, sequence);
    if (reply.detected) {
      await markReplyStop(prisma, sequence, reply);
      stopped += 1;
    }
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

async function sendScheduledStep(
  prisma: PrismaLike,
  claim: SchedulerClaim,
  runId: string,
) {
  const context = await buildStepContext(prisma, claim.sequence, claim.step);
  if (!context) {
    throw new Error("Sequence context could not be loaded");
  }

  const config = JSON.parse(claim.sequence.sequenceConfigSnapshot) as OutreachSequenceConfig;
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

  const recipientEmail = context.lead.email;
  if (!recipientEmail) {
    throw new AutomationSkipError("missing_valid_email");
  }

  const suppression = await prisma.outreachSuppression.findFirst({
    where: {
      OR: [
        { email: normalizeEmail(context.lead.email) },
        { domain: getDomainFromEmail(context.lead.email) },
      ],
    },
  });
  if (suppression) {
    await stopSequenceInternal(prisma, claim.sequence, "SUPPRESSED");
    throw new AutomationStoppedError("suppressed");
  }

  const mailboxGate = await canMailboxSend(prisma, claim.mailbox, new Date(), config);
  if (!mailboxGate.allowed) {
    const now = new Date();
    const baseRescheduleAt =
      mailboxGate.reason === "daily_cap_reached"
        ? addMinutes(now, 24 * 60)
        : mailboxGate.reason === "hourly_cap_reached"
          ? addMinutes(now, 60)
          : mailboxGate.reason === "mailbox_cooldown"
            ? addSeconds(now, claim.mailbox.minDelaySeconds)
            : now;
    await prisma.outreachSequenceStep.update({
      where: { id: claim.step.id },
      data: {
        status: "SCHEDULED",
        claimedAt: null,
        claimedByRunId: null,
        scheduledFor: adjustToAllowedSendWindow(baseRescheduleAt, config),
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
    throw new AutomationSkipError("generation_failed_retryable");
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
      generationModel: "deepseek/deepseek-chat",
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
      nextFollowUpDue: nextStep?.scheduledFor ?? null,
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
        nextScheduledAt: nextStep.scheduledFor,
        stopReason: null,
      },
    });
  }
}

async function claimDueSteps(prisma: PrismaLike, runId: string, batchSize: number) {
  const now = new Date();
  const dueSteps = await prisma.outreachSequenceStep.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: batchSize * 3,
  }) as OutreachSequenceStepRecord[];

  if (dueSteps.length === 0) {
    return [];
  }

  const sequenceIds = Array.from(new Set(dueSteps.map((step) => step.sequenceId)));
  const sequences = (await prisma.outreachSequence.findMany({
    where: { id: { in: sequenceIds } },
  })) as OutreachSequenceRecord[];
  const sequenceMap = new Map(sequences.map((sequence) => [sequence.id, sequence]));
  const mailboxIds = Array.from(
    new Set(
      sequences
        .map((sequence) => sequence.assignedMailboxId)
        .filter((mailboxId): mailboxId is string => Boolean(mailboxId)),
    ),
  );
  const mailboxes = (await prisma.outreachMailbox.findMany({
    where: { id: { in: mailboxIds } },
  })) as OutreachMailboxRecord[];
  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));

  const claims: SchedulerClaim[] = [];
  const seenMailboxes = new Set<string>();

  for (const step of dueSteps) {
    const sequence = sequenceMap.get(step.sequenceId) ?? null;
    if (!sequence || !sequence.assignedMailboxId) {
      continue;
    }
    if (sequence.status === "PAUSED" || sequence.status === "STOPPED" || sequence.status === "COMPLETED" || sequence.status === "FAILED") {
      continue;
    }

    const mailbox = mailboxMap.get(sequence.assignedMailboxId) ?? null;
    if (!mailbox || seenMailboxes.has(mailbox.id)) {
      continue;
    }

    const updated = await prisma.outreachSequenceStep.update({
      where: {
        id: step.id,
        status: "SCHEDULED",
      },
      data: {
        status: "CLAIMED",
        claimedAt: now,
        claimedByRunId: runId,
      },
    });

    if (updated.status !== "CLAIMED") {
      continue;
    }

    claims.push({ sequence, step: updated, mailbox });
    seenMailboxes.add(mailbox.id);

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
  const nextAttempt = adjustToAllowedSendWindow(addMinutes(new Date(), minutes), config);
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
  await prisma.outreachSequenceStep.update({
    where: { id: claim.step.id },
    data: {
      status: "SCHEDULED",
      claimedAt: null,
      claimedByRunId: null,
      errorMessage: reason,
    },
  }).catch(() => null);

  await prisma.outreachSequence.update({
    where: { id: claim.sequence.id },
    data: {
      status: claim.sequence.lastSentAt ? "ACTIVE" : "QUEUED",
      stopReason: reason,
    },
  }).catch(() => null);
}

export async function runAutomationScheduler() {
  const prisma = getPrisma();
  const settings = await getSettings(prisma);
  const run = await prisma.outreachRun.create({
    data: {
      id: crypto.randomUUID(),
      startedAt: new Date(),
      status: "RUNNING",
      metadata: JSON.stringify({ source: "scheduler" }),
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

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
        replySync: { checked: 0, stopped: 0 },
      };
    }

    const replySync = await syncAutomationReplies();
    const claims = await claimDueSteps(prisma, run.id, settings.schedulerClaimBatch);

    for (const claim of claims) {
      try {
        await sendScheduledStep(prisma, claim, run.id);
        sentCount += 1;
      } catch (error) {
        if (error instanceof AutomationSkipError) {
          skippedCount += 1;
          await setSequenceBlocked(prisma, claim, error.reason);
          continue;
        }

        if (error instanceof AutomationStoppedError) {
          skippedCount += 1;
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
        }),
      },
    });

    return {
      runId: run.id,
      claimed: claims.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
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
