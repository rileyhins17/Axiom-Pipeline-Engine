import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { isValidJobId, normalizeAgentName } from "@/lib/agent-protocol";
import { appendScrapeJobEvent, failScrapeJob, getScrapeJob } from "@/lib/scrape-jobs";
import { requireAgentAuth } from "@/lib/agent-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAgentAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { id: jobId } = await context.params;
  if (!isValidJobId(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const currentJob = await getScrapeJob(jobId);
  if (!currentJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (currentJob.claimedBy !== authResult.agentName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
    return NextResponse.json({ error: "Job already finished" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bodyAgentName = body.agentName ? normalizeAgentName(body.agentName) : null;
  if (body.agentName && !bodyAgentName) {
    return NextResponse.json({ error: "Invalid agent name" }, { status: 400 });
  }

  if (bodyAgentName && bodyAgentName !== authResult.agentName) {
    return NextResponse.json({ error: "Agent identity mismatch" }, { status: 400 });
  }

  const errorMessage = body.errorMessage === undefined || body.errorMessage === null
    ? "Scrape failed."
    : String(body.errorMessage).slice(0, 500) || "Scrape failed.";

  await appendScrapeJobEvent(jobId, "error", {
    error: errorMessage,
    jobId,
    jobStatus: "failed",
    message: `[!!!] ERROR: ${errorMessage}`,
  });

  const job = await failScrapeJob(jobId, errorMessage);

  await writeAuditEvent({
    action: "scrape.job_failed",
    actorUserId: currentJob.actorUserId,
    ipAddress: getClientIp(request),
    targetId: jobId,
    targetType: "scrape_job",
    metadata: {
      city: currentJob.city,
      niche: currentJob.niche,
      radius: currentJob.radius,
      errorMessage,
    },
  });

  return NextResponse.json({ job });
}
