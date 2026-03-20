import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp, getDatabase } from "@/lib/cloudflare";
import { requireAdminApiSession } from "@/lib/session";

type DeleteResult = {
  meta?: {
    changes?: number;
  };
};

function countChanges(result: DeleteResult | null | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const db = getDatabase();
    const existingUser = await db
      .prepare(
        `SELECT "id", "email", "name"
         FROM "User"
         WHERE lower("email") = lower(?)
         LIMIT 1`,
      )
      .bind(email)
      .first<{ id: string; email: string; name: string | null }>();

    const verificationResult = (await db
      .prepare(`DELETE FROM "Verification" WHERE lower("identifier") = lower(?)`)
      .bind(email)
      .run()) as DeleteResult;

    let sessionResult: DeleteResult | null = null;
    let accountResult: DeleteResult | null = null;
    let userResult: DeleteResult | null = null;

    if (existingUser?.id) {
      sessionResult = (await db.prepare(`DELETE FROM "Session" WHERE "userId" = ?`).bind(existingUser.id).run()) as DeleteResult;
      accountResult = (await db.prepare(`DELETE FROM "Account" WHERE "userId" = ?`).bind(existingUser.id).run()) as DeleteResult;
      userResult = (await db.prepare(`DELETE FROM "User" WHERE "id" = ?`).bind(existingUser.id).run()) as DeleteResult;
    }

    await writeAuditEvent({
      action: "auth.user_reset",
      actorUserId: authResult.session.user.id,
      ipAddress: getClientIp(request),
      targetType: "user",
      targetId: existingUser?.id ?? email,
      metadata: {
        email,
        hadUser: Boolean(existingUser),
        deletedAccounts: countChanges(accountResult),
        deletedSessions: countChanges(sessionResult),
        deletedUser: countChanges(userResult),
        deletedVerifications: countChanges(verificationResult),
      },
    });

    return NextResponse.json({
      ok: true,
      hadUser: Boolean(existingUser),
      deleted: {
        accounts: countChanges(accountResult),
        sessions: countChanges(sessionResult),
        user: countChanges(userResult),
        verifications: countChanges(verificationResult),
      },
    });
  } catch (error) {
    console.error("User reset error:", error);
    return NextResponse.json({ error: "Failed to reset user" }, { status: 500 });
  }
}
