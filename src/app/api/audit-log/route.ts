import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const db = getDatabase();

  const activities = await db.prepare(
    `SELECT a."id", a."type", a."title", a."body", a."createdAt",
            l."businessName", l."id" AS "leadId"
     FROM "CrmActivity" a
     LEFT JOIN "Lead" l ON a."leadId" = l."id"
     ORDER BY datetime(a."createdAt") DESC
     LIMIT 50`,
  ).all<{
    id: string; type: string; title: string; body: string | null;
    createdAt: string; businessName: string | null; leadId: number | null;
  }>().catch(() => ({ results: [] as Array<{ id: string; type: string; title: string; body: string | null; createdAt: string; businessName: string | null; leadId: number | null }> }));

  return NextResponse.json({ entries: activities.results ?? [] });
}
