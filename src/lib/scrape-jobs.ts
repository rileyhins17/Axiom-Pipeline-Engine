import { getDatabase } from "@/lib/cloudflare";

export type ScrapeJobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type ScrapeJobEventPayload = Record<string, unknown> & {
  _done?: boolean;
  error?: string;
  eventId?: number;
  jobId?: string;
  jobStatus?: ScrapeJobStatus;
  message?: string;
  scoreUpdate?: {
    axiomScore: number;
    tier: string;
    businessName: string;
    breakdown: unknown;
    websiteStatus: string;
    websiteQuality: string;
    websiteLabel: string;
    outreachEligible: boolean;
    hasValidEmail: boolean;
    emailGateApplied: boolean;
    fitLabel: string;
    reasonSummary: string[];
  };
  progress?: number;
  stats?: {
    avgScore?: number;
    leadsFound?: number;
    withEmail?: number;
    [key: string]: unknown;
  };
  total?: number;
};

export interface ScrapeJobRecord {
  actorUserId: string | null;
  claimedAt: Date | null;
  claimedBy: string | null;
  city: string;
  createdAt: Date;
  errorMessage: string | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  id: string;
  maxDepth: number;
  niche: string;
  radius: string;
  stats: Record<string, unknown> | null;
  status: ScrapeJobStatus;
  updatedAt: Date;
}

export interface ScrapeJobSummary {
  claimedBy: string | null;
  createdAt: Date;
  city: string;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  id: string;
  maxDepth: number;
  niche: string;
  radius: string;
  status: ScrapeJobStatus;
  updatedAt: Date;
}

export interface WorkerHealthRecord {
  claimedJobId: string | null;
  claimedJobStatus: ScrapeJobStatus | null;
  heartbeatAgeSeconds: number | null;
  lastHeartbeatAt: Date | null;
  online: boolean;
  workerName: string | null;
}

export interface ScrapeJobEventRecord {
  createdAt: Date;
  eventType: string;
  id: number;
  jobId: string;
  payload: ScrapeJobEventPayload;
}

export interface ScrapeJobLeadSnapshot {
  businessName: string;
  city: string;
  dedupeKey: string;
  phone: string | null;
}

export interface ScrapeLeadWriteInput {
  address: string | null;
  axiomScore: number;
  axiomTier: string;
  axiomWebsiteAssessment: string | null;
  businessName: string;
  callOpener: string;
  category: string | null;
  city: string;
  contactName: string | null;
  dedupeKey: string;
  dedupeMatchedBy: string;
  disqualifiers: string | null;
  disqualifyReason: string | null;
  email: string;
  emailConfidence: number;
  emailFlags: string | null;
  emailType: string;
  enrichedAt?: Date | string | null;
  enrichmentData?: string | null;
  followUpQuestion: string;
  isArchived: boolean;
  lastUpdated: Date;
  leadScore: number;
  niche: string;
  painSignals: string;
  phone: string;
  phoneConfidence: number;
  phoneFlags: string | null;
  outreachStatus?: string | null;
  rating: number;
  reviewCount: number;
  scoreBreakdown: string;
  socialLink: string;
  source: string | null;
  tacticalNote: string;
  websiteGrade: string | null;
  websiteDomain: string | null;
  websiteUrl: string | null;
  websiteStatus: string;
}

export interface CreateScrapeJobInput {
  actorUserId: string;
  city: string;
  maxDepth: number;
  niche: string;
  radius: string;
}

export interface ClaimScrapeJobInput {
  agentName: string;
  maxActiveJobs: number;
  staleBefore: Date;
}

function db() {
  return getDatabase();
}

function normalizeValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function jobFromRow(row: Record<string, unknown>): ScrapeJobRecord {
  return {
    actorUserId: row.actorUserId === null || row.actorUserId === undefined ? null : String(row.actorUserId),
    claimedAt: parseDate(row.claimedAt),
    claimedBy: row.claimedBy === null || row.claimedBy === undefined ? null : String(row.claimedBy),
    city: String(row.city || ""),
    createdAt: parseDate(row.createdAt) || new Date(),
    errorMessage: row.errorMessage === null || row.errorMessage === undefined ? null : String(row.errorMessage),
    finishedAt: parseDate(row.finishedAt),
    heartbeatAt: parseDate(row.heartbeatAt),
    id: String(row.id || ""),
    maxDepth: Number(row.maxDepth || 0),
    niche: String(row.niche || ""),
    radius: String(row.radius || ""),
    stats: parseJsonRecord(row.statsJson),
    status: String(row.status || "pending") as ScrapeJobStatus,
    updatedAt: parseDate(row.updatedAt) || new Date(),
  };
}

function eventFromRow(row: Record<string, unknown>): ScrapeJobEventRecord {
  return {
    createdAt: parseDate(row.createdAt) || new Date(),
    eventType: String(row.eventType || "log"),
    id: Number(row.id || 0),
    jobId: String(row.jobId || ""),
    payload: (parseJsonRecord(row.payload) || {}) as ScrapeJobEventPayload,
  };
}

async function allRows<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  const result = await db().prepare(query).bind(...params.map(normalizeValue)).all<T>();
  return result.results ?? [];
}

async function firstRow<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  return db().prepare(query).bind(...params.map(normalizeValue)).first<T>();
}

async function runStatement(query: string, params: unknown[] = []) {
  return db()
    .prepare(query)
    .bind(...params.map(normalizeValue))
    .run();
}

export async function createScrapeJob(input: CreateScrapeJobInput): Promise<ScrapeJobRecord> {
  const now = new Date();
  const id = crypto.randomUUID();

  await runStatement(
    `INSERT INTO "ScrapeJob" (
      "id",
      "actorUserId",
      "status",
      "niche",
      "city",
      "radius",
      "maxDepth",
      "createdAt",
      "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.actorUserId,
      "pending",
      input.niche,
      input.city,
      input.radius,
      input.maxDepth,
      now,
      now,
    ],
  );

  const job = await getScrapeJob(id);
  if (!job) {
    throw new Error("Failed to create scrape job.");
  }

  return job;
}

export async function getScrapeJob(jobId: string): Promise<ScrapeJobRecord | null> {
  const row = await firstRow<Record<string, unknown>>(`SELECT * FROM "ScrapeJob" WHERE "id" = ? LIMIT 1`, [jobId]);
  return row ? jobFromRow(row) : null;
}

function summaryFromRow(row: Record<string, unknown>): ScrapeJobSummary {
  return {
    claimedBy: row.claimedBy === null || row.claimedBy === undefined ? null : String(row.claimedBy),
    createdAt: parseDate(row.createdAt) || new Date(),
    city: String(row.city || ""),
    finishedAt: parseDate(row.finishedAt),
    heartbeatAt: parseDate(row.heartbeatAt),
    id: String(row.id || ""),
    maxDepth: Number(row.maxDepth || 0),
    niche: String(row.niche || ""),
    radius: String(row.radius || ""),
    status: String(row.status || "pending") as ScrapeJobStatus,
    updatedAt: parseDate(row.updatedAt) || new Date(),
  };
}

export async function listScrapeJobs(limit = 12): Promise<ScrapeJobSummary[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT * FROM "ScrapeJob"
     ORDER BY
       CASE "status"
         WHEN 'running' THEN 0
         WHEN 'claimed' THEN 1
         WHEN 'pending' THEN 2
         WHEN 'failed' THEN 3
         WHEN 'canceled' THEN 4
         WHEN 'completed' THEN 5
         ELSE 6
       END,
       COALESCE("heartbeatAt", "updatedAt") DESC,
       "createdAt" DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map(summaryFromRow);
}

export async function countActiveScrapeJobs(): Promise<number> {
  const row = await firstRow<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM "ScrapeJob" WHERE "status" IN ('claimed', 'running')`,
  );
  return Number(row?.count || 0);
}

