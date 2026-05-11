import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { getErrorMessage } from "@/lib/errors";
import { getGmailThreadFull, getValidAccessToken } from "@/lib/gmail";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseLeadId(value: string) {
  const leadId = Number(value);
  return Number.isFinite(leadId) && leadId > 0 ? leadId : null;
}

/**
 * GET /api/clients/[id]/emails
 *
 * Returns all email threads for a given lead/client.
 * Fetches locally stored outreach emails AND live Gmail thread content.
 */
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
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.isArchived) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const db = getDatabase();

    // Get all unique Gmail thread IDs associated with this lead
    // via OutreachEmail and OutreachSequenceStep tables
    const [emailRows, stepRows] = await Promise.all([
      db
        .prepare(
          `SELECT DISTINCT "gmailThreadId" FROM "OutreachEmail"
           WHERE "leadId" = ? AND "gmailThreadId" IS NOT NULL`,
        )
        .bind(leadId)
        .all<{ gmailThreadId: string }>(),
      db
        .prepare(
          `SELECT DISTINCT s."gmailThreadId"
           FROM "OutreachSequenceStep" s
           JOIN "OutreachSequence" seq ON s."sequenceId" = seq."id"
           WHERE seq."leadId" = ? AND s."gmailThreadId" IS NOT NULL`,
        )
        .bind(leadId)
        .all<{ gmailThreadId: string }>(),
    ]);

    const threadIds = new Set<string>();
    for (const row of emailRows.results || []) {
      if (row.gmailThreadId) threadIds.add(row.gmailThreadId);
    }
    for (const row of stepRows.results || []) {
      if (row.gmailThreadId) threadIds.add(row.gmailThreadId);
    }

    if (threadIds.size === 0) {
      // Return local outreach emails only (no Gmail threads to fetch)
      const localEmails = await prisma.outreachEmail.findMany({
        where: { leadId },
        orderBy: { sentAt: "desc" },
      });
      return NextResponse.json({
        threads: [],
        localEmails,
        senderEmail: null,
      });
    }

    // Find the Gmail connection to use for fetching threads
    const connection = await prisma.gmailConnection.findFirst({
      where: { userId: authResult.session.user.id },
    });

    if (!connection) {
      // No Gmail connection — return local data only
      const localEmails = await prisma.outreachEmail.findMany({
        where: { leadId },
        orderBy: { sentAt: "desc" },
      });
      return NextResponse.json({
        threads: [],
        localEmails,
        senderEmail: null,
        warning: "No Gmail connection found. Connect Gmail in Settings to view email threads.",
      });
    }

    // Get a valid access token (auto-refresh if expired)
    const tokenResult = await getValidAccessToken(connection);

    // Update tokens in DB if refreshed
    if (tokenResult.updated) {
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: tokenResult.updated,
      });
    }

    // Fetch all threads from Gmail in parallel
    const threadFetches = Array.from(threadIds).map(async (threadId) => {
      try {
        return await getGmailThreadFull(tokenResult.accessToken, threadId);
      } catch (error) {
        console.error(`[emails] Failed to fetch thread ${threadId}:`, error);
        return null;
      }
    });

    const threads = (await Promise.all(threadFetches)).filter(Boolean);

    // Sort threads by most recent message date descending
    threads.sort((a, b) => {
      const aDate = a!.messages[a!.messages.length - 1]?.internalDate || "0";
      const bDate = b!.messages[b!.messages.length - 1]?.internalDate || "0";
      return Number(bDate) - Number(aDate);
    });

    return NextResponse.json({
      threads,
      senderEmail: connection.gmailAddress,
    });
  } catch (error: unknown) {
    console.error("[emails] Error fetching email threads:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch email threads") },
      { status: 500 },
    );
  }
}
