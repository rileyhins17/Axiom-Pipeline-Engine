import { NextRequest, NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { getPrisma } from "@/lib/prisma";
import { isOutreachChannel, isOutreachStatus } from "@/lib/outreach";
import { requireApiSession } from "@/lib/session";

function parseNullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const { id } = await params;
    const leadId = parseInt(id, 10);

    if (Number.isNaN(leadId)) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      outreachStatus?: string | null;
      outreachChannel?: string | null;
      firstContactedAt?: string | null;
      lastContactedAt?: string | null;
      nextFollowUpDue?: string | null;
      outreachNotes?: string | null;
      touchLastContacted?: boolean;
    };

    const prisma = getPrisma();
    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        outreachStatus: true,
        outreachChannel: true,
        firstContactedAt: true,
        lastContactedAt: true,
      },
    });

    if (!existingLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const nextStatus =
      body.outreachStatus === undefined || body.outreachStatus === null
        ? existingLead.outreachStatus || "NOT_CONTACTED"
        : body.outreachStatus;

    if (!isOutreachStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid outreach status" }, { status: 400 });
    }

    let nextChannel: string | null | undefined = body.outreachChannel;
    if (nextChannel === "") {
      nextChannel = null;
    }
    if (nextChannel !== undefined && nextChannel !== null && !isOutreachChannel(nextChannel)) {
      return NextResponse.json({ error: "Invalid outreach channel" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      outreachStatus: nextStatus,
    };

    if (body.outreachChannel !== undefined) {
      updates.outreachChannel = nextChannel;
    }

    if (body.outreachNotes !== undefined) {
      const trimmedNotes = body.outreachNotes?.trim() ?? "";
      updates.outreachNotes = trimmedNotes.length > 0 ? trimmedNotes : null;
    }

    if (body.nextFollowUpDue !== undefined) {
      if (body.nextFollowUpDue === null || body.nextFollowUpDue === "") {
        updates.nextFollowUpDue = null;
      } else {
        const parsedNextFollowUp = parseNullableDate(body.nextFollowUpDue);
        if (!parsedNextFollowUp) {
          return NextResponse.json({ error: "Invalid follow-up date" }, { status: 400 });
        }
        updates.nextFollowUpDue = parsedNextFollowUp;
      }
    }

    if (body.firstContactedAt !== undefined) {
      updates.firstContactedAt = parseNullableDate(body.firstContactedAt);
    }

    if (body.lastContactedAt !== undefined) {
      updates.lastContactedAt = parseNullableDate(body.lastContactedAt);
    }

    const isContacted = nextStatus !== "NOT_CONTACTED";
    const statusChanged = nextStatus !== (existingLead.outreachStatus || "NOT_CONTACTED");
    const channelChanged =
      body.outreachChannel !== undefined && (nextChannel ?? null) !== (existingLead.outreachChannel ?? null);

    if (!isContacted) {
      if (updates.outreachChannel === undefined) {
        updates.outreachChannel = null;
      }
      if (updates.nextFollowUpDue === undefined) {
        updates.nextFollowUpDue = null;
      }
    }

    if (isContacted && !existingLead.firstContactedAt && updates.firstContactedAt === undefined) {
      updates.firstContactedAt = new Date();
    }

    if (isContacted && updates.lastContactedAt === undefined && (body.touchLastContacted || statusChanged || channelChanged)) {
      updates.lastContactedAt = new Date();
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: updates,
    });

    await writeAuditEvent({
      action: "lead.outreach_update",
      actorUserId: authResult.session.user.id,
      targetType: "lead",
      targetId: String(leadId),
      ipAddress: getClientIp(request),
      metadata: {
        outreachStatus: updatedLead.outreachStatus,
        outreachChannel: updatedLead.outreachChannel,
        nextFollowUpDue: updatedLead.nextFollowUpDue?.toISOString() ?? null,
      },
    });

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error("Failed to update outreach:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
