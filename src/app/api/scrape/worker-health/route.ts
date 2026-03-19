import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getWorkerHealth } from "@/lib/scrape-jobs";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const env = getServerEnv();
  const health = await getWorkerHealth(Math.max(1, Math.floor(env.WORKER_HEARTBEAT_STALE_MS / 1000)));

  return NextResponse.json(
    {
      health,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
