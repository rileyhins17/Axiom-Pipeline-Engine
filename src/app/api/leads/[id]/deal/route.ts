import { NextResponse } from "next/server";

import { isClientPriority, isDealStage, isEngagementType } from "@/lib/crm";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

function parseDateField(value: unknown): Date | null | { error: string } {
  if (value === null || value === undefined) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return { error: "invalid date" };
  return d;
}

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

    // Auto-set proposalSentAt when stage first moves to PROPOSAL_SENT (client can override)
    if (v === "PROPOSAL_SENT" && !("proposalSentAt" in body)) {
      update.proposalSentAt = new Date();
    }
    // Auto-set signedAt when stage first moves to SIGNED (client can override)
    if (v === "SIGNED" && !("signedAt" in body)) {
      update.signedAt = new Date();
    }
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

  if ("clientPriority" in body) {
    const v = body.clientPriority;
    if (v !== null && !isClientPriority(v)) {
      return NextResponse.json({ error: "Invalid clientPriority" }, { status: 400 });
    }
    update.clientPriority = v ?? null;
  }

  // Date fields
  for (const field of ["projectStartDate", "renewalDate", "nextActionDueAt", "lastReplyAt", "proposalSentAt", "signedAt"] as const) {
    if (field in body) {
      const parsed = parseDateField(body[field]);
      if (parsed !== null && "error" in parsed) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      update[field] = parsed;
    }
  }

  // Text fields
  for (const field of ["projectNotes", "nextAction", "dealHealth", "dealLostReason"] as const) {
    if (field in body) {
      update[field] = body[field] ? String(body[field]) : null;
    }
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