export async function recycleStaleScrapeJobs(staleBefore: Date): Promise<number> {
  const now = new Date();
  const result = await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'pending',
         "claimedBy" = NULL,
         "claimedAt" = NULL,
         "heartbeatAt" = NULL,
         "errorMessage" = NULL,
         "updatedAt" = ?
     WHERE "status" IN ('claimed', 'running')
       AND "finishedAt" IS NULL
       AND "heartbeatAt" IS NOT NULL
       AND "heartbeatAt" < ?`,
    [now, staleBefore],
  );

  return Number(result.meta?.changes ?? 0);
}

export async function claimNextScrapeJob(input: ClaimScrapeJobInput): Promise<ScrapeJobRecord | null> {
  await recycleStaleScrapeJobs(input.staleBefore);

  const activeCount = await countActiveScrapeJobs();
  if (activeCount >= input.maxActiveJobs) {
    return null;
  }

  const now = new Date();
  const row = await firstRow<Record<string, unknown>>(
    `UPDATE "ScrapeJob"
     SET "status" = 'claimed',
         "claimedBy" = ?,
         "claimedAt" = COALESCE("claimedAt", ?),
         "heartbeatAt" = ?,
         "updatedAt" = ?
     WHERE "id" = (
       SELECT "id"
       FROM "ScrapeJob"
       WHERE "status" = 'pending'
         AND "finishedAt" IS NULL
       ORDER BY "createdAt" ASC
       LIMIT 1
     )
       AND "status" = 'pending'
       AND "finishedAt" IS NULL
     RETURNING *`,
    [input.agentName, now, now, now],
  );

  if (!row) {
    return null;
  }

  return jobFromRow(row);
}

export async function getScrapeJobEventsAfter(
  jobId: string,
  afterEventId = 0,
): Promise<ScrapeJobEventRecord[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT * FROM "ScrapeJobEvent"
     WHERE "jobId" = ? AND "id" > ?
     ORDER BY "id" ASC`,
    [jobId, afterEventId],
  );

  return rows.map(eventFromRow);
}

export async function appendScrapeJobEvent(
  jobId: string,
  eventType: string,
  payload: ScrapeJobEventPayload,
): Promise<ScrapeJobEventRecord> {
  const now = new Date();
  await runStatement(
    `INSERT INTO "ScrapeJobEvent" ("jobId", "eventType", "payload", "createdAt")
     VALUES (?, ?, ?, ?)`,
    [jobId, eventType, JSON.stringify(payload), now],
  );

  const row = await firstRow<Record<string, unknown>>(
    `SELECT * FROM "ScrapeJobEvent"
     WHERE "jobId" = ?
     ORDER BY "id" DESC
     LIMIT 1`,
    [jobId],
  );

  if (!row) {
    throw new Error("Failed to append scrape job event.");
  }

  return eventFromRow(row);
}

export async function touchScrapeJobHeartbeat(jobId: string, agentName?: string): Promise<ScrapeJobRecord | null> {
  const now = new Date();
  await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'running',
         "claimedBy" = COALESCE(?, "claimedBy"),
         "heartbeatAt" = ?,
         "updatedAt" = ?
     WHERE "id" = ? AND "finishedAt" IS NULL`,
    [agentName ?? null, now, now, jobId],
  );

  return getScrapeJob(jobId);
}

export async function completeScrapeJob(
  jobId: string,
  input: {
    errorMessage?: string | null;
    stats?: Record<string, unknown> | null;
  } = {},
): Promise<ScrapeJobRecord | null> {
  const now = new Date();
  await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'completed',
         "errorMessage" = ?,
         "statsJson" = ?,
         "heartbeatAt" = ?,
         "finishedAt" = ?,
         "updatedAt" = ?
     WHERE "id" = ?`,
    [
      input.errorMessage ?? null,
      input.stats ? JSON.stringify(input.stats) : null,
      now,
      now,
      now,
      jobId,
    ],
  );

  return getScrapeJob(jobId);
}

export async function failScrapeJob(
  jobId: string,
  errorMessage: string,
): Promise<ScrapeJobRecord | null> {
  const now = new Date();
  await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'failed',
         "errorMessage" = ?,
         "heartbeatAt" = ?,
         "finishedAt" = ?,
         "updatedAt" = ?
     WHERE "id" = ?`,
    [errorMessage, now, now, now, jobId],
  );

  return getScrapeJob(jobId);
}

export async function cancelScrapeJob(
  jobId: string,
  reason = "Canceled by operator.",
): Promise<ScrapeJobRecord | null> {
  const now = new Date();
  await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'canceled',
         "errorMessage" = ?,
         "heartbeatAt" = ?,
         "finishedAt" = ?,
         "updatedAt" = ?
     WHERE "id" = ?`,
    [reason, now, now, now, jobId],
  );

  return getScrapeJob(jobId);
}

