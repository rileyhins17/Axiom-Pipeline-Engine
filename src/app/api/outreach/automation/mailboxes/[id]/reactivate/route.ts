import { NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { getValidAccessToken } from "@/lib/gmail";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing mailbox id" }, { status: 400 });

  const prisma = getPrisma();

  try {
    const mailbox = await prisma.outreachMailbox.findUnique({ where: { id } });
    if (!mailbox) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    if (!mailbox.gmailConnectionId) {
      return NextResponse.json({
        ok: false,
        needsReconnect: true,
        reason: "no_connection",
        message: "This mailbox is not linked to a Gmail connection. Re-authorize via Settings.",
        connectUrl: `/api/outreach/gmail/connect?email=${encodeURIComponent(mailbox.gmailAddress)}`,
      });
    }

    const connection = await prisma.gmailConnection.findUnique({
      where: { id: mailbox.gmailConnectionId },
    });
    if (!connection) {
      return NextResponse.json({
        ok: false,
        needsReconnect: true,
        reason: "connection_missing",
        message: "Gmail connection record is missing. Re-authorize via Settings.",
        connectUrl: `/api/outreach/gmail/connect?email=${encodeURIComponent(mailbox.gmailAddress)}`,
      });
    }

    try {
      const tokenResult = await getValidAccessToken({
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        tokenExpiresAt: connection.tokenExpiresAt,
      });
      if (tokenResult.updated) {
        await prisma.gmailConnection.update({
          where: { id: connection.id },
          data: tokenResult.updated,
        });
      }
    } catch (refreshError) {
      console.error(`[reactivate] Token refresh failed for ${mailbox.gmailAddress}:`, refreshError);
      return NextResponse.json({
        ok: false,
        needsReconnect: true,
        reason: "token_refresh_failed",
        message: "Gmail token can't be refreshed (likely revoked). Reconnect Gmail to fix.",
        connectUrl: `/api/outreach/gmail/connect?email=${encodeURIComponent(mailbox.gmailAddress)}`,
        details: getErrorMessage(refreshError, "Token refresh failed"),
      });
    }

    const cooldownLifted = mailbox.lastSentAt && new Date(mailbox.lastSentAt).getTime() > Date.now();
    const wasInactive = mailbox.status !== "ACTIVE";

    await prisma.outreachMailbox.update({
      where: { id: mailbox.id },
      data: {
        status: "ACTIVE",
        lastSentAt: cooldownLifted ? null : mailbox.lastSentAt,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      gmailAddress: mailbox.gmailAddress,
      previousStatus: mailbox.status,
      newStatus: "ACTIVE",
      cooldownCleared: Boolean(cooldownLifted),
      wasInactive,
      message: wasInactive
        ? `Reactivated ${mailbox.gmailAddress}. Sending will resume on the next cron tick.`
        : `${mailbox.gmailAddress} is already active${cooldownLifted ? " — cleared a stuck cooldown." : "."}`,
    });
  } catch (error: unknown) {
    console.error("Mailbox reactivate error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Reactivate failed") },
      { status: 500 },
    );
  }
}
