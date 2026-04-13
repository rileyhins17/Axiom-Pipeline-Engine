import { getDatabase as getDbHandle } from "@/lib/cloudflare";
import type { D1DatabaseLike } from "@/lib/cloudflare";

type SortDirection = "asc" | "desc";
type SelectMap<T> = Partial<Record<keyof T, boolean>>;
type WhereInput = Record<string, unknown>;

type TrueKeys<S> = {
  [K in keyof S]: S[K] extends true ? K : never;
}[keyof S];

type Selected<T, S> = S extends SelectMap<T> ? Pick<T, Extract<TrueKeys<S>, keyof T>> : T;

type FindManyArgs<T, S extends SelectMap<T> | undefined = undefined> = {
  orderBy?: Partial<Record<keyof T, SortDirection>>;
  select?: S;
  take?: number;
  where?: WhereInput;
};

type FindUniqueArgs<T, S extends SelectMap<T> | undefined = undefined> = {
  select?: S;
  where: WhereInput;
};

type CountArgs = {
  where?: WhereInput;
};

type MutationArgs = {
  data: Record<string, unknown>;
  where: WhereInput;
};

type CreateArgs = {
  data: Record<string, unknown>;
};

type UpdateManyArgs = {
  data: Record<string, unknown>;
  where?: WhereInput;
};

export type LeadRecord = {
  id: number;
  businessName: string;
  niche: string;
  city: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  socialLink: string | null;
  websiteUrl: string | null;
  websiteDomain: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: string | null;
  contactName: string | null;
  tacticalNote: string | null;
  leadScore: number | null;
  websiteGrade: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  scoreBreakdown: string | null;
  painSignals: string | null;
  callOpener: string | null;
  followUpQuestion: string | null;
  axiomWebsiteAssessment: string | null;
  dedupeKey: string | null;
  dedupeMatchedBy: string | null;
  emailType: string | null;
  emailConfidence: number | null;
  emailFlags: string | null;
  phoneConfidence: number | null;
  phoneFlags: string | null;
  disqualifiers: string | null;
  disqualifyReason: string | null;
  outreachStatus: string | null;
  outreachChannel: string | null;
  firstContactedAt: Date | null;
  lastContactedAt: Date | null;
  nextFollowUpDue: Date | null;
  outreachNotes: string | null;
  enrichedAt: Date | null;
  enrichmentData: string | null;
  source: string | null;
  isArchived: boolean;
  createdAt: Date;
  lastUpdated: Date | null;
};

type AuditEventRecord = {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: Date;
};

type RateLimitWindowRecord = {
  id: string;
  key: string;
  windowStart: Date;
  count: number;
  updatedAt: Date;
};

