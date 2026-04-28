import { writeAuditEvent } from "@/lib/audit";
import { getDatabase } from "@/lib/cloudflare";
import {
  AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
  AUTONOMOUS_QUEUE_MIN_SCORE,
} from "@/lib/automation-policy";
import { createScrapeJob } from "@/lib/scrape-jobs";
import {
  markScrapeTargetDispatched,
  pickNextScrapeTarget,
} from "@/lib/scrape-targets";

const SYSTEM_USER_ID = "system";

export interface IntakeResult {
  dispatched: boolean;
  reason: string;
  jobId?: string;
  niche?: string;
  city?: string;
  adequateToday?: number;
  cap?: number;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Counts leads created today that pass the autonomous-queue predicate.
 * Mirrors `shouldAutonomouslyQueueLead`: axiomScore >= 45, tier != D,
 * non-generic email, has email, not archived. SQL-side for speed.
 */
export async function countAdequateLeadsToday(): Promise<number> {
  const since = startOfTodayUtc().toISOString();
  const row = await getDatabase()
    .prepare(
      `SELECT COUNT(*) AS count FROM "Lead"
       WHERE "createdAt" >= ?
         AND "axiomScore" >= ?
         AND COALESCE("axiomTier",'') != 'D'
         AND LOWER(COALESCE("emailType",'')) != 'generic'
         AND COALESCE("email",'') != ''
         AND COALESCE("isArchived", 0) = 0`,
    )
    .bind(since, AUTONOMOUS_QUEUE_MIN_SCORE)
    .first<{ count: number | string }>();

  return Number(row?.count || 0);
}

/**
 * Counts ScrapeJobs that are pending/claimed/running. Concurrency 1.
 */
async function countActiveOrPendingScrapeJobs(): Promise<number> {
  const row = await getDatabase()
    .prepare(
      `SELECT COUNT(*) AS count FROM "ScrapeJob"
       WHERE "status" IN ('pending','claimed','running')
         AND "finishedAt" IS NULL`,
    )
    .first<{ count: number | string }>();
  return Number(row?.count || 0);
}

/**
 * Autonomous intake tick. Dispatches one ScrapeJob from the next due
 * ScrapeTarget if (a) no scrape job is already pending/claimed/running and
 * (b) today's adequate-lead count is below the daily cap.
 *
 * Designed to be called from the Cloudflare cron handler in worker.mjs.
 */
export async function runAutonomousIntake(): Promise<IntakeResult> {
  const activeJobs = await countActiveOrPendingScrapeJobs();
  if (activeJobs > 0) {
    return { dispatched: false, reason: "scrape job already active" };
  }

  const adequateToday = await countAdequateLeadsToday();
  if (adequateToday >= AUTONOMOUS_DAILY_LEAD_INTAKE_CAP) {
    return {
      dispatched: false,
      reason: "daily intake cap reached",
      adequateToday,
      cap: AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
    };
  }

  const target = await pickNextScrapeTarget();
  if (!target) {
    return { dispatched: false, reason: "no active scrape targets" };
  }

  const job = await createScrapeJob({
    actorUserId: SYSTEM_USER_ID,
    niche: target.niche,
    city: target.city,
    radius: target.radius,
    maxDepth: target.maxDepth,
  });

  await markScrapeTargetDispatched(target.id, job.id);

  await writeAuditEvent({
    action: "intake.autonomous_dispatch",
    actorUserId: SYSTEM_USER_ID,
    ipAddress: "cloudflare-cron",
    targetId: job.id,
    targetType: "scrape_job",
    metadata: {
      targetId: target.id,
      niche: target.niche,
      city: target.city,
      region: target.region,
      country: target.country,
      adequateToday,
      cap: AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
    },
  });

  return {
    dispatched: true,
    reason: "ok",
    jobId: job.id,
    niche: target.niche,
    city: target.city,
    adequateToday,
    cap: AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
  };
}
