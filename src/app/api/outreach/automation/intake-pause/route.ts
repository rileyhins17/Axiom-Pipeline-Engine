import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getAutomationSettings, updateAutomationSettings } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

type IntakePauseRequestBody = {
  paused?: boolean;
};

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const settings = await getAutomationSettings();
  return NextResponse.json({
    intakePaused: settings.intakePaused,
    intakePausedAt: settings.intakePausedAt,
    intakePausedBy: settings.intakePausedBy,
  });
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as IntakePauseRequestBody;
    if (typeof body.paused !== "boolean") {
      return NextResponse.json({ error: "`paused` boolean is required" }, { status: 400 });
    }

    const prisma = getPrisma();
    const current = await getAutomationSettings(prisma);
    const now = new Date();

    const updated = await updateAutomationSettings({
      intakePaused: body.paused,
      intakePausedAt: body.paused ? now : null,
      intakePausedBy: body.paused ? authResult.session.user.email : null,
    });

    await writeAuditEvent({
      action: body.paused ? "automation.intake_paused" : "automation.intake_resumed",
      actorUserId: authResult.session.user.id,
      ipAddress: request.headers.get("x-forwarded-for") || "api",
      targetType: "automation_settings",
      targetId: current.id,
      metadata: {
        paused: body.paused,
        previousPaused: current.intakePaused,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Intake pause control error:", error);
    const message = error instanceof Error ? error.message : "Failed to update intake pause";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
