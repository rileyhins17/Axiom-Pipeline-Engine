import { NextResponse } from "next/server";

import { isDealStage, isEngagementType } from "@/lib/crm";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId)) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("dealStage" in body) {
    const v = body.dealStage;
    if (v !== null && !isDealStage(v)) {
      return NextResponse.json({ error: "Invalid dealStage" }, { status: 400 });
    }
    update.dealStage = v ?? null;
  }

  if ("engagementType" in body) {
    const v = body.engagementType;
    if (v !== null && !isEngagementType(v)) {
      return NextResponse.json({ error: "Invalid engagementType" }, { status: 400 });
    }
    update.engagementType = v ?? null;
  }

  if ("monthlyValue" in body) {
    const v = body.monthlyValue;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return NextResponse.json({ error: "Invalid monthlyValue" }, { status: 400 });
    }
    update.monthlyValue = v ?? null;
  }

  if ("projectStartDate" in body) {
    const v = body.projectStartDate;
    if (v !== null) {
      const d = new Date(String(v));
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid projectStartDate" }, { status: 400 });
      }
      update.projectStartDate = d;
    } else {
      update.projectStartDate = null;
    }
  }

  if ("renewalDate" in body) {
    const v = body.renewalDate;
    if (v !== null) {
      const d = new Date(String(v));
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid renewalDate" }, { status: 400 });
      }
      update.renewalDate = d;
    } else {
      update.renewalDate = null;
    }
  }

  if ("projectNotes" in body) {
    update.projectNotes = body.projectNotes ? String(body.projectNotes) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: update,
  });

  return NextResponse.json(lead);
}
