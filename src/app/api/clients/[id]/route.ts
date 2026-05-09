import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseLeadId(value: string) {
  const leadId = Number(value);
  return Number.isFinite(leadId) && leadId > 0 ? leadId : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  const leadId = parseLeadId(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.isArchived) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [activities, outreachEmails] = await Promise.all([
    prisma.crmActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.outreachEmail.findMany({
      where: { leadId },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: {
        id: true,
        leadId: true,
        senderEmail: true,
        recipientEmail: true,
        subject: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        gmailThreadId: true,
      },
    }),
  ]);

  return NextResponse.json({ lead, activities, outreachEmails });
}
