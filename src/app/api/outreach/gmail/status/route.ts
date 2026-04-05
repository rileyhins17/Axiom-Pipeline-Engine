import { NextResponse } from "next/server";

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
    const mailboxes = await prisma.outreachMailbox.findMany({
      where: { userId: authResult.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        gmailAddress: true,
        label: true,
        status: true,
      },
    });

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
  } catch (error: any) {
    console.error("Gmail status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check Gmail status" },
      { status: 500 },
    );
  }
}
