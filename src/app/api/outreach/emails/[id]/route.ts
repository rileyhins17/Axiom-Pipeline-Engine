import { NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) return authResult.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const prisma = getPrisma();
    const email = await prisma.outreachEmail.findUnique({ where: { id } });
    if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

    const lead = await prisma.lead.findUnique({
      where: { id: email.leadId },
      select: { id: true, businessName: true, city: true },
    });

    return NextResponse.json({
      email: {
        id: email.id,
        leadId: email.leadId,
        senderEmail: email.senderEmail,
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        bodyHtml: email.bodyHtml,
        bodyPlain: email.bodyPlain,
        status: email.status,
        errorMessage: email.errorMessage,
        sentAt: email.sentAt,
        gmailMessageId: email.gmailMessageId,
        gmailThreadId: email.gmailThreadId,
      },
      lead,
    });
  } catch (error: unknown) {
    console.error("Email detail error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch email") },
      { status: 500 },
    );
  }
}
