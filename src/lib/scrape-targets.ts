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

export interface ScrapeTargetCandidate extends ScrapeTargetRecord {
  adequateLeadCount: number;
  lastJobStatus: string | null;
  lastJobLeadsFound: number;
  lastJobWithEmail: number;
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

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTargetText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeScrapeTargetNiche(value: string | null | undefined) {
  const normalized = normalizeTargetText(value);
  const compact = normalized.replace(/\s+/g, "");

  if (["roofing", "roofer", "roofers"].includes(compact)) return "roofing";
  if (["electrician", "electricians", "electrical"].includes(compact)) return "electrician";
  if (["plumber", "plumbers", "plumbing"].includes(compact)) return "plumbing";
  if (["hvac", "heatingcooling", "heatingandcooling"].includes(compact)) return "hvac";
  if (["landscaper", "landscapers", "landscaping"].includes(compact)) return "landscaping";
  if (["concrete", "concretecontractor", "concretecontractors"].includes(compact)) return "concrete";
  if (["commercialcleaning", "cleaningservice", "cleaningservices"].includes(compact)) {
    return "commercial cleaning";
  }
  if (["customcabinetry", "cabinetry", "cabinetmaker", "cabinetmakers"].includes(compact)) {
    return "custom cabinetry";
  }
  if (["medspa", "medspas", "medicalspa", "medicalspas"].includes(compact)) return "med spas";
  if (["salon", "salons", "hairsalon", "hairsalons"].includes(compact)) return "salon";

  return normalized;
}

function targetYieldKey(niche: string | null | undefined, city: string | null | undefined) {
  return `${normalizeScrapeTargetNiche(niche)}|${normalizeTargetText(city)}`;
}

function candidateFromRow(row: Record<string, unknown>, adequateLeadCount: number): ScrapeTargetCandidate {
  const target = targetFromRow(row);
  const stats = parseJsonRecord(row.lastJobStatsJson);

  return {
    ...target,
    adequateLeadCount,
    lastJobStatus: row.lastJobStatus ? String(row.lastJobStatus) : null,
    lastJobLeadsFound: parseNumber(stats?.leadsFound),
    lastJobWithEmail: parseNumber(stats?.withEmail),
  };
}

export function getScrapeTargetPriorityBand(candidate: Pick<
  ScrapeTargetCandidate,
  "adequateLeadCount" | "lastJobLeadsFound" | "lastJobStatus" | "lastJobWithEmail" | "lastRunAt" | "totalLeadsFound" | "totalRuns"
>) {
  if (candidate.adequateLeadCount > 0) return 0;
  if (!candidate.lastRunAt || candidate.totalRuns === 0) return 1;
  if (candidate.lastJobWithEmail > 0) return 2;
  if (candidate.lastJobLeadsFound > 0) return 3;
  if (candidate.lastJobStatus === "failed") return 5;
  if (candidate.totalRuns >= 2 && candidate.totalLeadsFound === 0) return 6;
  return 4;
}

export function compareScrapeTargetCandidates(a: ScrapeTargetCandidate, b: ScrapeTargetCandidate) {
  const bandDiff = getScrapeTargetPriorityBand(a) - getScrapeTargetPriorityBand(b);
  if (bandDiff !== 0) return bandDiff;

  const adequateDiff = b.adequateLeadCount - a.adequateLeadCount;
  if (adequateDiff !== 0) return adequateDiff;

  const emailDiff = b.lastJobWithEmail - a.lastJobWithEmail;
  if (emailDiff !== 0) return emailDiff;

  const leadDiff = b.lastJobLeadsFound - a.lastJobLeadsFound;
  if (leadDiff !== 0) return leadDiff;

  const lifetimeYieldDiff = b.totalLeadsFound - a.totalLeadsFound;
  if (lifetimeYieldDiff !== 0) return lifetimeYieldDiff;

  const lastRunDiff = (a.lastRunAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
    (b.lastRunAt?.getTime() ?? Number.NEGATIVE_INFINITY);
  if (lastRunDiff !== 0) return lastRunDiff;

  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

async function getAdequateLeadCountsByTarget() {
  const result = await db()
    .prepare(
      `SELECT COALESCE("niche", '') AS niche,
              COALESCE("city", '') AS city,
              COUNT(*) AS count
       FROM "Lead"
       WHERE "axiomScore" >= 45
         AND COALESCE("axiomTier", '') != 'D'
         AND LOWER(COALESCE("emailType", '')) IN ('owner', 'staff')
         AND COALESCE("email", '') != ''
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
         AND COALESCE("isArchived", 0) = 0
       GROUP BY COALESCE("niche", ''), COALESCE("city", '')`,
    )
    .all<Record<string, unknown>>();

  const counts = new Map<string, number>();
  for (const row of result.results ?? []) {
    const key = targetYieldKey(String(row.niche || ""), String(row.city || ""));
    counts.set(key, (counts.get(key) || 0) + Number(row.count || 0));
  }

  return counts;
}

export async function pickNextScrapeTarget(): Promise<ScrapeTargetRecord | null> {
  const [rows, adequateLeadCounts] = await Promise.all([
    db()
    .prepare(
      `SELECT t.*,
              j."status" AS lastJobStatus,
              j."statsJson" AS lastJobStatsJson
       FROM "ScrapeTarget" t
       LEFT JOIN "ScrapeJob" j ON j."id" = t."lastJobId"
       WHERE "active" = 1
       LIMIT 1000`,
    )
      .all<Record<string, unknown>>(),
    getAdequateLeadCountsByTarget(),
  ]);

  const candidates = (rows.results ?? [])
    .map((row) => candidateFromRow(row, adequateLeadCounts.get(targetYieldKey(String(row.niche || ""), String(row.city || ""))) || 0))
    .sort(compareScrapeTargetCandidates);

  const selected = candidates[0] ?? null;
  if (selected) {
    console.log(
      `[intake] Selected scrape target ${selected.niche}/${selected.city} ` +
      `band=${getScrapeTargetPriorityBand(selected)} adequateHistory=${selected.adequateLeadCount} ` +
      `lastWithEmail=${selected.lastJobWithEmail} lastLeads=${selected.lastJobLeadsFound}`,
    );
  }

  return selected;
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

export async function markScrapeTargetCompleted(jobId: string, leadsFound: number): Promise<void> {
  const now = new Date().toISOString();
  await db()
    .prepare(
      `UPDATE "ScrapeTarget"
       SET "totalLeadsFound" = "totalLeadsFound" + ?,
           "updatedAt" = ?
       WHERE "lastJobId" = ?`,
    )
    .bind(Math.max(0, Math.floor(leadsFound || 0)), now, jobId)
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
