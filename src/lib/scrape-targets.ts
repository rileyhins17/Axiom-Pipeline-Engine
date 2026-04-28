import { getDatabase } from "@/lib/cloudflare";

export interface ScrapeTargetRecord {
  id: string;
  niche: string;
  city: string;
  region: string;
  country: string;
  radius: string;
  maxDepth: number;
  active: boolean;
  lastRunAt: Date | null;
  lastJobId: string | null;
  totalRuns: number;
  totalLeadsFound: number;
  createdAt: Date;
  updatedAt: Date;
}

function db() {
  return getDatabase();
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function targetFromRow(row: Record<string, unknown>): ScrapeTargetRecord {
  return {
    id: String(row.id || ""),
    niche: String(row.niche || ""),
    city: String(row.city || ""),
    region: String(row.region || ""),
    country: String(row.country || "CA"),
    radius: String(row.radius || "15"),
    maxDepth: Number(row.maxDepth || 6),
    active: Number(row.active || 0) === 1,
    lastRunAt: parseDate(row.lastRunAt),
    lastJobId: row.lastJobId ? String(row.lastJobId) : null,
    totalRuns: Number(row.totalRuns || 0),
    totalLeadsFound: Number(row.totalLeadsFound || 0),
    createdAt: parseDate(row.createdAt) || new Date(),
    updatedAt: parseDate(row.updatedAt) || new Date(),
  };
}

export async function pickNextScrapeTarget(): Promise<ScrapeTargetRecord | null> {
  // Round-robin: oldest lastRunAt first, NULLs (never-run) come first.
  const row = await db()
    .prepare(
      `SELECT * FROM "ScrapeTarget"
       WHERE "active" = 1
       ORDER BY CASE WHEN "lastRunAt" IS NULL THEN 0 ELSE 1 END ASC,
                "lastRunAt" ASC,
                "createdAt" ASC
       LIMIT 1`,
    )
    .first<Record<string, unknown>>();

  return row ? targetFromRow(row) : null;
}

export async function markScrapeTargetDispatched(
  targetId: string,
  jobId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db()
    .prepare(
      `UPDATE "ScrapeTarget"
       SET "lastRunAt" = ?,
           "lastJobId" = ?,
           "totalRuns" = "totalRuns" + 1,
           "updatedAt" = ?
       WHERE "id" = ?`,
    )
    .bind(now, jobId, now, targetId)
    .run();
}

export async function listRecentScrapeTargets(limit = 5): Promise<ScrapeTargetRecord[]> {
  const result = await db()
    .prepare(
      `SELECT * FROM "ScrapeTarget"
       WHERE "lastRunAt" IS NOT NULL
       ORDER BY "lastRunAt" DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(targetFromRow);
}

export async function countActiveScrapeTargets(): Promise<number> {
  const row = await db()
    .prepare(`SELECT COUNT(*) AS count FROM "ScrapeTarget" WHERE "active" = 1`)
    .first<{ count: number | string }>();
  return Number(row?.count || 0);
}
