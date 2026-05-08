import { writeAuditEvent } from "@/lib/audit";
import { getCloudflareBindings } from "@/lib/cloudflare";
import { generateDedupeKey } from "@/lib/dedupe";
import { getServerEnv } from "@/lib/env";
import { getAutomationSettings, updateAutomationSettings } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { executeScrapeJob } from "@/lib/scrape-engine-worker";
import { persistScrapeJobLead } from "@/lib/scrape-lead-persistence";
import { shouldPauseIntakeForScrapeQualityGate } from "@/lib/scrape-quality-pausing";
import { ScrapeQualityGateError } from "@/lib/scrape-quality";
import {
  appendScrapeJobEvent,
  claimNextScrapeJob,
  completeScrapeJob,
  failScrapeJob,
  getScrapeJob,
  touchScrapeJobHeartbeat,
  type ScrapeJobEventPayload,
  type ScrapeJobRecord,
  type ScrapeLeadWriteInput,
} from "@/lib/scrape-jobs";
import { markScrapeTargetCompleted } from "@/lib/scrape-targets";

const DEFAULT_CLOUD_WORKER_NAME = "cloudflare-browser";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

type ExistingLeadDedupeCandidate = {
  axiomScore?: number | null;
  axiomTier?: string | null;
  email?: string | null;
  isArchived?: boolean | null;
  websiteDomain?: string | null;
  websiteUrl?: string | null;
};

function isEnabled(value: string | undefined, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return !/^(0|false|no|off)$/i.test(value.trim());
}

export function shouldUseExistingLeadForScrapeDedupe(lead: ExistingLeadDedupeCandidate) {
  const hasContactOrWebsite = Boolean(
    String(lead.email || "").trim() ||
      String(lead.websiteUrl || "").trim() ||
      String(lead.websiteDomain || "").trim(),
  );

  if (hasContactOrWebsite) {
    return true;
  }

  if (!lead.isArchived) {
    return true;
  }

  const score = Number(lead.axiomScore || 0);
  return score >= 45 && String(lead.axiomTier || "").toUpperCase() !== "D";
}

function eventTypeForPayload(payload: ScrapeJobEventPayload) {
  if (payload._done === true) return "done";
  if (payload.error) return "error";
  if (typeof payload.progress === "number") return "progress";
  return "log";
}

function buildScrapeJobStats(result: Awaited<ReturnType<typeof executeScrapeJob>>) {
  return {
    avgScore: result.avgScore,
    leadsFound: result.leadsFound,
    qualityIssues: result.qualityIssues ?? [],
    qualityStatus: result.qualityStatus ?? "healthy",
    targetsFound: result.targetsFound ?? 0,
    targetsWithCategory: result.targetsWithCategory ?? 0,
    targetsWithPhone: result.targetsWithPhone ?? 0,
    targetsWithRatingReviews: result.targetsWithRatingReviews ?? 0,
    targetsWithWebsite: result.targetsWithWebsite ?? 0,
    withEmail: result.withEmail,
  };
}

async function getExistingDedupeKeys() {
  const prisma = getPrisma();
  const existingLeads = await prisma.lead.findMany({
    select: {
      axiomScore: true,
      axiomTier: true,
      businessName: true,
      city: true,
      dedupeKey: true,
      email: true,
      isArchived: true,
      phone: true,
      websiteDomain: true,
      websiteUrl: true,
    },
  });

  return existingLeads
    .filter(shouldUseExistingLeadForScrapeDedupe)
    .map((lead) =>
      lead.dedupeKey || generateDedupeKey(lead.businessName, lead.city || "", lead.phone || "").key,
    );
}

