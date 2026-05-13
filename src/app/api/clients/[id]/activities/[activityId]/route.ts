import { NextResponse } from "next/server";

import { isCrmActivityType } from "@/lib/crm";
import { getDatabase } from "@/lib/cloudflare";
import { requireApiSession } from "@/lib/session";

function parseId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseActivityId(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id, activityId } = await params;
  const leadId = parseId(id);
  const actId = parseActivityId(activityId);

  if (!leadId || !actId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = getDatabase();

  // Verify activity exists and belongs to this lead
  const existing = await db
    .prepare(`SELECT "id" FROM "CrmActivity" WHERE "id" = ?1 AND "leadId" = ?2`)
    .bind(actId, leadId)
    .first();

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const setClauses: string[] = [];
  const binds: (string | number | null)[] = [];
  let bindIdx = 1;

  if (typeof body.title === "string") {
    const trimmed = body.title.trim().slice(0, 140);
    if (trimmed) {
      setClauses.push(`"title" = ?${bindIdx++}`);
      binds.push(trimmed);
    }
  }

  if (typeof body.body === "string") {
    const val = body.body.trim().slice(0, 4000) || null;
    setClauses.push(`"body" = ?${bindIdx++}`);
    binds.push(val);
  }

  if (body.type && isCrmActivityType(body.type)) {
    setClauses.push(`"type" = ?${bindIdx++}`);
    binds.push(body.type as string);
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  binds.push(actId);
  const sql = `UPDATE "CrmActivity" SET ${setClauses.join(", ")} WHERE "id" = ?${bindIdx}`;
  await db.prepare(sql).bind(...binds).run();

  // Return updated activity
  const activity = await db
    .prepare(`SELECT * FROM "CrmActivity" WHERE "id" = ?1`)
    .bind(actId)
    .first();

  return NextResponse.json({ activity });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id, activityId } = await params;
  const leadId = parseId(id);
  const actId = parseActivityId(activityId);

  if (!leadId || !actId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = getDatabase();

  // Verify activity exists and belongs to this lead
  const existing = await db
    .prepare(`SELECT "id" FROM "CrmActivity" WHERE "id" = ?1 AND "leadId" = ?2`)
    .bind(actId, leadId)
    .first();

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await db.prepare(`DELETE FROM "CrmActivity" WHERE "id" = ?1`).bind(actId).run();

  return new NextResponse(null, { status: 204 });
}
