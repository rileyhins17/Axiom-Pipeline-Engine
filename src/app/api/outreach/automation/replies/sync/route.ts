import { NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { syncAutomationReplies } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const result = await syncAutomationReplies();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Reply sync error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to sync replies") },
      { status: 500 },
    );
  }
}
