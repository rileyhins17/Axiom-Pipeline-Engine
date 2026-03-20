import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { getPrisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { requireAdminApiSession } from "@/lib/session";

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdminApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const originFailure = assertTrustedRequestOrigin(request);
    if (originFailure) {
      return originFailure;
    }

    const { id } = await request.json();
    const leadId = Number(id);

    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }

    const prisma = getPrisma();
    await prisma.lead.delete({ where: { id: leadId } });

    await writeAuditEvent({
      action: "lead.delete",
      actorUserId: authResult.session.user.id,
      ipAddress: getClientIp(request),
      targetType: "lead",
      targetId: String(leadId),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
