import { NextResponse } from "next/server";

import { buildDealUpdateActivities, getDefaultNextActionForStage } from "@/lib/crm-activity";
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

  const prisma = getPrisma();
  const previousLead = await prisma.lead.findUnique({
    where: { id: leadId },
  });
  if (!previousLead || previousLead.isArchived) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
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

    // Auto-set milestone dates and action defaults only when the CRM stage changes.
    if (v === "PROPOSAL_SENT" && !("proposalSentAt" in body) && !previousLead.proposalSentAt) {
      update.proposalSentAt = new Date();
    }
    if (v === "SIGNED" && !("signedAt" in body) && !previousLead.signedAt) {
      update.signedAt = new Date();
    }
    if (isDealStage(v) && v !== previousLead.dealStage) {
      const defaultAction = getDefaultNextActionForStage(v);
      if (defaultAction) {
        if (!("nextAction" in body) && !previousLead.nextAction) {
          update.nextAction = defaultAction.nextAction;
        }
        if (!("nextActionDueAt" in body) && !previousLead.nextActionDueAt) {
          update.nextActionDueAt = defaultAction.nextActionDueAt;
        }
      }
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
  for (const field of ["projectNotes", "nextAction", "dealHealth", "dealLostReason", "contactName", "email", "phone", "websiteUrl", "address", "outreachStatus"] as const) {
    if (field in body) {
      update[field] = body[field] ? String(body[field]) : null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: update,
  });

  const activityDrafts = buildDealUpdateActivities(previousLead, lead);
  if (activityDrafts.length > 0) {
    await Promise.all(
      activityDrafts.map((activity) =>
        prisma.crmActivity.create({
          data: {
            leadId,
            actorUserId: authResult.session.user.id,
            type: activity.type,
            title: activity.title,
            body: activity.body ?? null,
            metadata: activity.metadata ? JSON.stringify(activity.metadata) : null,
          },
        }),
      ),
    ).catch((error) => {
      console.error(`[crm] Failed to write activity for lead ${leadId}:`, error);
    });
  }

  return NextResponse.json(lead);
}
