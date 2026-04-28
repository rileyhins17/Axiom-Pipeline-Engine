import { NextResponse } from "next/server";

import { buildGmailOAuthState, buildOAuthUrl, normalizeGmailAddress } from "@/lib/gmail";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const requestUrl = new URL(request.url);
    const targetEmail = normalizeGmailAddress(requestUrl.searchParams.get("email"));
    const state = buildGmailOAuthState({
      sessionId: authResult.session.session.id,
      targetEmail,
    });
    const url = buildOAuthUrl(state, { loginHint: targetEmail });

    return NextResponse.redirect(url);
  } catch (error: unknown) {
    console.error("Gmail OAuth connect error:", error);
    const message = error instanceof Error ? error.message : "Failed to initiate Gmail connection";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
