import { NextResponse } from "next/server";

import { decryptToken, revokeToken } from "@/lib/gmail";
import { getPrisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: authResult.session.user.id },
    });

    if (!connection) {
      return NextResponse.json({ error: "No Gmail connection found" }, { status: 404 });
    }

    // Best-effort revoke tokens with Google
    try {
      const refreshToken = await decryptToken(connection.refreshToken);
      await revokeToken(refreshToken);
    } catch {
      // Revocation is best-effort
    }

    // Delete the connection record
    await prisma.gmailConnection.delete({
      where: { userId: authResult.session.user.id },
    });

    return NextResponse.json({ disconnected: true });
  } catch (error: any) {
    console.error("Gmail disconnect error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to disconnect Gmail" },
      { status: 500 },
    );
  }
}
