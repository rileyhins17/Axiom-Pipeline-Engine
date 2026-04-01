import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { getServerEnv } from "@/lib/env";
import {
  appendScrapeJobEvent,
  getScrapeJob,
  resetScrapeJobForRetry,
} from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

function isRetryableTerminalStatus(status: string) {
  return status === "failed" || status === "canceled";
}

function isStaleActiveJob(job: { heartbeatAt: Date | null; status: string; updatedAt: Date }, staleBefore: Date) {
  if (job.status !== "claimed" && job.status !== "running") {
    return false;
  }

  const lastActivity = job.heartbeatAt ?? job.updatedAt;
  return lastActivity < staleBefore;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { id: jobId } = await context.params;
  const currentJob = await getScrapeJob(jobId);
  if (!currentJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const env = getServerEnv();
  const staleBefore = new Date(Date.now() - env.SCRAPE_TIMEOUT_MS);
  const retryable = isRetryableTerminalStatus(currentJob.status);
  const staleActive = isStaleActiveJob(currentJob, staleBefore);

  if (!retryable && !staleActive) {
    return NextResponse.json(
      { error: "Job is not retryable yet. Wait for it to become stale or cancel it first." },
      { status: 409 },
    );
  }

  const job = await resetScrapeJobForRetry(jobId);
  if (!job) {
    return NextResponse.json({ error: "Failed to reset job" }, { status: 500 });
  }

  await appendScrapeJobEvent(jobId, "status", {
    jobId,
    jobStatus: "pending",
    message: retryable
      ? "[JOB] Retried by operator. Waiting for worker claim."
      : "[JOB] Requeued stale job. Waiting for worker claim.",
  });

  await writeAuditEvent({
    action: retryable ? "scrape.job_retried" : "scrape.job_requeued",
    actorUserId: authResult.session.user.id,
    ipAddress: getClientIp(request),
    targetId: jobId,
    targetType: "scrape_job",
    metadata: {
      city: currentJob.city,
      niche: currentJob.niche,
      radius: currentJob.radius,
      maxDepth: currentJob.maxDepth,
      previousStatus: currentJob.status,
      stale: staleActive,
    },
  });

  return NextResponse.json({ job });
}
