import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { clearTerminalScrapeJobs } from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const deletedCount = await clearTerminalScrapeJobs();

  await writeAuditEvent({
    action: "scrape.jobs_cleared_terminal",
    actorUserId: authResult.session.user.id,
    ipAddress: getClientIp(request),
    targetType: "scrape_job",
    metadata: {
      deletedCount,
      scope: "terminal",
    },
  });

  return NextResponse.json({
    deletedCount,
    ok: true,
  });
}
