/* Automation console shared types */

export type ReadyLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  contactName?: string | null;
  axiomScore?: number | null;
  axiomTier?: string | null;
  websiteStatus?: string | null;
};

export type AutomationMailbox = {
  id: string;
  gmailAddress: string;
  label: string | null;
  status: string;
  timezone: string;
  dailyLimit: number;
  hourlyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  warmupLevel: number;
  sentToday: number;
  sentThisHour: number;
  lastSentAt?: string | null;
  nextAvailableAt?: string | null;
};

export type AutomationSequence = {
  id: string;
  status: string;
  state: "QUEUED" | "SENDING" | "WAITING" | "BLOCKED" | "STOPPED" | "COMPLETED";
  currentStep: string;
  nextScheduledAt: string | null;
  nextSendAt: string | null;
  lastSentAt: string | null;
  stopReason: string | null;
  blockerReason: string | null;
  blockerLabel: string | null;
  blockerDetail: string | null;
  hasSentAnyStep: boolean;
  secondaryBlockers: string[];
  lead?: ReadyLead | null;
  mailbox?: AutomationMailbox | null;
  nextStep?: { stepType: string; scheduledFor: string } | null;
};

export type AutomationRun = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  sentCount: number;
  failedCount: number;
  claimedCount: number;
  skippedCount?: number;
  metadata?: string | null;
};

export type RecentSend = {
  id: string;
  sentAt: string;
  subject: string;
  senderEmail: string;
  recipientEmail: string;
  sequenceId: string | null;
  lead?: ReadyLead | null;
};

export type AutomationSettings = {
  enabled: boolean;
  globalPaused: boolean;
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
};

export type AutomationOverview = {
  settings: AutomationSettings;
  ready: ReadyLead[];
  mailboxes: AutomationMailbox[];
  sequences: AutomationSequence[];
  queued: AutomationSequence[];
  active: AutomationSequence[];
  finished: AutomationSequence[];
  recentSent: RecentSend[];
  recentRuns: AutomationRun[];
  engine: {
    mode: "ACTIVE" | "PAUSED" | "DISABLED";
    nextSendAt: string | null;
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

/** The daily send target — 40 emails/day */
export const DAILY_TARGET = 40;

export type TabId = "overview" | "queue" | "mailboxes" | "blocked" | "rules";
