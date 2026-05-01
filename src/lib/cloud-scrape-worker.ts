import { writeAuditEvent } from "@/lib/audit";
import { getCloudflareBindings } from "@/lib/cloudflare";
import { generateDedupeKey } from "@/lib/dedupe";
import { getServerEnv } from "@/lib/env";
import { getAutomationSettings } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { executeScrapeJob } from "@/lib/scrape-engine-worker";
import { persistScrapeJobLead } from "@/lib/scrape-lead-persistence";
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

function isEnabled(value: string | undefined, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return !/^(0|false|no|off)$/i.test(value.trim());
}

function eventTypeForPayload(payload: ScrapeJobEventPayload) {
  if (payload._done === true) return "done";
  if (payload.error) return "error";
  if (typeof payload.progress === "number") return "progress";
  return "log";
}

async function getExistingDedupeKeys() {
  const prisma = getPrisma();
  const existingLeads = await prisma.lead.findMany({
    select: {
      businessName: true,
      city: true,
      dedupeKey: true,
      phone: true,
    },
  });

  return existingLeads.map((lead) =>
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
      stats: {
        avgScore: result.avgScore,
        leadsFound: result.leadsFound,
        withEmail: result.withEmail,
      },
    });

    await completeScrapeJob(job.id, {
      stats: {
        avgScore: result.avgScore,
        leadsFound: result.leadsFound,
        withEmail: result.withEmail,
      },
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