type ScrapeRunRecord = {
  id: string;
  actorUserId: string | null;
  status: string;
  niche: string;
  city: string;
  errorMessage: string | null;
  metadata: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GmailConnectionRecord = {
  id: string;
  userId: string;
  gmailAddress: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OutreachEmailRecord = {
  id: string;
  leadId: number;
  senderUserId: string;
  senderEmail: string;
  mailboxId: string | null;
  sequenceId: string | null;
  sequenceStepId: string | null;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: Date;
};

export type OutreachAutomationSettingRecord = {
  id: string;
  enabled: boolean;
  globalPaused: boolean;
  emailSystemPrompt: string | null;
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  weekdaysOnly: boolean;
  initialDelayMinMinutes: number;
  initialDelayMaxMinutes: number;
  followUp1BusinessDays: number;
  followUp2BusinessDays: number;
  schedulerClaimBatch: number;
  replySyncStaleMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OutreachMailboxRecord = {
  id: string;
  userId: string;
  gmailConnectionId: string | null;
  gmailAddress: string;
  label: string | null;
  status: string;
  timezone: string;
  dailyLimit: number;
  hourlyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  warmupLevel: number;
  lastSentAt: Date | null;
  lastReplyCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OutreachSequenceRecord = {
  id: string;
  leadId: number;
  queuedByUserId: string;
  assignedMailboxId: string | null;
  status: string;
  currentStep: string;
  nextScheduledAt: Date | null;
  lastSentAt: Date | null;
  replyDetectedAt: Date | null;
  stopReason: string | null;
  sequenceConfigSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OutreachSequenceStepRecord = {
  id: string;
  sequenceId: string;
  stepNumber: number;
  stepType: string;
  status: string;
  scheduledFor: Date;
  claimedAt: Date | null;
  claimedByRunId: string | null;
  sentAt: Date | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyPlain: string | null;
  generationModel: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OutreachSuppressionRecord = {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string;
  source: string;
  leadId: number | null;
  sequenceId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
};

export type OutreachRunRecord = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  claimedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  metadata: string | null;
};

type TableSpec<T extends Record<string, unknown>> = {
  autoIncrementId?: boolean;
  booleanFields: Set<keyof T>;
  columns: Array<keyof T>;
  dateFields: Set<keyof T>;
  idField: keyof T;
  integerFields: Set<keyof T>;
  stringFields: Set<keyof T>;
  tableName: string;
  updatedAtField?: keyof T;
};

type PrismaLike = {
  auditEvent: {
    create(args: CreateArgs): Promise<AuditEventRecord>;
    findMany<S extends SelectMap<AuditEventRecord> | undefined = undefined>(
      args?: FindManyArgs<AuditEventRecord, S>,
    ): Promise<Array<Selected<AuditEventRecord, S>>>;
  };
  lead: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<LeadRecord>;
    delete(args: { where: WhereInput }): Promise<void>;
    findFirst<S extends SelectMap<LeadRecord> | undefined = undefined>(
      args?: FindManyArgs<LeadRecord, S>,
    ): Promise<Selected<LeadRecord, S> | null>;
    findMany<S extends SelectMap<LeadRecord> | undefined = undefined>(
      args?: FindManyArgs<LeadRecord, S>,
    ): Promise<Array<Selected<LeadRecord, S>>>;
    findUnique<S extends SelectMap<LeadRecord> | undefined = undefined>(
      args: FindUniqueArgs<LeadRecord, S>,
    ): Promise<Selected<LeadRecord, S> | null>;
    update(args: MutationArgs): Promise<LeadRecord>;
  };
  rateLimitWindow: {
    create(args: CreateArgs): Promise<RateLimitWindowRecord>;
    findUnique<S extends SelectMap<RateLimitWindowRecord> | undefined = undefined>(
      args: FindUniqueArgs<RateLimitWindowRecord, S>,
    ): Promise<Selected<RateLimitWindowRecord, S> | null>;
    update(args: MutationArgs): Promise<RateLimitWindowRecord>;
  };
  scrapeRun: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<ScrapeRunRecord>;
    update(args: MutationArgs): Promise<ScrapeRunRecord>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
  user: {
    update(args: MutationArgs): Promise<UserRecord>;
  };
  gmailConnection: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<GmailConnectionRecord>;
    delete(args: { where: WhereInput }): Promise<void>;
    findFirst<S extends SelectMap<GmailConnectionRecord> | undefined = undefined>(
      args?: FindManyArgs<GmailConnectionRecord, S>,
    ): Promise<Selected<GmailConnectionRecord, S> | null>;
    findMany<S extends SelectMap<GmailConnectionRecord> | undefined = undefined>(
      args?: FindManyArgs<GmailConnectionRecord, S>,
    ): Promise<Array<Selected<GmailConnectionRecord, S>>>;
    findUnique<S extends SelectMap<GmailConnectionRecord> | undefined = undefined>(
      args: FindUniqueArgs<GmailConnectionRecord, S>,
    ): Promise<Selected<GmailConnectionRecord, S> | null>;
    update(args: MutationArgs): Promise<GmailConnectionRecord>;
  };
  outreachEmail: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachEmailRecord>;
    findUnique<S extends SelectMap<OutreachEmailRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachEmailRecord, S>,
    ): Promise<Selected<OutreachEmailRecord, S> | null>;
    findMany<S extends SelectMap<OutreachEmailRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachEmailRecord, S>,
    ): Promise<Array<Selected<OutreachEmailRecord, S>>>;
    findFirst<S extends SelectMap<OutreachEmailRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachEmailRecord, S>,
    ): Promise<Selected<OutreachEmailRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachEmailRecord>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
  outreachAutomationSetting: {
    create(args: CreateArgs): Promise<OutreachAutomationSettingRecord>;
    findFirst<S extends SelectMap<OutreachAutomationSettingRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachAutomationSettingRecord, S>,
    ): Promise<Selected<OutreachAutomationSettingRecord, S> | null>;
    findUnique<S extends SelectMap<OutreachAutomationSettingRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachAutomationSettingRecord, S>,
    ): Promise<Selected<OutreachAutomationSettingRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachAutomationSettingRecord>;
  };
  outreachMailbox: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachMailboxRecord>;
    findFirst<S extends SelectMap<OutreachMailboxRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachMailboxRecord, S>,
    ): Promise<Selected<OutreachMailboxRecord, S> | null>;
    findMany<S extends SelectMap<OutreachMailboxRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachMailboxRecord, S>,
    ): Promise<Array<Selected<OutreachMailboxRecord, S>>>;
    findUnique<S extends SelectMap<OutreachMailboxRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachMailboxRecord, S>,
    ): Promise<Selected<OutreachMailboxRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachMailboxRecord>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
  outreachSequence: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachSequenceRecord>;
    findFirst<S extends SelectMap<OutreachSequenceRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSequenceRecord, S>,
    ): Promise<Selected<OutreachSequenceRecord, S> | null>;
    findMany<S extends SelectMap<OutreachSequenceRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSequenceRecord, S>,
    ): Promise<Array<Selected<OutreachSequenceRecord, S>>>;
    findUnique<S extends SelectMap<OutreachSequenceRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachSequenceRecord, S>,
    ): Promise<Selected<OutreachSequenceRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachSequenceRecord>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
  outreachSequenceStep: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachSequenceStepRecord>;
    findFirst<S extends SelectMap<OutreachSequenceStepRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSequenceStepRecord, S>,
    ): Promise<Selected<OutreachSequenceStepRecord, S> | null>;
    findMany<S extends SelectMap<OutreachSequenceStepRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSequenceStepRecord, S>,
    ): Promise<Array<Selected<OutreachSequenceStepRecord, S>>>;
    findUnique<S extends SelectMap<OutreachSequenceStepRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachSequenceStepRecord, S>,
    ): Promise<Selected<OutreachSequenceStepRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachSequenceStepRecord>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
  outreachSuppression: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachSuppressionRecord>;
    findFirst<S extends SelectMap<OutreachSuppressionRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSuppressionRecord, S>,
    ): Promise<Selected<OutreachSuppressionRecord, S> | null>;
    findMany<S extends SelectMap<OutreachSuppressionRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachSuppressionRecord, S>,
    ): Promise<Array<Selected<OutreachSuppressionRecord, S>>>;
    update(args: MutationArgs): Promise<OutreachSuppressionRecord>;
  };
  outreachRun: {
    count(args?: CountArgs): Promise<number>;
    create(args: CreateArgs): Promise<OutreachRunRecord>;
    findFirst<S extends SelectMap<OutreachRunRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachRunRecord, S>,
    ): Promise<Selected<OutreachRunRecord, S> | null>;
    findMany<S extends SelectMap<OutreachRunRecord> | undefined = undefined>(
      args?: FindManyArgs<OutreachRunRecord, S>,
    ): Promise<Array<Selected<OutreachRunRecord, S>>>;
    findUnique<S extends SelectMap<OutreachRunRecord> | undefined = undefined>(
      args: FindUniqueArgs<OutreachRunRecord, S>,
    ): Promise<Selected<OutreachRunRecord, S> | null>;
    update(args: MutationArgs): Promise<OutreachRunRecord>;
  };
};

