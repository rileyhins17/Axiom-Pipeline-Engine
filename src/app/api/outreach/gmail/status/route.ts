import { NextResponse } from "next/server";

import { listAutomationOverview, syncMailboxesForGmailConnections } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const connections = await prisma.gmailConnection.findMany({
      where: { userId: authResult.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        gmailAddress: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const syncedMailboxes = await syncMailboxesForGmailConnections(authResult.session.user.id);
    const automation = await listAutomationOverview().catch(() => ({ mailboxes: [] }));
    const automationMailboxes = automation.mailboxes.filter((mailbox) => mailbox.userId === authResult.session.user.id);
    const mailboxesByAddress = new Map(
      [...automationMailboxes, ...syncedMailboxes].map((mailbox) => [mailbox.gmailAddress.toLowerCase(), mailbox]),
    );
    const mailboxes = Array.from(mailboxesByAddress.values());

    if (connections.length === 0) {
      return NextResponse.json({ connected: false, connections: [], mailboxes: [] });
    }

    return NextResponse.json({
      connected: true,
      gmailAddress: connections[0]?.gmailAddress,
      tokenHealthy: connections.some((connection) => new Date(connection.tokenExpiresAt).getTime() >= Date.now()),
      connectedAt: connections[0]?.createdAt,
      connections: connections.map((connection) => ({
        ...connection,
        tokenHealthy: new Date(connection.tokenExpiresAt).getTime() >= Date.now(),
      })),
      mailboxes,
    });
  } catch (error: unknown) {
    console.error("Gmail status error:", error);
    const message = error instanceof Error ? error.message : "Failed to check Gmail status";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
