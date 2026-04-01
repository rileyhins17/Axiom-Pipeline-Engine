import { NextResponse } from "next/server";

import { listScrapeJobs } from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "12", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 25) : 12;

  const jobs = await listScrapeJobs(limit);

  return NextResponse.json(
    { jobs },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
