import { isAdequateAutonomousLead } from "@/lib/automation-policy";

export const SENDABLE_MAILBOX_STATUSES = ["ACTIVE", "WARMING"] as const;

export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

export function sqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function adequateLeadWhereClause(scoreParameter = "?") {
  return `"axiomScore" >= ${scoreParameter}
         AND COALESCE("axiomTier",'') != 'D'
         AND LOWER(COALESCE("emailType",'')) IN ('owner', 'staff')
         AND COALESCE("email",'') != ''
         AND LOWER("email") NOT LIKE 'info@%'
         AND LOWER("email") NOT LIKE 'sales@%'
         AND LOWER("email") NOT LIKE 'hello@%'
         AND LOWER("email") NOT LIKE 'contact@%'
         AND LOWER("email") NOT LIKE 'admin@%'
         AND LOWER("email") NOT LIKE 'support@%'
         AND LOWER("email") NOT LIKE 'office@%'
         AND LOWER("email") NOT LIKE 'marketing@%'
         AND LOWER("email") NOT LIKE 'service@%'
         AND LOWER("email") NOT LIKE 'enquiries@%'
         AND LOWER("email") NOT LIKE 'enquiry@%'
         AND LOWER("email") NOT LIKE 'booking@%'
         AND LOWER("email") NOT LIKE 'team@%'
         AND LOWER("email") NOT LIKE 'webmaster@%'
         AND COALESCE("isArchived", 0) = 0`;
}

export function isAdequateAutonomousLeadRow(lead: Parameters<typeof isAdequateAutonomousLead>[0]) {
  return isAdequateAutonomousLead(lead);
}

export function calculateReplyRate(sent: number, replied: number): number {
  if (!Number.isFinite(sent) || sent <= 0) return 0;
  return Math.round((Math.max(0, replied) / sent) * 100);
}

export function isSendableMailbox(mailbox: {
  gmailConnectionId?: string | null;
  status?: string | null;
}) {
  return Boolean(
    mailbox.gmailConnectionId &&
      SENDABLE_MAILBOX_STATUSES.includes(mailbox.status as (typeof SENDABLE_MAILBOX_STATUSES)[number]),
  );
}

export function resolveGlobalDailySendCap(options: {
  envCap?: number | null;
  mailboxCaps: Array<number | null | undefined>;
  fallbackPerMailboxCap: number;
  expectedMailboxCount?: number;
}): number {
  if (typeof options.envCap === "number" && Number.isFinite(options.envCap) && options.envCap > 0) {
    return options.envCap;
  }

  const mailboxCapTotal = options.mailboxCaps.reduce<number>((sum, cap) => {
    const numeric = Number(cap || 0);
    return sum + (Number.isFinite(numeric) && numeric > 0 ? numeric : 0);
  }, 0);
  if (mailboxCapTotal > 0) return mailboxCapTotal;

  return options.fallbackPerMailboxCap * Math.max(1, options.expectedMailboxCount ?? 1);
}

export type MilestoneSignals = {
  dealStage: string | null | undefined;
  proposalSentAt?: Date | string | null;
  signedAt?: Date | string | null;
  projectStartDate?: Date | string | null;
  deliveredAt?: Date | string | null;
  retainedAt?: Date | string | null;
};

export function getProjectMilestoneChecks(signals: MilestoneSignals) {
  return {
    proposal: Boolean(signals.proposalSentAt),
    signed: Boolean(signals.signedAt),
    kickoff: false,
    started: Boolean(signals.projectStartDate),
    review: false,
    delivered: Boolean(signals.deliveredAt || signals.dealStage === "DELIVERED"),
    retained: Boolean(signals.retainedAt || signals.dealStage === "RETAINED"),
  };
}
