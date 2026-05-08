import { getDatabase } from "@/lib/cloudflare";

export const SCRAPE_QUALITY_GLOBAL_PAUSE_FAILURE_THRESHOLD = 2;

const SCRAPE_QUALITY_FAILURE_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function countRecentScrapeQualityGateFailures(currentJobId?: string): Promise<number> {
  const since = new Date(Date.now() - SCRAPE_QUALITY_FAILURE_WINDOW_MS).toISOString();
  const params: string[] = [];
  let excludeCurrentJob = "";

  if (currentJobId) {
    excludeCurrentJob = `AND "id" != ?`;
    params.push(currentJobId);
  }

  params.push("Scrape quality gate tripped:%", since);

  const row = await getDatabase()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM "ScrapeJob"
       WHERE "status" = 'failed'
         ${excludeCurrentJob}
         AND "errorMessage" LIKE ?
         AND datetime("updatedAt") >= datetime(?)`,
    )
    .bind(...params)
    .first<{ count: number | string }>();

  return Number(row?.count || 0);
}

export async function shouldPauseIntakeForScrapeQualityGate(currentJobId?: string): Promise<boolean> {
  const recentFailures = await countRecentScrapeQualityGateFailures(currentJobId);
  return recentFailures + 1 >= SCRAPE_QUALITY_GLOBAL_PAUSE_FAILURE_THRESHOLD;
}
