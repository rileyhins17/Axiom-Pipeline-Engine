import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { normalizeAgentName } from "@/lib/agent-protocol";
import { generateDedupeKey } from "@/lib/dedupe";
import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import {
  appendScrapeJobEvent,
  claimNextScrapeJob,
} from "@/lib/scrape-jobs";
import { requireAgentAuth } from "@/lib/agent-auth";

export async function POST(request: Request) {
  const authResult = await requireAgentAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const env = getServerEnv();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedAgentName = body.agentName ? normalizeAgentName(body.agentName) : null;

    if (body.agentName && !requestedAgentName) {
      return NextResponse.json({ error: "Invalid agent name" }, { status: 400 });
    }

    if (requestedAgentName && requestedAgentName !== authResult.agentName) {
      return NextResponse.json({ error: "Agent identity mismatch" }, { status: 400 });
    }

    const agentName = authResult.agentName;

    const job = await claimNextScrapeJob({
      agentName,
      maxActiveJobs: env.SCRAPE_CONCURRENCY_LIMIT,
      staleBefore: new Date(Date.now() - env.WORKER_HEARTBEAT_STALE_MS),
    });

    if (!job) {
      return NextResponse.json({ job: null, retryAfterMs: 5000 });
    }

    const prisma = getPrisma();
    const existingLeads = await prisma.lead.findMany({
      select: {
        businessName: true,
        city: true,
        dedupeKey: true,
        phone: true,
      },
    });

    const existingDedupeKeys = existingLeads.map((lead) =>
      lead.dedupeKey || generateDedupeKey(lead.businessName, lead.city || "", lead.phone).key,
    );

    await appendScrapeJobEvent(job.id, "status", {
      jobId: job.id,
      jobStatus: "claimed",
      message: `[JOB] Claimed by ${agentName}`,
    });

    await writeAuditEvent({
      action: "scrape.job_claimed",
      actorUserId: job.actorUserId,
      ipAddress: getClientIp(request),
      targetId: job.id,
      targetType: "scrape_job",
      metadata: {
        agentName,
        city: job.city,
        niche: job.niche,
        radius: job.radius,
      },
    });

    return NextResponse.json({
      existingDedupeKeys,
      job,
    });
  } catch (error: any) {
    console.error("Claim job error:", error);
    return NextResponse.json({ error: error.message || "Failed to claim job" }, { status: 500 });
  }
}
