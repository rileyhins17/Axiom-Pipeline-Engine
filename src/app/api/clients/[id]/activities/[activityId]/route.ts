import { NextResponse } from "next/server";

import { isCrmActivityType } from "@/lib/crm";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

function parseId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id, activityId } = await params;
  const leadId = parseId(id);
  const actId = parseId(activityId);

  if (!leadId || !actId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.crmActivity.findFirst({
    where: { id: actId, leadId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const trimmed = body.title.trim().slice(0, 140);
    if (trimmed) update.title = trimmed;
  }

  if (typeof body.body === "string") {
    update.body = body.body.trim().slice(0, 4000) || null;
  }

  if (body.type && isCrmActivityType(body.type)) {
    update.type = body.type;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const activity = await prisma.crmActivity.update({
    where: { id: actId },
    data: update,
  });

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
  const actId = parseId(activityId);

  if (!leadId || !actId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.crmActivity.findFirst({
    where: { id: actId, leadId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  await prisma.crmActivity.delete({ where: { id: actId } });

  return new NextResponse(null, { status: 204 });
}
