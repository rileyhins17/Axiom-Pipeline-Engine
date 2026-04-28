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
export const MAILBOX_HOURLY_SEND_TARGET = 12;
/** Min delay between sends from a single mailbox. 2 min is still natural
 *  spacing (human operators take ~1-3 min per personalized email). */
export const MAILBOX_MIN_DELAY_SECONDS = 120;
export const MAILBOX_MAX_DELAY_SECONDS = 420;

/** Min Axiom score to auto-queue. Lowered from 55 → 45 so more leads flow
 *  through the funnel without manual approval. */
export const AUTONOMOUS_QUEUE_MIN_SCORE = 45;
/** Max leads to queue per scheduler tick. With cron every 1 min this is
 *  3000/hour peak which is more than enough headroom. */
export const AUTONOMOUS_QUEUE_BATCH_SIZE = 50;

/** Hard ceiling on new ADEQUATE leads (axiomScore >= 45, non-D, non-generic
 *  email) intaken per UTC day. Once hit, the autonomous-intake tick stops
 *  dispatching new ScrapeJobs until midnight UTC. Combined with two
 *  mailboxes at 40/day each (= 80 sends/day), this keeps a healthy
 *  intake-to-send ratio without manual gating. */
export const AUTONOMOUS_DAILY_LEAD_INTAKE_CAP = 50;

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
  // A human can still manually queue a generic email via the outreach UI
  // if they really want to.
  const emailType = (lead.emailType || "").toLowerCase();
  if (emailType === "generic") return false;

  return true;
}
