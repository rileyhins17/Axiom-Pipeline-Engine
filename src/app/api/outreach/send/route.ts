import { NextResponse } from "next/server";

import { generateEmail } from "@/lib/outreach-email-generator";
import { getServerEnv } from "@/lib/env";
import { getValidAccessToken, sendGmailEmail } from "@/lib/gmail";
import {
  getManualMailboxSendGate,
  getMailboxForManualSend,
  stopUnsentAutomationSequencesForManualSend,
} from "@/lib/outreach-automation";
import { resolveLeadEnrichment } from "@/lib/outreach-enrichment";
import { getPrisma } from "@/lib/prisma";
import type { LeadRecord } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const env = getServerEnv();
    const body = (await request.json()) as { leadIds?: number[] };
    const leadIds = body.leadIds;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds array is required" }, { status: 400 });
    }

    const prisma = getPrisma();

    const mailboxSelection = await getMailboxForManualSend(authResult.session.user.id);
    if (!mailboxSelection) {
      return NextResponse.json(
        { error: "Gmail not connected. Please connect your Gmail account first." },
        { status: 400 },
      );
    }
    const { mailbox, connection } = mailboxSelection;

    // Manual send is an admin override: if the lead has an email, we try to send it.
    // It intentionally bypasses automation qualification, suppression, and 30-day
    // dedupe so an operator can force a one-off send to any selected lead.
    const leads: LeadRecord[] = [];
    let skippedNoEmail = 0;
    for (const id of leadIds) {
      const lead = await prisma.lead.findUnique({ where: { id } });
      if (lead?.email?.trim()) {
        leads.push(lead);
      } else {
        skippedNoEmail += 1;
      }
    }

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "No selected leads have an email address to send to." },
        { status: 400 },
      );
    }

    const capacity = await getManualMailboxSendGate(mailbox, leads.length);
    if (!capacity.allowed) {
      return NextResponse.json(
        { error: capacity.reason || "Mailbox cannot send right now." },
        { status: 429 },
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
    const results: Array<{ leadId: number; businessName: string; status: "sent" | "failed"; error?: string }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const recipientEmail = lead.email?.trim();
      if (!recipientEmail) continue;

      try {
        const enrichment = resolveLeadEnrichment(lead);
        const email = await generateEmail(lead, enrichment, senderName);

        const sendResult = await sendGmailEmail({
          accessToken: tokenResult.accessToken,
          from: mailbox.gmailAddress,
          fromName: senderName,
          to: recipientEmail,
          subject: email.subject,
          bodyHtml: email.bodyHtml,
          bodyPlain: email.bodyPlain,
        });

        const sentAt = new Date();
        await prisma.outreachEmail.create({
          data: {
            id: crypto.randomUUID(),
            leadId: lead.id,
            senderUserId: authResult.session.user.id,
            senderEmail: mailbox.gmailAddress,
            mailboxId: mailbox.id,
            recipientEmail,
            subject: email.subject,
            bodyHtml: email.bodyHtml,
            bodyPlain: email.bodyPlain,
            gmailMessageId: sendResult.messageId,
            gmailThreadId: sendResult.threadId,
            status: "sent",
            sentAt,
          },
        });

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            outreachStatus: "OUTREACHED",
            outreachChannel: "EMAIL",
            firstContactedAt: lead.firstContactedAt || sentAt,
            lastContactedAt: sentAt,
          },
        });
        await prisma.outreachMailbox.update({
          where: { id: mailbox.id },
          data: { lastSentAt: sentAt },
        });
        await stopUnsentAutomationSequencesForManualSend(lead.id);

        results.push({ leadId: lead.id, businessName: lead.businessName, status: "sent" });
      } catch (error: unknown) {
        console.error(`[outreach-send] Failed for lead ${lead.id}:`, error);
        const message = getErrorMessage(error);

        try {
          await prisma.outreachEmail.create({
            data: {
              id: crypto.randomUUID(),
              leadId: lead.id,
              senderUserId: authResult.session.user.id,
              senderEmail: mailbox.gmailAddress,
              mailboxId: mailbox.id,
              recipientEmail,
              subject: "(manual send failed)",
              bodyHtml: "",
              bodyPlain: "",
              status: "failed",
              errorMessage: message,
              sentAt: new Date(),
            },
          });
        } catch {
          // Best effort failure logging only.
        }

        results.push({
          leadId: lead.id,
          businessName: lead.businessName,
          status: "failed",
          error: message,
        });
      }

      if (i < leads.length - 1 && env.OUTREACH_SEND_DELAY_MS > 0) {
        await sleep(env.OUTREACH_SEND_DELAY_MS);
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      sent,
      failed,
      skippedDedup: 0,
      skippedNoEmail,
      total: leads.length,
      results,
    });
  } catch (error: unknown) {
    console.error("Outreach send error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to send outreach emails" },
      { status: 500 },
    );
  }
}
