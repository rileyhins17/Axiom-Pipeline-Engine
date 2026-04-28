import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getAutomationSettings, updateAutomationSettings } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

type EmergencyRequestBody = {
  paused?: boolean;
  note?: string;
};

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const settings = await getAutomationSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as EmergencyRequestBody;
    if (typeof body.paused !== "boolean") {
      return NextResponse.json({ error: "`paused` boolean is required" }, { status: 400 });
    }

    const prisma = getPrisma();
    const current = await getAutomationSettings(prisma);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 240) : "";
    const now = new Date();

    const updated = await updateAutomationSettings({
      emergencyPaused: body.paused,
      emergencyPausedAt: body.paused ? now : null,
      emergencyPausedBy: body.paused ? authResult.session.user.email : null,
      emergencyPauseReason: body.paused ? note || "Emergency stop engaged from app" : null,
    });

    if (body.paused) {
      await prisma.outreachSequenceStep.updateMany({
        where: {
          OR: [{ status: "CLAIMED" }, { status: "SENDING" }],
        },
        data: {
          status: "SCHEDULED",
          claimedAt: null,
          claimedByRunId: null,
          errorMessage: "emergency_stop",
        },
      });
    }

    await writeAuditEvent({
      action: body.paused ? "automation.emergency_stop_engaged" : "automation.emergency_stop_cleared",
      actorUserId: authResult.session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") || "api",
      targetType: "automation_settings",
      targetId: current.id,
      metadata: {
        paused: body.paused,
        note: note || null,
        previousPaused: current.emergencyPaused,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Emergency control error:", error);
    const message = error instanceof Error ? error.message : "Failed to update emergency control";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
