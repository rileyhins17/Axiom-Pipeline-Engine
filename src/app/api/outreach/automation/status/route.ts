import { NextResponse } from "next/server";

import { getAutomationRuntimeStatus } from "@/lib/outreach-automation";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const status = await getAutomationRuntimeStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Automation status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch automation status" },
      { status: 500 },
    );
  }
}
