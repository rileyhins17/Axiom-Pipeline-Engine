import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { isValidJobId, normalizeAgentName } from "@/lib/agent-protocol";
import { appendScrapeJobEvent, completeScrapeJob, getScrapeJob } from "@/lib/scrape-jobs";
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

  const stats = body.stats && typeof body.stats === "object" ? (body.stats as Record<string, unknown>) : null;
  if (stats) {
    const score = stats.avgScore === undefined ? null : Number(stats.avgScore);
    const leadsFound = stats.leadsFound === undefined ? null : Number(stats.leadsFound);
    const withEmail = stats.withEmail === undefined ? null : Number(stats.withEmail);
    if (
      (score !== null && !Number.isFinite(score)) ||
      (leadsFound !== null && (!Number.isFinite(leadsFound) || leadsFound < 0)) ||
      (withEmail !== null && (!Number.isFinite(withEmail) || withEmail < 0))
    ) {
      return NextResponse.json({ error: "Invalid stats payload" }, { status: 400 });
    }
  }

  const errorMessage = body.errorMessage === undefined || body.errorMessage === null
    ? null
    : String(body.errorMessage).slice(0, 500);

  const normalizedStats = stats
    ? {
        ...(stats.avgScore === undefined ? {} : { avgScore: Number(stats.avgScore) }),
        ...(stats.leadsFound === undefined ? {} : { leadsFound: Number(stats.leadsFound) }),
        ...(stats.withEmail === undefined ? {} : { withEmail: Number(stats.withEmail) }),
      }
    : null;

  await appendScrapeJobEvent(jobId, "done", {
    jobId,
    jobStatus: "completed",
    _done: true,
    stats: normalizedStats || {
      avgScore: 0,
      leadsFound: 0,
      withEmail: 0,
    },
  });

  const job = await completeScrapeJob(jobId, {
    errorMessage,
    stats: normalizedStats || null,
  });

  await writeAuditEvent({
    action: "scrape.job_completed",
    actorUserId: currentJob.actorUserId,
    ipAddress: getClientIp(request),
    targetId: jobId,
    targetType: "scrape_job",
    metadata: {
      city: currentJob.city,
      niche: currentJob.niche,
      radius: currentJob.radius,
    },
  });

  return NextResponse.json({ job });
}
