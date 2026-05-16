const DEFAULT_INTAKE_TIMEOUT_MS = 120_000;
const DEFAULT_SCRAPE_TIMEOUT_MS = 840_000;
const DEFAULT_SCHEDULER_TIMEOUT_MS = 900_000;
const DEFAULT_DIGEST_TIMEOUT_MS = 60_000;
const CLEANUP_BUFFER_MS = 30_000;

type CronTimeoutEnv = {
  CLOUD_SCRAPE_TIMEOUT_MS?: number | string | null;
};

function positiveInt(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getCronTimeoutBudgets(env: CronTimeoutEnv = {}) {
  const scrapeRuntimeMs = positiveInt(env.CLOUD_SCRAPE_TIMEOUT_MS, DEFAULT_SCRAPE_TIMEOUT_MS);

  return {
    intake: DEFAULT_INTAKE_TIMEOUT_MS,
    scrape: scrapeRuntimeMs + CLEANUP_BUFFER_MS,
    scheduler: DEFAULT_SCHEDULER_TIMEOUT_MS,
    digest: DEFAULT_DIGEST_TIMEOUT_MS,
  };
}
