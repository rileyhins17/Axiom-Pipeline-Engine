import { NextResponse } from "next/server";

import { listAutomationOverview, syncAutomationReplies } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const result = await syncAutomationReplies();
    const overview = await listAutomationOverview();
    return NextResponse.json({ ...result, overview });
  } catch (error: any) {
    console.error("Reply sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync replies" },
      { status: 500 },
    );
  }
}