type DatabaseRow = Record<string, unknown>;
type PreparedStatementResult = {
  meta?: {
    changes?: number;
    last_row_id?: number | string;
  };
};

const globalForPrisma = globalThis as {
  axiomPrisma?: PrismaLike;
};

const tableColumnsCache = new Map<string, string[]>();
let leadSchemaEnsurePromise: Promise<void> | null = null;

const leadTable: TableSpec<LeadRecord> = {
  autoIncrementId: true,
  booleanFields: new Set(["isArchived"]),
  columns: [
    "id",
    "businessName",
    "niche",
    "city",
    "category",
    "address",
    "phone",
    "email",
    "socialLink",
    "websiteUrl",
    "websiteDomain",
    "rating",
    "reviewCount",
    "websiteStatus",
    "contactName",
    "tacticalNote",
    "leadScore",
    "websiteGrade",
    "axiomScore",
    "axiomTier",
    "scoreBreakdown",
    "painSignals",
    "callOpener",
    "followUpQuestion",
    "axiomWebsiteAssessment",
    "dedupeKey",
    "dedupeMatchedBy",
    "emailType",
    "emailConfidence",
    "emailFlags",
    "phoneConfidence",
    "phoneFlags",
    "disqualifiers",
    "disqualifyReason",
    "outreachStatus",
    "outreachChannel",
    "firstContactedAt",
    "lastContactedAt",
    "nextFollowUpDue",
    "outreachNotes",
    "enrichedAt",
    "enrichmentData",
    "source",
    "isArchived",
    "createdAt",
    "lastUpdated",
  ],
  dateFields: new Set(["createdAt", "lastUpdated", "firstContactedAt", "lastContactedAt", "nextFollowUpDue", "enrichedAt"]),
  idField: "id",
  integerFields: new Set(["id", "reviewCount", "leadScore", "axiomScore"]),
  stringFields: new Set([
    "businessName",
    "niche",
    "city",
    "category",
    "address",
    "phone",
    "email",
    "socialLink",
    "websiteUrl",
    "websiteDomain",
    "websiteStatus",
    "contactName",
    "tacticalNote",
    "websiteGrade",
    "axiomTier",
    "scoreBreakdown",
    "painSignals",
    "callOpener",
    "followUpQuestion",
    "axiomWebsiteAssessment",
    "dedupeKey",
    "dedupeMatchedBy",
    "emailType",
    "emailFlags",
    "phoneFlags",
    "disqualifiers",
    "disqualifyReason",
    "outreachStatus",
    "outreachChannel",
    "outreachNotes",
    "enrichmentData",
    "source",
  ]),
  tableName: "Lead",
};

