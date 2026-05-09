import { NextResponse } from "next/server";

import { getCrmActivityTypeLabel, isCrmActivityType } from "@/lib/crm";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseLeadId(value: string) {
  const leadId = Number(value);
  return Number.isFinite(leadId) && leadId > 0 ? leadId : null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function requireLead(leadId: number) {
  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });
  return lead && !lead.isArchived ? lead : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const leadId = parseLeadId(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const lead = await requireLead(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const activities = await getPrisma().crmActivity.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ activities });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const leadId = parseLeadId(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const lead = await requireLead(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = isCrmActivityType(body.type) ? body.type : "NOTE";
  const title = cleanText(body.title, 140) ?? getCrmActivityTypeLabel(type);
  const activityBody = cleanText(body.body, 4000);

  if (!title && !activityBody) {
    return NextResponse.json({ error: "Activity needs a title or note" }, { status: 400 });
  }

  const activity = await getPrisma().crmActivity.create({
    data: {
      leadId,
      actorUserId: authResult.session.user.id,
      type,
      title,
      body: activityBody,
      metadata: JSON.stringify({ source: "manual" }),
    },
  });

  return NextResponse.json({ activity }, { status: 201 });
}
