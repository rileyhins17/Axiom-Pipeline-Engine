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
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: authResult.session.user.id },
      select: {
        gmailAddress: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ connected: false });
    }

    const tokenExpired = new Date(connection.tokenExpiresAt).getTime() < Date.now();

    return NextResponse.json({
      connected: true,
      gmailAddress: connection.gmailAddress,
      tokenHealthy: !tokenExpired,
      connectedAt: connection.createdAt,
    });
  } catch (error: any) {
    console.error("Gmail status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check Gmail status" },
      { status: 500 },
    );
  }
}