const auditEventTable: TableSpec<AuditEventRecord> = {
  booleanFields: new Set(),
  columns: ["id", "actorUserId", "action", "targetType", "targetId", "ipAddress", "metadata", "createdAt"],
  dateFields: new Set(["createdAt"]),
  idField: "id",
  integerFields: new Set(),
  stringFields: new Set(),
  tableName: "AuditEvent",
};

const rateLimitWindowTable: TableSpec<RateLimitWindowRecord> = {
  booleanFields: new Set(),
  columns: ["id", "key", "windowStart", "count", "updatedAt"],
  dateFields: new Set(["windowStart", "updatedAt"]),
  idField: "id",
  integerFields: new Set(["count"]),
  stringFields: new Set(),
  tableName: "RateLimitWindow",
  updatedAtField: "updatedAt",
};

const scrapeRunTable: TableSpec<ScrapeRunRecord> = {
  booleanFields: new Set(),
  columns: ["id", "actorUserId", "status", "niche", "city", "errorMessage", "metadata", "startedAt", "finishedAt"],
  dateFields: new Set(["startedAt", "finishedAt"]),
  idField: "id",
  integerFields: new Set(),
  stringFields: new Set(),
  tableName: "ScrapeRun",
};

const userTable: TableSpec<UserRecord> = {
  booleanFields: new Set(["emailVerified", "banned"]),
  columns: [
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "role",
    "banned",
    "banReason",
    "banExpires",
    "createdAt",
    "updatedAt",
  ],
  dateFields: new Set(["banExpires", "createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set(),
  stringFields: new Set(),
  tableName: "User",
  updatedAtField: "updatedAt",
};

const gmailConnectionTable: TableSpec<GmailConnectionRecord> = {
  booleanFields: new Set(),
  columns: [
    "id", "userId", "gmailAddress", "accessToken", "refreshToken",
    "tokenExpiresAt", "scopes", "createdAt", "updatedAt",
  ],
  dateFields: new Set(["tokenExpiresAt", "createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set(),
  stringFields: new Set(),
  tableName: "GmailConnection",
  updatedAtField: "updatedAt",
};

const outreachEmailTable: TableSpec<OutreachEmailRecord> = {
  booleanFields: new Set(),
  columns: [
    "id", "leadId", "senderUserId", "senderEmail", "mailboxId", "sequenceId", "sequenceStepId", "recipientEmail",
    "subject", "bodyHtml", "bodyPlain", "gmailMessageId", "gmailThreadId",
    "status", "errorMessage", "sentAt",
  ],
  dateFields: new Set(["sentAt"]),
  idField: "id",
  integerFields: new Set(["leadId"]),
  stringFields: new Set(),
  tableName: "OutreachEmail",
};

const outreachAutomationSettingTable: TableSpec<OutreachAutomationSettingRecord> = {
  booleanFields: new Set(["enabled", "globalPaused", "weekdaysOnly"]),
  columns: [
    "id",
    "enabled",
    "globalPaused",
    "emailSystemPrompt",
    "sendWindowStartHour",
    "sendWindowStartMinute",
    "sendWindowEndHour",
    "sendWindowEndMinute",
    "weekdaysOnly",
    "initialDelayMinMinutes",
    "initialDelayMaxMinutes",
    "followUp1BusinessDays",
    "followUp2BusinessDays",
    "schedulerClaimBatch",
    "replySyncStaleMinutes",
    "createdAt",
    "updatedAt",
  ],
  dateFields: new Set(["createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set([
    "sendWindowStartHour",
    "sendWindowStartMinute",
    "sendWindowEndHour",
    "sendWindowEndMinute",
    "initialDelayMinMinutes",
    "initialDelayMaxMinutes",
    "followUp1BusinessDays",
    "followUp2BusinessDays",
    "schedulerClaimBatch",
    "replySyncStaleMinutes",
  ]),
  stringFields: new Set(["emailSystemPrompt"]),
  tableName: "OutreachAutomationSetting",
  updatedAtField: "updatedAt",
};

const outreachMailboxTable: TableSpec<OutreachMailboxRecord> = {
  booleanFields: new Set(),
  columns: [
    "id",
    "userId",
    "gmailConnectionId",
    "gmailAddress",
    "label",
    "status",
    "timezone",
    "dailyLimit",
    "hourlyLimit",
    "minDelaySeconds",
    "maxDelaySeconds",
    "warmupLevel",
    "lastSentAt",
    "lastReplyCheckAt",
    "createdAt",
    "updatedAt",
  ],
  dateFields: new Set(["lastSentAt", "lastReplyCheckAt", "createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set(["dailyLimit", "hourlyLimit", "minDelaySeconds", "maxDelaySeconds", "warmupLevel"]),
  stringFields: new Set(["userId", "gmailConnectionId", "gmailAddress", "label", "status", "timezone"]),
  tableName: "OutreachMailbox",
  updatedAtField: "updatedAt",
};

const outreachSequenceTable: TableSpec<OutreachSequenceRecord> = {
  booleanFields: new Set(),
  columns: [
    "id",
    "leadId",
    "queuedByUserId",
    "assignedMailboxId",
    "status",
    "currentStep",
    "nextScheduledAt",
    "lastSentAt",
    "replyDetectedAt",
    "stopReason",
    "sequenceConfigSnapshot",
    "createdAt",
    "updatedAt",
  ],
  dateFields: new Set(["nextScheduledAt", "lastSentAt", "replyDetectedAt", "createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set(["leadId"]),
  stringFields: new Set([
    "id",
    "queuedByUserId",
    "assignedMailboxId",
    "status",
    "currentStep",
    "stopReason",
    "sequenceConfigSnapshot",
  ]),
  tableName: "OutreachSequence",
  updatedAtField: "updatedAt",
};

const outreachSequenceStepTable: TableSpec<OutreachSequenceStepRecord> = {
  booleanFields: new Set(),
  columns: [
    "id",
    "sequenceId",
    "stepNumber",
    "stepType",
    "status",
    "scheduledFor",
    "claimedAt",
    "claimedByRunId",
    "sentAt",
    "gmailMessageId",
    "gmailThreadId",
    "subject",
    "bodyHtml",
    "bodyPlain",
    "generationModel",
    "errorMessage",
    "attemptCount",
    "createdAt",
    "updatedAt",
  ],
  dateFields: new Set(["scheduledFor", "claimedAt", "sentAt", "createdAt", "updatedAt"]),
  idField: "id",
  integerFields: new Set(["stepNumber", "attemptCount"]),
  stringFields: new Set([
    "id",
    "sequenceId",
    "stepType",
    "status",
    "claimedByRunId",
    "gmailMessageId",
    "gmailThreadId",
    "subject",
    "bodyHtml",
    "bodyPlain",
    "generationModel",
    "errorMessage",
  ]),
  tableName: "OutreachSequenceStep",
  updatedAtField: "updatedAt",
};

const outreachSuppressionTable: TableSpec<OutreachSuppressionRecord> = {
  booleanFields: new Set(),
  columns: ["id", "email", "domain", "reason", "source", "leadId", "sequenceId", "createdAt", "expiresAt"],
  dateFields: new Set(["createdAt", "expiresAt"]),
  idField: "id",
  integerFields: new Set(["leadId"]),
  stringFields: new Set(["id", "email", "domain", "reason", "source", "sequenceId"]),
  tableName: "OutreachSuppression",
};

const outreachRunTable: TableSpec<OutreachRunRecord> = {
  booleanFields: new Set(),
  columns: [
    "id",
    "startedAt",
    "finishedAt",
    "status",
    "claimedCount",
    "sentCount",
    "failedCount",
    "skippedCount",
    "metadata",
  ],
  dateFields: new Set(["startedAt", "finishedAt"]),
  idField: "id",
  integerFields: new Set(["claimedCount", "sentCount", "failedCount", "skippedCount"]),
  stringFields: new Set(["id", "status", "metadata"]),
  tableName: "OutreachRun",
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function getDatabase(): D1DatabaseLike {
  return getDbHandle();
}

async function getExistingTableColumns(tableName: string): Promise<string[]> {
  const cached = tableColumnsCache.get(tableName);
  if (cached) {
    return cached;
  }

  const rows = await allRows<Record<string, unknown>>(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  const columns = rows.map((row) => String(row.name || "")).filter(Boolean);
  tableColumnsCache.set(tableName, columns);
  return columns;
}

function normalizeDateString(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(" ", "T")}Z`;
  }

  return value;
}

function parseDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    return new Date(normalizeDateString(value));
  }

  return new Date(String(value));
}

function parseBooleanValue(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }

  return false;
}

function serializeValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

async function ensureLeadQualityColumns() {
  if (!leadSchemaEnsurePromise) {
    leadSchemaEnsurePromise = (async () => {
      const rows = await allRows<Record<string, unknown>>(`PRAGMA table_info("Lead")`);
      const existing = new Set(rows.map((row) => String(row.name || "")));
      const migrations: Array<[string, string]> = [
        ["websiteUrl", "TEXT"],
        ["websiteDomain", "TEXT"],
        ["emailFlags", "TEXT"],
        ["phoneFlags", "TEXT"],
        ["outreachStatus", `TEXT NOT NULL DEFAULT 'NOT_CONTACTED'`],
        ["outreachChannel", "TEXT"],
        ["firstContactedAt", "DATETIME"],
        ["lastContactedAt", "DATETIME"],
        ["nextFollowUpDue", "DATETIME"],
        ["outreachNotes", "TEXT"],
      ];

      for (const [column, sqlType] of migrations) {
        if (!existing.has(column)) {
          await runStatement(`ALTER TABLE "Lead" ADD COLUMN "${column}" ${sqlType}`);
          tableColumnsCache.delete("Lead");
        }
      }
    })().catch((error) => {
      leadSchemaEnsurePromise = null;
      throw error;
    });
  }

  await leadSchemaEnsurePromise;
}

function generateId() {
  return crypto.randomUUID();
}

function hydrateRow<T extends Record<string, unknown>>(
  spec: TableSpec<T>,
  row: DatabaseRow,
): T {
  const hydrated: Record<string, unknown> = {};

  for (const column of spec.columns) {
    const key = column as string;
    const rawValue = row[key];

    if (spec.booleanFields.has(column)) {
      hydrated[key] = rawValue === null || rawValue === undefined ? null : parseBooleanValue(rawValue);
      continue;
    }

    if (spec.dateFields.has(column)) {
      hydrated[key] = parseDateValue(rawValue);
      continue;
    }

    if (spec.integerFields.has(column)) {
      hydrated[key] = rawValue === null || rawValue === undefined ? null : Number(rawValue);
      continue;
    }

    if (spec.stringFields.has(column)) {
      hydrated[key] = rawValue === null || rawValue === undefined ? null : String(rawValue);
      continue;
    }

    if (typeof rawValue === "number") {
      hydrated[key] = rawValue;
      continue;
    }

    hydrated[key] = rawValue ?? null;
  }

  return hydrated as T;
}

function buildSelectClause<T extends Record<string, unknown>, S extends SelectMap<T> | undefined>(
  columns: Array<keyof T>,
  select?: S,
) {
  if (!select) {
    return columns.map((column) => quoteIdentifier(column as string)).join(", ");
  }

  const selectedColumns = columns.filter((column) => select[column]);
  const finalColumns = selectedColumns.length > 0 ? selectedColumns : columns;
  return finalColumns.map((column) => quoteIdentifier(column as string)).join(", ");
}

function projectSelection<T extends Record<string, unknown>, S extends SelectMap<T> | undefined>(
  record: T,
  select?: S,
) {
  if (!select) {
    return record as Selected<T, S>;
  }

  const projected: Partial<T> = {};

  for (const [key, enabled] of Object.entries(select)) {
    if (!enabled) {
      continue;
    }

    projected[key as keyof T] = record[key as keyof T];
  }

  return projected as Selected<T, S>;
}

function buildWhereClause(where: WhereInput | undefined, params: unknown[]): string {
  if (!where || Object.keys(where).length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR") {
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }

      const nested = value
        .map((entry) => buildWhereClause(entry as WhereInput, params))
        .filter(Boolean)
        .map((entry) => `(${entry})`);

      if (nested.length > 0) {
        parts.push(nested.join(` ${key} `));
      }

      continue;
    }

    const fieldName = quoteIdentifier(key);

    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value)
    ) {
      const operatorParts: string[] = [];

      for (const [operator, operand] of Object.entries(value)) {
        if (operator === "in" && Array.isArray(operand)) {
          if (operand.length === 0) {
            operatorParts.push("1 = 0");
            continue;
          }

          params.push(...operand.map(serializeValue));
          operatorParts.push(`${fieldName} IN (${operand.map(() => "?").join(", ")})`);
          continue;
        }

        if (operator === "not") {
          if (operand === null) {
            operatorParts.push(`${fieldName} IS NOT NULL`);
          } else {
            params.push(serializeValue(operand));
            operatorParts.push(`${fieldName} != ?`);
          }
          continue;
        }

        if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
          const sqlOperator =
            operator === "gt" ? ">" : operator === "gte" ? ">=" : operator === "lt" ? "<" : "<=";
          params.push(serializeValue(operand));
          operatorParts.push(`${fieldName} ${sqlOperator} ?`);
          continue;
        }

        if (operator === "equals") {
          if (operand === null) {
            operatorParts.push(`${fieldName} IS NULL`);
          } else {
            params.push(serializeValue(operand));
            operatorParts.push(`${fieldName} = ?`);
          }
        }
      }

      if (operatorParts.length > 0) {
        parts.push(operatorParts.length === 1 ? operatorParts[0] : `(${operatorParts.join(" AND ")})`);
      }

      continue;
    }

    if (value === null) {
      parts.push(`${fieldName} IS NULL`);
      continue;
    }

    params.push(serializeValue(value));
    parts.push(`${fieldName} = ?`);
  }

  return parts.join(" AND ");
}

function buildOrderByClause(orderBy?: Record<string, SortDirection>) {
  if (!orderBy) {
    return "";
  }

  const [field, direction] = Object.entries(orderBy)[0] ?? [];
  if (!field || !direction) {
    return "";
  }

  const normalizedDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
  return ` ORDER BY ${quoteIdentifier(field)} ${normalizedDirection}`;
}

function buildUpdateClause(data: Record<string, unknown>, params: unknown[], updatedAtField?: string) {
  const assignments: string[] = [];
  const currentTimestamp = new Date();
  const effectiveData: Record<string, unknown> = { ...data };

  if (updatedAtField && effectiveData[updatedAtField] === undefined) {
    effectiveData[updatedAtField] = currentTimestamp;
  }

  for (const [key, value] of Object.entries(effectiveData)) {
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      "increment" in value
    ) {
      params.push(serializeValue((value as { increment: unknown }).increment));
      assignments.push(`${quoteIdentifier(key)} = ${quoteIdentifier(key)} + ?`);
      continue;
    }

    params.push(serializeValue(value));
    assignments.push(`${quoteIdentifier(key)} = ?`);
  }

  return assignments.join(", ");
}

async function allRows<T = DatabaseRow>(query: string, params: unknown[] = []) {
  const result = await getDatabase()
    .prepare(query)
    .bind(...params.map(serializeValue))
    .all<T>();

  return result.results ?? [];
}

async function firstRow<T = DatabaseRow>(query: string, params: unknown[] = []) {
  return getDatabase()
    .prepare(query)
    .bind(...params.map(serializeValue))
    .first<T>();
}

async function runStatement(query: string, params: unknown[] = []) {
  return getDatabase()
    .prepare(query)
    .bind(...params.map(serializeValue))
    .run() as Promise<PreparedStatementResult>;
}

function createModel<T extends Record<string, unknown>>(spec: TableSpec<T>) {
  return {
    async count(args?: CountArgs) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const params: unknown[] = [];
      const whereClause = buildWhereClause(args?.where, params);
      const query = `SELECT COUNT(*) as count FROM ${quoteIdentifier(spec.tableName)}${whereClause ? ` WHERE ${whereClause}` : ""}`;
      const result = await firstRow<{ count: number | string }>(query, params);
      return Number(result?.count ?? 0);
    },

    async create(args: CreateArgs) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const now = new Date();
      const data = { ...args.data } as Record<string, unknown>;
      const existingColumns = new Set(await getExistingTableColumns(spec.tableName));

      if (!spec.autoIncrementId && data[spec.idField as string] === undefined) {
        data[spec.idField as string] = generateId();
      }

      if (spec.updatedAtField && data[spec.updatedAtField as string] === undefined) {
        data[spec.updatedAtField as string] = now;
      }

      const entries = Object.entries(data).filter(
        ([key, value]) => value !== undefined && existingColumns.has(key),
      );
      if (entries.length === 0) {
        throw new Error(`No writable columns found for ${spec.tableName}.`);
      }
      const columns = entries.map(([key]) => quoteIdentifier(key)).join(", ");
      const placeholders = entries.map(() => "?").join(", ");
      const params = entries.map(([, value]) => serializeValue(value));

      const result = await runStatement(
        `INSERT INTO ${quoteIdentifier(spec.tableName)} (${columns}) VALUES (${placeholders})`,
        params,
      );

      if (spec.autoIncrementId) {
        const lastRowId = Number(result.meta?.last_row_id ?? 0);
        return this.findUnique({
          where: { [spec.idField as string]: lastRowId },
        }) as Promise<T>;
      }

      return this.findUnique({
        where: { [spec.idField as string]: data[spec.idField as string] },
      }) as Promise<T>;
    },

    async delete(args: { where: WhereInput }) {
      const params: unknown[] = [];
      const whereClause = buildWhereClause(args.where, params);
      if (!whereClause) {
        throw new Error(`Refusing to delete from ${spec.tableName} without a where clause.`);
      }

      await runStatement(`DELETE FROM ${quoteIdentifier(spec.tableName)} WHERE ${whereClause}`, params);
    },

    async findFirst<S extends SelectMap<T> | undefined = undefined>(args?: FindManyArgs<T, S>) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const rows = await this.findMany({
        ...args,
        take: 1,
      });
      return rows[0] ?? null;
    },

    async findMany<S extends SelectMap<T> | undefined = undefined>(args?: FindManyArgs<T, S>) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const params: unknown[] = [];
      const whereClause = buildWhereClause(args?.where, params);
      const availableColumns = (await getExistingTableColumns(spec.tableName)) as Array<keyof T>;
      const selectClause = buildSelectClause(availableColumns, args?.select);
      const orderByClause = buildOrderByClause(args?.orderBy as Record<string, SortDirection> | undefined);
      const limitClause = args?.take ? " LIMIT ?" : "";

      if (args?.take) {
        params.push(args.take);
      }

      const query =
        `SELECT ${selectClause} FROM ${quoteIdentifier(spec.tableName)}` +
        (whereClause ? ` WHERE ${whereClause}` : "") +
        orderByClause +
        limitClause;

      const rows = await allRows(query, params);
      return rows.map((row) => projectSelection(hydrateRow(spec, row as DatabaseRow), args?.select));
    },

    async findUnique<S extends SelectMap<T> | undefined = undefined>(args: FindUniqueArgs<T, S>) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const params: unknown[] = [];
      const whereClause = buildWhereClause(args.where, params);
      if (!whereClause) {
        throw new Error(`Refusing to query ${spec.tableName} without a where clause.`);
      }

      const availableColumns = (await getExistingTableColumns(spec.tableName)) as Array<keyof T>;
      const selectClause = buildSelectClause(availableColumns, args.select);
      const query = `SELECT ${selectClause} FROM ${quoteIdentifier(spec.tableName)} WHERE ${whereClause} LIMIT 1`;
      const row = await firstRow(query, params);
      return row ? projectSelection(hydrateRow(spec, row as DatabaseRow), args.select) : null;
    },

    async update(args: MutationArgs) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const params: unknown[] = [];
      const existingColumns = new Set(await getExistingTableColumns(spec.tableName));
      const filteredData = Object.fromEntries(
        Object.entries(args.data).filter(([key, value]) => value !== undefined && existingColumns.has(key)),
      );
      if (Object.keys(filteredData).length === 0) {
        return this.findUnique({ where: args.where }) as Promise<T>;
      }

      const setClause = buildUpdateClause(filteredData, params, spec.updatedAtField as string | undefined);
      const whereClause = buildWhereClause(args.where, params);

      if (!whereClause) {
        throw new Error(`Refusing to update ${spec.tableName} without a where clause.`);
      }

      await runStatement(
        `UPDATE ${quoteIdentifier(spec.tableName)} SET ${setClause} WHERE ${whereClause}`,
        params,
      );

      return this.findUnique({ where: args.where }) as Promise<T>;
    },

    async updateMany(args: UpdateManyArgs) {
      if (spec.tableName === "Lead") {
        await ensureLeadQualityColumns();
      }
      const params: unknown[] = [];
      const existingColumns = new Set(await getExistingTableColumns(spec.tableName));
      const filteredData = Object.fromEntries(
        Object.entries(args.data).filter(([key, value]) => value !== undefined && existingColumns.has(key)),
      );
      if (Object.keys(filteredData).length === 0) {
        return { count: 0 };
      }

      const setClause = buildUpdateClause(filteredData, params, spec.updatedAtField as string | undefined);
      const whereClause = buildWhereClause(args.where, params);
      const result = await runStatement(
        `UPDATE ${quoteIdentifier(spec.tableName)} SET ${setClause}${whereClause ? ` WHERE ${whereClause}` : ""}`,
        params,
      );

      return {
        count: Number(result.meta?.changes ?? 0),
      };
    },
  };
}

function createPrismaLike(): PrismaLike {
  return {
    auditEvent: createModel(auditEventTable),
    lead: createModel(leadTable),
    rateLimitWindow: createModel(rateLimitWindowTable),
    scrapeRun: createModel(scrapeRunTable),
    user: createModel(userTable),
    gmailConnection: createModel(gmailConnectionTable),
    outreachEmail: createModel(outreachEmailTable),
    outreachAutomationSetting: createModel(outreachAutomationSettingTable),
    outreachMailbox: createModel(outreachMailboxTable),
    outreachSequence: createModel(outreachSequenceTable),
    outreachSequenceStep: createModel(outreachSequenceStepTable),
    outreachSuppression: createModel(outreachSuppressionTable),
    outreachRun: createModel(outreachRunTable),
  };
}

export function getPrisma(): PrismaLike {
  if (!globalForPrisma.axiomPrisma) {
    globalForPrisma.axiomPrisma = createPrismaLike();
  }

  return globalForPrisma.axiomPrisma;
}
