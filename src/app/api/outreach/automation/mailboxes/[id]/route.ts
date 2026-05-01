import { NextRequest, NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { updateMailbox } from "@/lib/outreach-automation";
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
    const body = (await request.json()) as Record<string, unknown>;
    const { id } = await params;
    const mailbox = await updateMailbox(id, body);
    return NextResponse.json({ mailbox });
  } catch (error: unknown) {
    console.error("Mailbox update error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to update mailbox") },
      { status: 500 },
    );
  }
}
