import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const db = getDatabase();

  const result = await db
    .prepare(
      `UPDATE "Lead" SET "outreachStatus" = NULL, "updatedAt" = datetime('now')
       WHERE "isArchived" = 0 AND "dealStage" IS NULL
       AND "outreachStatus" IN ('REPLIED', 'INTERESTED')`
    )
    .run();

  return NextResponse.json({ reset: result.meta?.changes ?? 0 });
}
