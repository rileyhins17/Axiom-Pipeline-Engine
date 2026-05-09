import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  let body: { action: string; ids: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Missing action or ids" }, { status: 400 });
  }

  if (body.ids.length > 200) {
    return NextResponse.json({ error: "Too many ids (max 200)" }, { status: 400 });
  }

  const validIds = body.ids.filter((id) => Number.isFinite(id) && id > 0);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "No valid ids" }, { status: 400 });
  }

  const db = getDatabase();

  switch (body.action) {
    case "archive": {
      const placeholders = validIds.map(() => "?").join(",");
      await db.prepare(
        `UPDATE "Lead" SET "isArchived" = 1, "updatedAt" = datetime('now') WHERE "id" IN (${placeholders})`,
      ).bind(...validIds).run();
      return NextResponse.json({ archived: validIds.length });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
