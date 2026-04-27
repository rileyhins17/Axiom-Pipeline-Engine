import { after, NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { runCloudScrapeWorker } from "@/lib/cloud-scrape-worker";
import { getClientIp } from "@/lib/cloudflare";
import { createScrapeJob } from "@/lib/scrape-jobs";
import { getServerEnv } from "@/lib/env";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const env = getServerEnv();
    const ipAddress = getClientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const niche = String(body.niche || "").trim();
    const city = String(body.city || "").trim();
    const radius = String(body.radius || "10").trim();
    const parsedMaxDepth = Number.parseInt(String(body.maxDepth || "5"), 10);
    const maxDepth = Number.isNaN(parsedMaxDepth) ? 5 : Math.min(Math.max(parsedMaxDepth, 1), 20);

    if (!niche || !city) {
      return NextResponse.json({ error: "Missing niche or city text" }, { status: 400 });
    }

    const job = await createScrapeJob({
      actorUserId: authResult.session.user.id,
      city,
      maxDepth,
      niche,
      radius,
    });

    await writeAuditEvent({
      action: "scrape.job_created",
      actorUserId: authResult.session.user.id,
      ipAddress,
      targetId: job.id,
      targetType: "scrape_job",
      metadata: {
        city,
        maxDepth,
        niche,
        radius,
        scrapeTimeoutMs: env.SCRAPE_TIMEOUT_MS,
      },
    });

    after(async () => {
      try {
        await runCloudScrapeWorker();
      } catch (error) {
        console.error("Cloud scrape dispatch failed:", error);
      }
    });

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error("Create scrape job error:", error);
    return NextResponse.json({ error: error.message || "Failed to create job" }, { status: 500 });
  }
}
