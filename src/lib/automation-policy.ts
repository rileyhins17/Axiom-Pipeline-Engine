import type { LeadRecord, OutreachAutomationSettingRecord } from "@/lib/prisma";

import { isLeadOutreachEligible } from "@/lib/lead-qualification";

export const MAILBOX_DAILY_SEND_TARGET = 20;
export const MAILBOX_HOURLY_SEND_TARGET = 5;
export const MAILBOX_MIN_DELAY_SECONDS = 600;
export const MAILBOX_MAX_DELAY_SECONDS = 1800;

export const AUTONOMOUS_QUEUE_MIN_SCORE = 55;
export const AUTONOMOUS_QUEUE_BATCH_SIZE = 20;

export const AUTOMATION_SETTINGS_DEFAULTS = {
  enabled: true,
  globalPaused: false,
  sendWindowStartHour: 9,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 16,
  sendWindowEndMinute: 30,
  weekdaysOnly: false,
  initialDelayMinMinutes: 3,
  initialDelayMaxMinutes: 12,
  followUp1BusinessDays: 2,
  followUp2BusinessDays: 3,
  schedulerClaimBatch: 10,
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

  return lead.axiomTier !== "D";
}
