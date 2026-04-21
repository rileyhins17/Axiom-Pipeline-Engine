import { NextResponse } from "next/server";

import { generateEmail } from "@/lib/outreach-email-generator";
import { getServerEnv } from "@/lib/env";
import { getValidAccessToken, sendGmailEmail } from "@/lib/gmail";
import { getMailboxForManualSend } from "@/lib/outreach-automation";
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

    // Check daily send limit
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

    if (leadIds.length > remaining) {
      return NextResponse.json(
        { error: `Only ${remaining} emails remaining today (limit: ${env.OUTREACH_DAILY_SEND_LIMIT}/day). Selected ${leadIds.length} leads.` },
        { status: 429 },
      );
    }

    // Fetch leads
    const leads: LeadRecord[] = [];
    for (const id of leadIds) {
      const lead = await prisma.lead.findUnique({ where: { id } });
      if (lead && lead.email) {
        leads.push(lead);
      }
    }

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "No eligible leads found (must have email and enrichment data)" },
        { status: 400 },
      );
    }

    // Check for recent sends to same recipients (30-day dedup)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentlySent = new Set<string>();
    for (const lead of leads) {
      const existing = await prisma.outreachEmail.findFirst({
        where: {
          recipientEmail: lead.email!,
          sentAt: { gte: thirtyDaysAgo },
          status: "sent",
        },
        select: { recipientEmail: true },
      });
      if (existing) {
        recentlySent.add(lead.email!.toLowerCase());
      }
    }

    const eligibleLeads = leads.filter(
      (lead) => !recentlySent.has(lead.email!.toLowerCase()),
    );

    if (eligibleLeads.length === 0) {
      return NextResponse.json(
        { error: "All selected leads were already emailed within the last 30 days" },
        { status: 400 },
      );
    }

    // Get a valid access token (refreshing if needed)
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

    // Derive sender name from the session user
    const senderName = mailbox.label || authResult.session.user.name || connection.gmailAddress.split("@")[0];

    // Process each lead: generate email → send → log
    const results: Array<{ leadId: number; businessName: string; status: "sent" | "failed"; error?: string }> = [];

    for (let i = 0; i < eligibleLeads.length; i++) {
      const lead = eligibleLeads[i];

      try {
        const enrichment = resolveLeadEnrichment(lead);

        // Generate personalized email via DeepSeek
        const email = await generateEmail(lead, enrichment, senderName);

        // Send via Gmail
        const sendResult = await sendGmailEmail({
          accessToken: tokenResult.accessToken,
          from: connection.gmailAddress,
          fromName: senderName,
          to: lead.email!,
          subject: email.subject,
          bodyHtml: email.bodyHtml,
          bodyPlain: email.bodyPlain,
        });

        // Log the sent email
        await prisma.outreachEmail.create({
          data: {
            id: crypto.randomUUID(),
            leadId: lead.id,
            senderUserId: authResult.session.user.id,
            senderEmail: connection.gmailAddress,
            mailboxId: mailbox.id,
            recipientEmail: lead.email!,
            subject: email.subject,
            bodyHtml: email.bodyHtml,
            bodyPlain: email.bodyPlain,
            gmailMessageId: sendResult.messageId,
            gmailThreadId: sendResult.threadId,
            status: "sent",
            sentAt: new Date(),
          },
        });

        // Update lead outreach status
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            outreachStatus: "OUTREACHED",
            outreachChannel: "EMAIL",
            firstContactedAt: lead.firstContactedAt || new Date(),
            lastContactedAt: new Date(),
          },
        });
        await prisma.outreachMailbox.update({
          where: { id: mailbox.id },
          data: { lastSentAt: new Date() },
        });

        results.push({ leadId: lead.id, businessName: lead.businessName, status: "sent" });
      } catch (error: unknown) {
        console.error(`[outreach-send] Failed for lead ${lead.id}:`, error);
        const message = getErrorMessage(error);

        // Log failed attempt
        try {
          await prisma.outreachEmail.create({
            data: {
              id: crypto.randomUUID(),
              leadId: lead.id,
              senderUserId: authResult.session.user.id,
              senderEmail: connection.gmailAddress,
              mailboxId: mailbox.id,
              recipientEmail: lead.email!,
              subject: "(generation failed)",
              bodyHtml: "",
              bodyPlain: "",
              status: "failed",
              errorMessage: message,
              sentAt: new Date(),
            },
          });
        } catch { /* best effort */ }

        results.push({
          leadId: lead.id,
          businessName: lead.businessName,
          status: "failed",
          error: message,
        });
      }

      // Delay between sends (except for last one)
      if (i < eligibleLeads.length - 1 && env.OUTREACH_SEND_DELAY_MS > 0) {
        await sleep(env.OUTREACH_SEND_DELAY_MS);
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skippedDedup = leads.length - eligibleLeads.length;

    return NextResponse.json({
      sent,
      failed,
      skippedDedup,
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
