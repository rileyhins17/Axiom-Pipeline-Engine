import { NextResponse } from "next/server";

import { isValidJobId, normalizeAgentName } from "@/lib/agent-protocol";
import { appendScrapeJobEvent, getScrapeJob, touchScrapeJobHeartbeat } from "@/lib/scrape-jobs";
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedAgentName = body.agentName ? normalizeAgentName(body.agentName) : null;

  if (body.agentName && !requestedAgentName) {
    return NextResponse.json({ error: "Invalid agent name" }, { status: 400 });
  }

  if (requestedAgentName && requestedAgentName !== authResult.agentName) {
    return NextResponse.json({ error: "Agent identity mismatch" }, { status: 400 });
  }

  if (currentJob.claimedBy !== authResult.agentName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
    return NextResponse.json({
      job: currentJob,
      shouldAbort: true,
    });
  }

  const nextJob = await touchScrapeJobHeartbeat(jobId, request.headers.get("x-agent-name") || undefined);

  if (currentJob.status !== "running") {
    await appendScrapeJobEvent(jobId, "status", {
      jobId,
      jobStatus: "running",
      message: "[JOB] Running",
    });
  }

  return NextResponse.json({
    job: nextJob,
    shouldAbort: false,
  });
}
