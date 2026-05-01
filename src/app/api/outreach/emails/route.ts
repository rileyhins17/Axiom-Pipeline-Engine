import { NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const emails = await prisma.outreachEmail.findMany({
      orderBy: { sentAt: "desc" },
      take: 200,
    });

    const leadIds = Array.from(new Set(emails.map((email) => email.leadId)));
    const leads = leadIds.length > 0
      ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          businessName: true,
        },
      })
      : [];
    const leadNames = new Map(leads.map((lead) => [lead.id, lead.businessName]));

    return NextResponse.json({
      emails: emails.map((email) => ({
        ...email,
        businessName: leadNames.get(email.leadId) || `Lead #${email.leadId}`,
      })),
    });
  } catch (error: unknown) {
    console.error("Email log error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch email log") },
      { status: 500 },
    );
  }
}
