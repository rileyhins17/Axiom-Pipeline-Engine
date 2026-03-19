import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { cancelAllActiveScrapeJobs } from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const affectedCount = await cancelAllActiveScrapeJobs("Canceled by operator.");

  await writeAuditEvent({
    action: "scrape.jobs_stopped_all",
    actorUserId: authResult.session.user.id,
    ipAddress: getClientIp(request),
    targetType: "scrape_job",
    metadata: {
      affectedCount,
      scope: "active",
    },
  });

  return NextResponse.json({
    affectedCount,
    ok: true,
  });
}
