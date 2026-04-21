import { NextRequest, NextResponse } from "next/server";

import { generateFollowUpEmail } from "@/lib/outreach-email-generator";
import { getServerEnv } from "@/lib/env";
import { getValidAccessToken, sendGmailEmail } from "@/lib/gmail";
import { getMailboxForManualSend } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import type { LeadRecord, OutreachEmailRecord } from "@/lib/prisma";
import { resolveLeadEnrichment } from "@/lib/outreach-enrichment";
import { requireAdminApiSession } from "@/lib/session";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const env = getServerEnv();
    const { id } = await params;
    const emailId = id.trim();

    if (!emailId) {
      return NextResponse.json({ error: "Email ID is required" }, { status: 400 });
    }

    const prisma = getPrisma();
    const priorEmail = await prisma.outreachEmail.findFirst({
      where: { id: emailId },
    }) as OutreachEmailRecord | null;

    if (!priorEmail) {
      return NextResponse.json({ error: "Email log entry not found" }, { status: 404 });
    }

    if (priorEmail.status !== "sent") {
      return NextResponse.json({ error: "Follow-ups can only be sent for delivered emails" }, { status: 400 });
    }

    const mailboxSelection = priorEmail.mailboxId
      ? {
        mailbox: await prisma.outreachMailbox.findUnique({ where: { id: priorEmail.mailboxId } }),
        connection: null,
      }
      : null;
    const mailbox = mailboxSelection?.mailbox ?? (await getMailboxForManualSend(authResult.session.user.id))?.mailbox ?? null;
    const connection = mailbox?.gmailConnectionId
      ? await prisma.gmailConnection.findUnique({ where: { id: mailbox.gmailConnectionId } })
      : null;

    if (!mailbox || !connection) {
      return NextResponse.json(
        { error: "Gmail not connected. Please connect your Gmail account first." },
        { status: 400 },
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await prisma.outreachEmail.count({
      where: {
        mailboxId: mailbox.id,
        sentAt: { gte: today },
        status: "sent",
      },
    });

    const remaining = env.OUTREACH_DAILY_SEND_LIMIT - sentToday;
    if (remaining <= 0) {
      return NextResponse.json(
        { error: `Daily send limit reached (${env.OUTREACH_DAILY_SEND_LIMIT}/day). Try again tomorrow.` },
        { status: 429 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: priorEmail.leadId },
    }) as LeadRecord | null;

    if (!lead || !lead.email) {
      return NextResponse.json(
        { error: "Lead is missing email required for a follow-up." },
        { status: 400 },
      );
    }

    const tokenResult = await getValidAccessToken(connection);
    if (tokenResult.updated) {
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: tokenResult.updated.accessToken,
          tokenExpiresAt: tokenResult.updated.tokenExpiresAt,
        },
      });
    }

    const senderName = mailbox.label || authResult.session.user.name || connection.gmailAddress.split("@")[0];
    const enrichment = resolveLeadEnrichment(lead);
    const followUp = await generateFollowUpEmail(lead, enrichment, senderName, {
      subject: priorEmail.subject,
      bodyPlain: priorEmail.bodyPlain,
      sentAt: priorEmail.sentAt,
    });

    const sendResult = await sendGmailEmail({
      accessToken: tokenResult.accessToken,
      from: connection.gmailAddress,
      fromName: senderName,
      to: lead.email,
      subject: followUp.subject,
      bodyHtml: followUp.bodyHtml,
      bodyPlain: followUp.bodyPlain,
      threadId: priorEmail.gmailThreadId || undefined,
    });

    const loggedEmail = await prisma.outreachEmail.create({
      data: {
        id: crypto.randomUUID(),
        leadId: lead.id,
        senderUserId: authResult.session.user.id,
        senderEmail: connection.gmailAddress,
        mailboxId: mailbox.id,
        recipientEmail: lead.email,
        subject: followUp.subject,
        bodyHtml: followUp.bodyHtml,
        bodyPlain: followUp.bodyPlain,
        gmailMessageId: sendResult.messageId,
        gmailThreadId: sendResult.threadId || priorEmail.gmailThreadId,
        status: "sent",
        sentAt: new Date(),
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        outreachStatus: lead.outreachStatus === "NOT_CONTACTED" || !lead.outreachStatus ? "OUTREACHED" : lead.outreachStatus,
        outreachChannel: "EMAIL",
        firstContactedAt: lead.firstContactedAt || priorEmail.sentAt,
        lastContactedAt: new Date(),
      },
    });
    await prisma.outreachMailbox.update({
      where: { id: mailbox.id },
      data: { lastSentAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      email: {
        ...loggedEmail,
        businessName: lead.businessName,
      },
    });
  } catch (error: unknown) {
    console.error("Follow-up send error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to send follow-up" },
      { status: 500 },
    );
  }
}