async function sendEvent(job: ScrapeJobRecord, payload: ScrapeJobEventPayload) {
  const currentJob = await getScrapeJob(job.id);
  if (!currentJob || currentJob.finishedAt) {
    throw new Error("Job already finished");
  }

  await touchScrapeJobHeartbeat(job.id, job.claimedBy || DEFAULT_CLOUD_WORKER_NAME);
  await appendScrapeJobEvent(job.id, eventTypeForPayload(payload), {
    ...payload,
    jobId: job.id,
    jobStatus: currentJob.status === "claimed" ? "running" : currentJob.status,
  });
}

async function claimCloudJob(workerName: string) {
  const env = getServerEnv();
  const job = await claimNextScrapeJob({
    agentName: workerName,
    maxActiveJobs: env.SCRAPE_CONCURRENCY_LIMIT,
    staleBefore: new Date(Date.now() - env.WORKER_HEARTBEAT_STALE_MS),
  });

  if (!job) {
    return null;
  }

  await appendScrapeJobEvent(job.id, "status", {
    jobId: job.id,
    jobStatus: "claimed",
    message: `[JOB] Claimed by ${workerName}`,
  });

  await writeAuditEvent({
    action: "scrape.job_claimed",
    actorUserId: job.actorUserId,
    ipAddress: "cloudflare-cron",
    targetId: job.id,
    targetType: "scrape_job",
    metadata: {
      agentName: workerName,
      city: job.city,
      cloudRunner: true,
      niche: job.niche,
      radius: job.radius,
    },
  });

  return job;
}

