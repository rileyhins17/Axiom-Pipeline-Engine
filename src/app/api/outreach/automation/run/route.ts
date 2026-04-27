import { NextResponse } from "next/server";

import { runAutomationScheduler } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to run automation scheduler";
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as { immediate?: boolean } | null;
    const result = await runAutomationScheduler({ immediate: Boolean(body?.immediate) });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Automation run error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
