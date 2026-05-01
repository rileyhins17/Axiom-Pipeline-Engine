import { writeAuditEvent } from "@/lib/audit";
import { getDatabase } from "@/lib/cloudflare";
import {
  AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
  AUTONOMOUS_INTAKE_MIN_SCORE,
} from "@/lib/automation-policy";
import { getServerEnv } from "@/lib/env";
import { getAutomationSettings } from "@/lib/outreach-automation";
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

function sqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function getAutonomousDailyLeadCap() {
  const env = getServerEnv();
  return env.AUTONOMOUS_DAILY_LEAD_INTAKE_CAP || AUTONOMOUS_DAILY_LEAD_INTAKE_CAP;
}

/**
 * Counts leads created today that pass the autonomous-queue predicate.
 * Mirrors `shouldAutonomouslyQueueLead`: axiomScore >= 45, tier != D,
 * non-generic email, has email, not archived. SQL-side for speed.
 */
export async function countAdequateLeadsToday(): Promise<number> {
  const since = sqlDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const row = await getDatabase()
    .prepare(
      `SELECT COUNT(*) AS count FROM "Lead"
       WHERE datetime("createdAt") >= datetime(?)
         AND "axiomScore" >= ?
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
         AND COALESCE("isArchived", 0) = 0`,
    )
    .bind(since, AUTONOMOUS_INTAKE_MIN_SCORE)
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
  const env = getServerEnv();
  if (!env.AUTONOMOUS_INTAKE_ENABLED) {
    return { dispatched: false, reason: "intake_disabled_kill_switch" };
  }

  const settings = await getAutomationSettings();
  if (settings.emergencyPaused) {
    return { dispatched: false, reason: "emergency_stop_active" };
  }

  const activeJobs = await countActiveOrPendingScrapeJobs();
  if (activeJobs > 0) {
    return { dispatched: false, reason: "scrape job already active" };
  }

  const adequateToday = await countAdequateLeadsToday();
  const dailyLeadCap = getAutonomousDailyLeadCap();
  if (adequateToday >= dailyLeadCap) {
    return {
      dispatched: false,
      reason: "daily intake cap reached",
      adequateToday,
      cap: dailyLeadCap,
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
      cap: dailyLeadCap,
    },
  });

  return {
    dispatched: true,
    reason: "ok",
    jobId: job.id,
    niche: target.niche,
    city: target.city,
    adequateToday,
    cap: dailyLeadCap,
  };
}
