import { NextResponse } from "next/server";

import { buildOAuthUrl } from "@/lib/gmail";
import { requireAdminApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    // Use the user's session ID as the OAuth state for CSRF protection
    const state = authResult.session.session.id;
    const url = buildOAuthUrl(state);

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error("Gmail OAuth connect error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate Gmail connection" },
      { status: 500 },
    );
  }
}