export async function cancelAllActiveScrapeJobs(
  reason = "Canceled by operator.",
): Promise<number> {
  const now = new Date();
  const result = await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'canceled',
         "errorMessage" = ?,
         "heartbeatAt" = ?,
         "finishedAt" = ?,
         "updatedAt" = ?
     WHERE "status" IN ('pending', 'claimed', 'running')
       AND "finishedAt" IS NULL`,
    [reason, now, now, now],
  );

  return Number(result.meta?.changes ?? 0);
}

export async function clearTerminalScrapeJobs(): Promise<number> {
  const result = await runStatement(
    `DELETE FROM "ScrapeJob"
     WHERE "status" IN ('completed', 'failed', 'canceled')`,
  );

  return Number(result.meta?.changes ?? 0);
}

export async function resetScrapeJobForRetry(jobId: string): Promise<ScrapeJobRecord | null> {
  const now = new Date();
  await runStatement(
    `UPDATE "ScrapeJob"
     SET "status" = 'pending',
         "claimedBy" = NULL,
         "claimedAt" = NULL,
         "heartbeatAt" = NULL,
         "errorMessage" = NULL,
         "statsJson" = NULL,
         "finishedAt" = NULL,
         "updatedAt" = ?
     WHERE "id" = ?`,
    [now, jobId],
  );

  return getScrapeJob(jobId);
}

export async function listClaimableScrapeJobs(): Promise<ScrapeJobRecord[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT * FROM "ScrapeJob"
     WHERE "status" = 'pending' AND "finishedAt" IS NULL
     ORDER BY "createdAt" ASC`,
  );

  return rows.map(jobFromRow);
}

export async function getWorkerHealth(staleAfterSeconds = 60): Promise<WorkerHealthRecord> {
  const staleBefore = new Date(Date.now() - staleAfterSeconds * 1000);
  await recycleStaleScrapeJobs(staleBefore);

  const activeRow = await firstRow<Record<string, unknown>>(
    `SELECT * FROM "ScrapeJob"
     WHERE "status" IN ('claimed', 'running')
     ORDER BY COALESCE("heartbeatAt", "updatedAt") DESC, "createdAt" DESC
     LIMIT 1`,
  );

  const fallbackRow = activeRow
    ? activeRow
    : await firstRow<Record<string, unknown>>(
        `SELECT * FROM "ScrapeJob"
         WHERE "claimedBy" IS NOT NULL
         ORDER BY COALESCE("heartbeatAt", "updatedAt") DESC, "createdAt" DESC
         LIMIT 1`,
      );

  if (!fallbackRow) {
    return {
      claimedJobId: null,
      claimedJobStatus: null,
      heartbeatAgeSeconds: null,
      lastHeartbeatAt: null,
      online: false,
      workerName: null,
    };
  }

  const lastHeartbeatAt = parseDate(fallbackRow.heartbeatAt) ?? parseDate(fallbackRow.updatedAt);
  const heartbeatAgeSeconds = lastHeartbeatAt
    ? Math.max(0, Math.floor((Date.now() - lastHeartbeatAt.getTime()) / 1000))
    : null;
  const online = Boolean(lastHeartbeatAt && heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= staleAfterSeconds);
  const claimedJobId = activeRow ? String(activeRow.id || "") || null : null;
  const claimedJobStatus = activeRow
    ? (String(activeRow.status || "pending") as ScrapeJobStatus)
    : null;

  return {
    claimedJobId,
    claimedJobStatus,
    heartbeatAgeSeconds,
    lastHeartbeatAt,
    online,
    workerName: fallbackRow.claimedBy === null || fallbackRow.claimedBy === undefined ? null : String(fallbackRow.claimedBy),
  };
}
