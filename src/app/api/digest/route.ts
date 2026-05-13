import { NextResponse } from "next/server";

import { sendDailyDigest } from "@/lib/daily-digest";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const result = await sendDailyDigest();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[digest] Manual trigger failed:", error);
    const message = error instanceof Error ? error.message : "Failed to send digest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
