import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { appendScrapeJobEvent, cancelScrapeJob, getScrapeJob } from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

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

  if (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
    return NextResponse.json({ job: currentJob });
  }

  const canceledJob = await cancelScrapeJob(jobId, "Canceled by operator.");
  await appendScrapeJobEvent(jobId, "status", {
    jobId,
    jobStatus: "canceled",
    message: "[JOB] Canceled by operator.",
  });

  await writeAuditEvent({
    action: "scrape.job_canceled",
    actorUserId: authResult.session.user.id,
    ipAddress: getClientIp(request),
    targetId: jobId,
    targetType: "scrape_job",
    metadata: {
      actorUserId: currentJob.actorUserId,
      city: currentJob.city,
      niche: currentJob.niche,
    },
  });

  return NextResponse.json({ job: canceledJob });
}
