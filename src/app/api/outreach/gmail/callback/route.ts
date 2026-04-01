import { NextRequest, NextResponse } from "next/server";

import {
  encryptToken,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "@/lib/gmail";
import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const env = getServerEnv();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");

    if (error) {
      console.error("Gmail OAuth error:", error);
      return NextResponse.redirect(
        `${baseUrl}/outreach?gmail_error=${encodeURIComponent(error)}`,
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/outreach?gmail_error=missing_code`,
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${baseUrl}/outreach?gmail_error=no_refresh_token`,
      );
    }

    // Get user's Gmail address
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    if (!userInfo.email) {
      return NextResponse.redirect(
        `${baseUrl}/outreach?gmail_error=no_email`,
      );
    }

    // Encrypt tokens before storage
    const encryptedAccess = await encryptToken(tokens.access_token);
    const encryptedRefresh = await encryptToken(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const prisma = getPrisma();

    // Check if user already has a connection
    const existing = await prisma.gmailConnection.findUnique({
      where: { userId: session.user.id },
    });

    if (existing) {
      // Update existing connection
      await prisma.gmailConnection.update({
        where: { userId: session.user.id },
        data: {
          gmailAddress: userInfo.email,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
        },
      });
    } else {
      // Create new connection
      await prisma.gmailConnection.create({
        data: {
          id: crypto.randomUUID(),
          userId: session.user.id,
          gmailAddress: userInfo.email,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.redirect(`${baseUrl}/outreach?gmail_connected=true`);
  } catch (error: any) {
    console.error("Gmail callback error:", error);
    const env = getServerEnv();
    const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
    return NextResponse.redirect(
      `${baseUrl}/outreach?gmail_error=${encodeURIComponent(error.message || "callback_failed")}`,
    );
  }
}