async function runClaimedJob(job: ScrapeJobRecord, existingDedupeKeys: string[]) {
  const env = getServerEnv();
  let cancelRequested = false;
  let timedOut = false;
  let jobFinished = false;

  const heartbeatTimer = setInterval(() => {
    void (async () => {
      if (jobFinished) {
        return;
      }

      try {
        if (await getAutomationSettings().then((settings) => settings.emergencyPaused).catch(() => false)) {
          cancelRequested = true;
          return;
        }
        const currentJob = await touchScrapeJobHeartbeat(job.id, job.claimedBy || DEFAULT_CLOUD_WORKER_NAME);
        if (!currentJob || currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
          cancelRequested = true;
        }
      } catch (error) {
        console.warn(`[cloud-scrape] heartbeat failed for ${job.id}:`, error);
      }
    })();
  }, DEFAULT_HEARTBEAT_INTERVAL_MS);

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    cancelRequested = true;
  }, env.CLOUD_SCRAPE_TIMEOUT_MS);

  try {
    await touchScrapeJobHeartbeat(job.id, job.claimedBy || DEFAULT_CLOUD_WORKER_NAME);
    await appendScrapeJobEvent(job.id, "status", {
      jobId: job.id,
      jobStatus: "running",
      message: "[JOB] Running in Cloudflare Browser Rendering",
    });

    const result = await executeScrapeJob({
      city: job.city,
      existingDedupeKeys,
      jobId: job.id,
      maxDepth: job.maxDepth,
      niche: job.niche,
      persistLead: (lead: ScrapeLeadWriteInput) => persistScrapeJobLead({ jobId: job.id, lead }).then(() => undefined),
      radius: job.radius,
      sendEvent: (payload: ScrapeJobEventPayload) => sendEvent(job, payload),
      shouldAbort: () => cancelRequested,
    });

    if (timedOut) {
      throw new Error(`Cloud scrape exceeded ${Math.round(env.CLOUD_SCRAPE_TIMEOUT_MS / 1000)}s timeout.`);
    }

    if (result.aborted || cancelRequested) {
      await appendScrapeJobEvent(job.id, "status", {
        jobId: job.id,
        jobStatus: "canceled",
        message: "[JOB] Cloud scrape canceled",
      }).catch(() => undefined);
      return;
    }

    await appendScrapeJobEvent(job.id, "done", {
      jobId: job.id,
      jobStatus: "completed",
      _done: true,
      stats: buildScrapeJobStats(result),
    });

    await completeScrapeJob(job.id, {
      stats: buildScrapeJobStats(result),
    });
    await markScrapeTargetCompleted(job.id, result.leadsFound).catch((error) => {
      console.warn(`[cloud-scrape] failed to update target yield for ${job.id}:`, error);
    });
    jobFinished = true;

    await writeAuditEvent({
      action: "scrape.job_completed",
      actorUserId: job.actorUserId,
      ipAddress: "cloudflare-cron",
      targetId: job.id,
      targetType: "scrape_job",
      metadata: {
        city: job.city,
        cloudRunner: true,
        niche: job.niche,
        radius: job.radius,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cloud scrape error";
    console.error(`[cloud-scrape] failed ${job.id}:`, error);

    try {
      const qualityGateError = error instanceof ScrapeQualityGateError ? error : null;
      if ((qualityGateError?.evaluation.shouldPauseIntake ?? false) || /scrape quality gate tripped/i.test(message)) {
        const shouldPauseIntake = await shouldPauseIntakeForScrapeQualityGate(job.id).catch((pauseCheckError) => {
          console.error(`[cloud-scrape] failed to check recent scrape quality failures for ${job.id}:`, pauseCheckError);
          return true;
        });

        if (shouldPauseIntake) {
          const now = new Date();
          await updateAutomationSettings({
            intakePaused: true,
            intakePausedAt: now,
            intakePausedBy: "system:scrape-quality",
          }).catch((pauseError) => {
            console.error(`[cloud-scrape] failed to auto-pause intake after quality gate for ${job.id}:`, pauseError);
          });
          await writeAuditEvent({
            action: "intake.auto_paused_scrape_quality",
            actorUserId: job.actorUserId || "system",
            ipAddress: "cloudflare-cron",
            targetId: job.id,
            targetType: "scrape_job",
            metadata: {
              city: job.city,
              issues: qualityGateError?.evaluation.issues.map((issue) => issue.code) ?? [],
              metrics: qualityGateError?.evaluation.metrics ?? null,
              niche: job.niche,
              qualityStatus: qualityGateError?.evaluation.status ?? "critical",
            },
          }).catch((auditError) => {
            console.error(`[cloud-scrape] failed to audit auto-pause for ${job.id}:`, auditError);
          });
        } else {
          await appendScrapeJobEvent(job.id, "log", {
            jobId: job.id,
            jobStatus: "running",
            message: "[QUALITY] Target failed quality gate; intake will continue unless another recent target also fails.",
          }).catch(() => undefined);
        }
      }
      await appendScrapeJobEvent(job.id, "error", {
        error: message,
        jobId: job.id,
        jobStatus: "failed",
        message: `[!!!] ERROR: ${message}`,
      });
      await failScrapeJob(job.id, message);
      jobFinished = true;
    } catch (failError) {
      console.error(`[cloud-scrape] failed to report failure for ${job.id}:`, failError);
    }
  } finally {
    clearInterval(heartbeatTimer);
    clearTimeout(timeoutTimer);
  }
}

export async function runCloudScrapeWorker() {
  const bindings = getCloudflareBindings();
  if (!bindings?.BROWSER) {
    return { claimed: false, reason: "Browser Rendering binding unavailable" };
  }

  const env = getServerEnv();
  if (!isEnabled(env.CLOUD_SCRAPE_ENABLED)) {
    return { claimed: false, reason: "Cloud scrape disabled" };
  }

  if (await getAutomationSettings().then((settings) => settings.emergencyPaused).catch(() => false)) {
    return { claimed: false, reason: "Emergency kill switch active" };
  }

  const workerName = env.CLOUD_SCRAPE_WORKER_NAME || DEFAULT_CLOUD_WORKER_NAME;
  const job = await claimCloudJob(workerName);
  if (!job) {
    return { claimed: false, reason: "No pending scrape job" };
  }

  const existingDedupeKeys = await getExistingDedupeKeys();
  await runClaimedJob(job, existingDedupeKeys);

  return { claimed: true, jobId: job.id };
}
