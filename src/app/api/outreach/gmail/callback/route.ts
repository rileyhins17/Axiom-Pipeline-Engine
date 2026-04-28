import { NextRequest, NextResponse } from "next/server";

import {
  ensureMailboxForConnection,
} from "@/lib/outreach-automation";
import {
  encryptToken,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  normalizeGmailAddress,
  parseGmailOAuthState,
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
    const parsedState = parseGmailOAuthState(state);

    const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");

    if (!parsedState || parsedState.sessionId !== session.session.id) {
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=invalid_state`,
      );
    }

    if (error) {
      console.error("Gmail OAuth error:", error);
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=${encodeURIComponent(error)}`,
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=missing_code`,
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=no_refresh_token`,
      );
    }

    // Get user's Gmail address
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    const gmailAddress = normalizeGmailAddress(userInfo.email);

    if (!gmailAddress) {
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=no_email`,
      );
    }

    if (parsedState.targetEmail && gmailAddress !== parsedState.targetEmail) {
      return NextResponse.redirect(
        `${baseUrl}/settings?gmail_error=wrong_account&expected=${encodeURIComponent(parsedState.targetEmail)}&actual=${encodeURIComponent(gmailAddress)}`,
      );
    }

    // Encrypt tokens before storage
    const encryptedAccess = await encryptToken(tokens.access_token);
    const encryptedRefresh = await encryptToken(tokens.refresh_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const prisma = getPrisma();

    const existing = await prisma.gmailConnection.findFirst({
      where: {
        userId: session.user.id,
        gmailAddress,
      },
    });

    const connectionId = existing?.id || crypto.randomUUID();
    if (existing) {
      await prisma.gmailConnection.update({
        where: { id: existing.id },
        data: {
          gmailAddress,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
        },
      });
    } else {
      await prisma.gmailConnection.create({
        data: {
          id: connectionId,
          userId: session.user.id,
          gmailAddress,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
          updatedAt: new Date(),
        },
      });
    }

    const connection = await prisma.gmailConnection.findUnique({
      where: { id: connectionId },
    });

    if (connection) {
      await ensureMailboxForConnection(connection, {
        label: userInfo.name || gmailAddress.split("@")[0],
        status: "ACTIVE",
        forceStatus: true,
      });
    }

    return NextResponse.redirect(`${baseUrl}/settings?gmail_connected=true`);
  } catch (error: unknown) {
    console.error("Gmail callback error:", error);
    const env = getServerEnv();
    const baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
    const message = error instanceof Error ? error.message : "callback_failed";
    return NextResponse.redirect(
      `${baseUrl}/settings?gmail_error=${encodeURIComponent(message)}`,
    );
  }
}
