import { NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const overview = await listAutomationOverview();
    return NextResponse.json(overview);
  } catch (error: unknown) {
    console.error("Automation overview error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch automation overview") },
      { status: 500 },
    );
  }
}
