import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp, getDatabase } from "@/lib/cloudflare";
import { getPrisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
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

    const originFailure = assertTrustedRequestOrigin(request);
    if (originFailure) {
      return originFailure;
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const confirmation = String(body.confirm || "").trim();

    if (confirmation !== "DELETE ALL LEADS") {
      return NextResponse.json({ error: "Confirmation phrase missing" }, { status: 400 });
    }

    const prisma = getPrisma();
    const leadCountBefore = await prisma.lead.count();
    const db = getDatabase();
    const result = (await db.prepare('DELETE FROM "Lead"').run()) as DeleteResult;
    const deletedCount = countChanges(result);

    await writeAuditEvent({
      action: "lead.delete_all",
      actorUserId: authResult.session.user.id,
      ipAddress: getClientIp(request),
      targetType: "lead",
      metadata: {
        deletedCount,
        leadCountBefore,
      },
    });

    return NextResponse.json({
      deletedCount,
      ok: true,
    });
  } catch (error) {
    console.error("Delete all leads error:", error);
    return NextResponse.json({ error: "Failed to delete all leads" }, { status: 500 });
  }
}
