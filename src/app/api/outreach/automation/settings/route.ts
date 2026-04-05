import { NextResponse } from "next/server";

import { listAutomationOverview, updateAutomationSettings } from "@/lib/outreach-automation";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const overview = await listAutomationOverview();
    return NextResponse.json({ settings: overview.settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch automation settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const settings = await updateAutomationSettings(body);
    const overview = await listAutomationOverview();
    return NextResponse.json({ settings, overview });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update automation settings" },
      { status: 500 },
    );
  }
}
