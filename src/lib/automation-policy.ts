import type { LeadRecord, OutreachAutomationSettingRecord } from "@/lib/prisma";

import { isLeadOutreachEligible } from "@/lib/lead-qualification";

/**
 * Per-mailbox throughput caps. Sized for warmed Google Workspace accounts;
 * Gmail's hard limit is ~500/day for Workspace and ~100/day for consumer.
 * We stay well below either to protect reputation but deliberately push
 * higher than the old 20/day default — the operator is paying for the
 * pipeline and expects leads to move.
 */
export const MAILBOX_DAILY_SEND_TARGET = 40;
/** Hourly cap kept low (6) during early autonomy so even if 20 sends queue
 *  up at once, they pace out across multiple hours like a human operator. */
export const MAILBOX_HOURLY_SEND_TARGET = 6;
/** Min delay between sends from a single mailbox. 2 min is still natural
 *  spacing (human operators take ~1-3 min per personalized email). */
export const MAILBOX_MIN_DELAY_SECONDS = 120;
export const MAILBOX_MAX_DELAY_SECONDS = 420;

/** Tiered score thresholds. Three gates with rising bars:
 *  intake (45) lets a lead INTO the database;
 *  queue  (55) lets it enter the outreach sequence;
 *  send   (65) lets it actually receive an email.
 *  This keeps the database full but protects sender reputation. */
export const AUTONOMOUS_INTAKE_MIN_SCORE = 45;
export const AUTONOMOUS_QUEUE_MIN_SCORE = 55;
export const AUTONOMOUS_SEND_MIN_SCORE = 65;
/** Max leads to queue per scheduler tick. With cron every 1 min this is
 *  3000/hour peak which is more than enough headroom. */
export const AUTONOMOUS_QUEUE_BATCH_SIZE = 50;

/** Hard ceiling on new ADEQUATE leads (axiomScore >= 45, non-D, non-generic
 *  email) intaken per UTC day. Once hit, the autonomous-intake tick stops
 *  dispatching new ScrapeJobs until midnight UTC. Combined with two
 *  mailboxes at 40/day each (= 80 sends/day), this keeps a healthy
 *  intake-to-send ratio without manual gating. */
export const AUTONOMOUS_DAILY_LEAD_INTAKE_CAP = 100;

export function isAdequateAutonomousLead(lead: {
  axiomScore?: number | null;
  axiomTier?: string | null;
  businessName?: string | null;
  category?: string | null;
  email?: string | null;
  emailType?: string | null;
  isArchived?: boolean | number | null;
}) {
  if (typeof lead.axiomScore !== "number" || !Number.isFinite(lead.axiomScore)) {
    return false;
  }

  if (lead.axiomScore < AUTONOMOUS_INTAKE_MIN_SCORE) {
    return false;
  }

  if (lead.axiomTier === "D") {
    return false;
  }

  if (!String(lead.email || "").trim()) {
    return false;
  }

  if (String(lead.emailType || "").trim().toLowerCase() === "generic") {
    return false;
  }

  if (lead.isArchived === true || lead.isArchived === 1) {
    return false;
  }

  if (isHardDisqualified(lead).disqualified) {
    return false;
  }

  return true;
}

export const AUTOMATION_SETTINGS_DEFAULTS = {
  enabled: true,
  globalPaused: false,
  sendWindowStartHour: 0,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 23,
  sendWindowEndMinute: 59,
  weekdaysOnly: false,
  /** Initial touch fires within 1-5 min of being queued (was 3-12). */
  initialDelayMinMinutes: 1,
  initialDelayMaxMinutes: 5,
  followUp1BusinessDays: 2,
  followUp2BusinessDays: 3,
  /** Steps claimed per scheduler tick. Raised to 60 so a single tick can
   *  drain a larger backlog once the enrichment funnel catches up. Per-mailbox
   *  caps still throttle any one account; this only lifts the per-tick ceiling. */
  schedulerClaimBatch: 60,
  replySyncStaleMinutes: 15,
} satisfies Omit<OutreachAutomationSettingRecord, "id" | "createdAt" | "updatedAt">;

/** Government / school / chain / franchise patterns we never email. */
const HARD_DISQUALIFIER_PATTERNS = [
  /\b(government|gov\.|municipal(ity)?|city of|county of|state of|provincial)\b/i,
  /\b(school|university|college|academy|district|board of education)\b/i,
  /\b(walmart|costco|home depot|lowe'?s|mcdonald'?s|starbucks|target|kroger)\b/i,
  /\b(franchise corporate|hq|head office)\b/i,
];

/** Free-mail providers used by businesses are usually owner-personal
 *  inboxes (acceptable) BUT govt./edu domains we hard-block. */
const BLOCKED_EMAIL_DOMAINS = new Set([
  ".gov",
  ".gov.ca",
  ".gov.us",
  ".gc.ca",
  ".edu",
  ".mil",
  ".k12.us",
]);

export function isHardDisqualified(lead: {
  businessName?: string | null;
  category?: string | null;
  email?: string | null;
}): { disqualified: boolean; reason?: string } {
  const text = `${lead.businessName || ""} ${lead.category || ""}`.trim();
  if (text) {
    for (const pattern of HARD_DISQUALIFIER_PATTERNS) {
      if (pattern.test(text)) {
        return { disqualified: true, reason: "blocked_segment" };
      }
    }
  }
  const email = (lead.email || "").toLowerCase().trim();
  if (email) {
    for (const suffix of BLOCKED_EMAIL_DOMAINS) {
      if (email.endsWith(suffix)) {
        return { disqualified: true, reason: "blocked_email_domain" };
      }
    }
  }
  return { disqualified: false };
}

export function shouldAutonomouslyQueueLead(lead: LeadRecord) {
  if (!isLeadOutreachEligible(lead)) {
    return false;
  }

  if (typeof lead.axiomScore !== "number" || !Number.isFinite(lead.axiomScore)) {
    return false;
  }

  if (lead.axiomScore < AUTONOMOUS_QUEUE_MIN_SCORE) {
    return false;
  }

  if (lead.axiomTier === "D") return false;

  // Skip role/department inboxes for auto-queue. info@, contact@, hello@,
  // sales@ etc. are classified as emailType='generic' and have near-zero
  // reply rates + high spam-flag risk. Owner/staff emails only.
  const emailType = (lead.emailType || "").toLowerCase();
  if (emailType === "generic") return false;

  // Already-contacted leads should never re-enter the queue autonomously.
  if (lead.firstContactedAt) return false;

  if (isHardDisqualified(lead).disqualified) return false;

  return true;
}
