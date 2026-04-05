import { NextRequest, NextResponse } from "next/server";

import { listAutomationOverview, mutateSequence } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as { action?: "pause" | "resume" | "stop" | "remove" };
    if (!body.action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const { id } = await params;
    const sequence = await mutateSequence(id, body.action);
    const overview = await listAutomationOverview();
    return NextResponse.json({ sequence, overview });
  } catch (error: any) {
    console.error("Sequence mutation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update automation sequence" },
      { status: 500 },
    );
  }
}
