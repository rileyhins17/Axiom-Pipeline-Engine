/**
 * Daily Digest — sends a morning briefing email via Gmail summarizing
 * pipeline health, overdue follow-ups, new replies, and deal risks.
 *
 * Triggered by the 5-min cron in worker.mjs. Uses a D1 KV row
 * ("daily_digest_last_sent") to ensure it fires only once per day,
 * at the first cron tick after 8:00 AM Eastern.
 */

import { getDatabase } from "@/lib/cloudflare";
import { getServerEnv } from "@/lib/env";
import { getValidAccessToken, sendGmailEmail } from "@/lib/gmail";
import { getPrisma } from "@/lib/prisma";
import type { GmailConnectionRecord } from "@/lib/prisma";
import { AUTONOMOUS_INTAKE_MIN_SCORE, MAILBOX_DAILY_SEND_TARGET } from "@/lib/automation-policy";
import { adequateLeadWhereClause, startOfUtcDay, resolveGlobalDailySendCap, isSendableMailbox } from "@/lib/ui/data-accuracy";

const BUSINESS_TZ = "America/Toronto";
const DIGEST_SEND_HOUR = 8; // 8 AM Eastern
const DIGEST_KV_KEY = "daily_digest_last_sent";
const EXPECTED_MAILBOX_COUNT = 2;

// ─── Time helpers ──────────────────────────────────────────────────

function getEasternNow(): { hour: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    hour: Number(get("hour")) % 24,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

// ─── Digest data gathering ─────────────────────────────────────────

type DigestData = {
  dateLabel: string;
  sendsYesterday: number;
  repliesYesterday: number;
  leadsFoundYesterday: number;
  replyRate: string;
  totalLeads: number;
  totalContacted: number;
  totalReplied: number;
  mrr: number;
  activeClients: number;
  forecast: number;
  overdueItems: Array<{ businessName: string; dealStage: string; nextAction: string | null; daysOverdue: number }>;
  unresolvedReplies: Array<{ businessName: string; email: string | null; hoursAgo: number }>;
  staleDeals: Array<{ businessName: string; dealStage: string; daysSinceContact: number }>;
  riskyProposals: Array<{ businessName: string; daysSinceProposal: number; monthlyValue: number | null }>;
  mailboxStatus: Array<{ email: string; connected: boolean; sentYesterday: number }>;
  emergencyPaused: boolean;
};

async function gatherDigestData(): Promise<DigestData> {
  const db = getDatabase();
  const prisma = getPrisma();
  const now = new Date();
  const yesterdayStart = new Date(startOfUtcDay().getTime() - 86_400_000).toISOString();
  const todayStart = startOfUtcDay().toISOString();
  const staleCutoff = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const riskyCutoff = new Date(now.getTime() - 21 * 86_400_000).toISOString();

  const { dateStr } = getEasternNow();

  const [
    sendsYesterdayRow,
    repliesYesterdayRow,
    leadsYesterdayRow,
    totalLeadsRow,
    totalContactedRow,
    totalRepliedRow,
    mrrRow,
    activeRow,
    forecastRow,
    overdueRows,
    unresolvedRows,
    staleRows,
    riskyRows,
    mailboxRows,
    settingsRow,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM "OutreachEmail" WHERE "status" = 'sent' AND "sentAt" >= ? AND "sentAt" < ?`)
      .bind(yesterdayStart, todayStart).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "OutreachSequence" WHERE "replyDetectedAt" >= ? AND "replyDetectedAt" < ?`)
      .bind(yesterdayStart, todayStart).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "createdAt" >= ? AND "createdAt" < ?`)
      .bind(yesterdayStart, todayStart).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE COALESCE("isArchived", 0) = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "firstContactedAt" IS NOT NULL AND COALESCE("isArchived", 0) = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "outreachStatus" = 'REPLIED' AND COALESCE("isArchived", 0) = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COALESCE(SUM("monthlyValue"), 0) AS v FROM "Lead" WHERE "dealStage" IN ('ACTIVE', 'RETAINED') AND "monthlyValue" IS NOT NULL AND COALESCE("isArchived", 0) = 0`).first<{ v: number | string }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM "Lead" WHERE "dealStage" IN ('ACTIVE', 'RETAINED') AND COALESCE("isArchived", 0) = 0`).first<{ c: number | string }>(),
    db.prepare(`SELECT COALESCE(SUM(CASE "dealStage" WHEN 'PROPOSAL_SENT' THEN "monthlyValue" * 0.2 WHEN 'NEGOTIATING' THEN "monthlyValue" * 0.5 WHEN 'SIGNED' THEN "monthlyValue" * 0.9 ELSE 0 END), 0) AS v FROM "Lead" WHERE "dealStage" IN ('PROPOSAL_SENT', 'NEGOTIATING', 'SIGNED') AND "monthlyValue" IS NOT NULL AND COALESCE("isArchived", 0) = 0`).first<{ v: number | string }>(),
    db.prepare(`
      SELECT "businessName", "dealStage", "nextAction", "nextActionDueAt"
      FROM "Lead"
      WHERE "dealStage" IS NOT NULL AND "dealStage" != 'LOST'
        AND "nextActionDueAt" IS NOT NULL AND "nextActionDueAt" < ?
        AND COALESCE("isArchived", 0) = 0
      ORDER BY "nextActionDueAt" ASC LIMIT 10
    `).bind(todayStart).all<{ businessName: string; dealStage: string; nextAction: string | null; nextActionDueAt: string }>(),
    db.prepare(`
      SELECT "businessName", "email", "lastReplyAt"
      FROM "Lead"
      WHERE "outreachStatus" = 'REPLIED' AND "dealStage" IS NULL AND COALESCE("isArchived", 0) = 0
      ORDER BY "lastReplyAt" DESC LIMIT 10
    `).all<{ businessName: string; email: string | null; lastReplyAt: string | null }>(),
    db.prepare(`
      SELECT "businessName", "dealStage", "lastContactedAt"
      FROM "Lead"
      WHERE "dealStage" IN ('PROPOSAL_SENT', 'NEGOTIATING')
        AND (("lastReplyAt" IS NULL OR "lastReplyAt" < ?) AND ("lastContactedAt" IS NULL OR "lastContactedAt" < ?))
        AND COALESCE("isArchived", 0) = 0
      ORDER BY "lastContactedAt" ASC LIMIT 10
    `).bind(staleCutoff, staleCutoff).all<{ businessName: string; dealStage: string; lastContactedAt: string | null }>(),
    db.prepare(`
      SELECT "businessName", "proposalSentAt", "monthlyValue"
      FROM "Lead"
      WHERE "dealStage" = 'PROPOSAL_SENT'
        AND "proposalSentAt" IS NOT NULL AND "proposalSentAt" < ?
        AND COALESCE("isArchived", 0) = 0
      ORDER BY "proposalSentAt" ASC LIMIT 10
    `).bind(riskyCutoff).all<{ businessName: string; proposalSentAt: string; monthlyValue: number | null }>(),
    db.prepare(`
      SELECT m."gmailAddress", m."status", m."gmailConnectionId",
             (SELECT COUNT(*) FROM "OutreachEmail" e WHERE e."senderEmail" = m."gmailAddress" AND e."status" = 'sent' AND e."sentAt" >= ? AND e."sentAt" < ?) AS "sentYesterday"
      FROM "OutreachMailbox" m
    `).bind(yesterdayStart, todayStart).all<{ gmailAddress: string; status: string | null; gmailConnectionId: string | null; sentYesterday: number | string }>(),
    db.prepare(`SELECT "emergencyPaused" FROM "OutreachAutomationSetting" LIMIT 1`).first<{ emergencyPaused: number | boolean | null }>().catch(() => null),
  ]);

  const contacted = Number(totalContactedRow?.c ?? 0);
  const replied = Number(totalRepliedRow?.c ?? 0);

  return {
    dateLabel: dateStr,
    sendsYesterday: Number(sendsYesterdayRow?.c ?? 0),
    repliesYesterday: Number(repliesYesterdayRow?.c ?? 0),
    leadsFoundYesterday: Number(leadsYesterdayRow?.c ?? 0),
    replyRate: contacted > 0 ? `${((replied / contacted) * 100).toFixed(1)}%` : "—",
    totalLeads: Number(totalLeadsRow?.c ?? 0),
    totalContacted: contacted,
    totalReplied: replied,
    mrr: Number(mrrRow?.v ?? 0),
    activeClients: Number(activeRow?.c ?? 0),
    forecast: Math.round(Number(forecastRow?.v ?? 0)),
    overdueItems: (overdueRows.results ?? []).map((r) => ({
      businessName: r.businessName,
      dealStage: r.dealStage,
      nextAction: r.nextAction,
      daysOverdue: Math.max(1, Math.ceil((now.getTime() - new Date(r.nextActionDueAt).getTime()) / 86_400_000)),
    })),
    unresolvedReplies: (unresolvedRows.results ?? []).map((r) => ({
      businessName: r.businessName,
      email: r.email,
      hoursAgo: r.lastReplyAt ? Math.floor((now.getTime() - new Date(r.lastReplyAt).getTime()) / 3_600_000) : 0,
    })),
    staleDeals: (staleRows.results ?? []).map((r) => ({
      businessName: r.businessName,
      dealStage: r.dealStage,
      daysSinceContact: r.lastContactedAt ? Math.floor((now.getTime() - new Date(r.lastContactedAt).getTime()) / 86_400_000) : 999,
    })),
    riskyProposals: (riskyRows.results ?? []).map((r) => ({
      businessName: r.businessName,
      daysSinceProposal: Math.floor((now.getTime() - new Date(r.proposalSentAt).getTime()) / 86_400_000),
      monthlyValue: r.monthlyValue,
    })),
    mailboxStatus: (mailboxRows.results ?? []).map((r) => ({
      email: r.gmailAddress,
      connected: Boolean(r.gmailConnectionId && (r.status === "ACTIVE" || r.status === "WARMING")),
      sentYesterday: Number(r.sentYesterday ?? 0),
    })),
    emergencyPaused: Boolean(settingsRow?.emergencyPaused),
  };
}

// ─── HTML rendering ────────────────────────────────────────────────

function renderDigestHtml(data: DigestData): string {
  const hasAttentionItems = data.overdueItems.length > 0
    || data.unresolvedReplies.length > 0
    || data.staleDeals.length > 0
    || data.riskyProposals.length > 0;

  const section = (title: string, content: string) => `
    <tr><td style="padding:20px 24px 0">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#a1a1aa;margin-bottom:10px">${title}</div>
      ${content}
    </td></tr>`;

  const stat = (label: string, value: string | number, color = "#e4e4e7") =>
    `<div style="display:inline-block;min-width:120px;margin:0 16px 8px 0">
      <div style="font-size:22px;font-weight:600;color:${color};font-family:monospace">${value}</div>
      <div style="font-size:11px;color:#71717a;margin-top:2px">${label}</div>
    </div>`;

  const alertRow = (name: string, detail: string, urgency: "red" | "amber" | "zinc" = "amber") => {
    const colors = { red: "#fca5a5", amber: "#fcd34d", zinc: "#a1a1aa" };
    return `<div style="padding:6px 0;border-bottom:1px solid #27272a">
      <div style="font-size:13px;font-weight:500;color:${colors[urgency]}">${name}</div>
      <div style="font-size:11px;color:#71717a;margin-top:1px">${detail}</div>
    </div>`;
  };

  const mailboxRow = (mb: DigestData["mailboxStatus"][0]) => {
    const statusLabel = mb.connected ? "Connected" : "Disconnected";
    const statusColor = mb.connected ? "#6ee7b7" : "#fca5a5";
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #27272a">
      <span style="font-size:12px;color:#d4d4d8;font-family:monospace">${mb.email}</span>
      <span style="font-size:11px">
        <span style="color:${statusColor}">${statusLabel}</span>
        <span style="color:#71717a;margin-left:8px">${mb.sentYesterday} sent</span>
      </span>
    </div>`;
  };

  let attentionHtml = "";
  if (data.emergencyPaused) {
    attentionHtml += alertRow("Emergency Stop Active", "Intake, queueing, and sending are blocked.", "red");
  }
  for (const item of data.overdueItems) {
    attentionHtml += alertRow(
      item.businessName,
      `Overdue ${item.daysOverdue}d — ${item.nextAction ?? item.dealStage.replace(/_/g, " ")}`,
      "red",
    );
  }
  for (const item of data.unresolvedReplies) {
    const age = item.hoursAgo < 24 ? `${item.hoursAgo}h ago` : `${Math.floor(item.hoursAgo / 24)}d ago`;
    attentionHtml += alertRow(item.businessName, `Replied ${age} — no deal stage set`, "amber");
  }
  for (const item of data.staleDeals) {
    attentionHtml += alertRow(
      item.businessName,
      `${item.dealStage.replace(/_/g, " ")} — no contact in ${item.daysSinceContact}d`,
      "amber",
    );
  }
  for (const item of data.riskyProposals) {
    const val = item.monthlyValue ? ` ($${item.monthlyValue}/mo)` : "";
    attentionHtml += alertRow(item.businessName, `Proposal sent ${item.daysSinceProposal}d ago${val}`, "red");
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#18181b;border-radius:12px;overflow:hidden;border:1px solid #27272a">
  <tr><td style="padding:24px;border-bottom:1px solid #27272a">
    <div style="font-size:20px;font-weight:600;color:#fafafa">Axiom Daily Briefing</div>
    <div style="font-size:12px;color:#71717a;margin-top:4px">${data.dateLabel}</div>
  </td></tr>

  ${section("Yesterday's Activity", `
    ${stat("Sends", data.sendsYesterday, "#67e8f9")}
    ${stat("Replies", data.repliesYesterday, "#fcd34d")}
    ${stat("Leads Found", data.leadsFoundYesterday, "#6ee7b7")}
    ${stat("Reply Rate", data.replyRate, "#e4e4e7")}
  `)}

  ${section("Pipeline Totals", `
    ${stat("Total Leads", data.totalLeads.toLocaleString())}
    ${stat("Contacted", data.totalContacted.toLocaleString(), "#a78bfa")}
    ${stat("Replied", data.totalReplied.toLocaleString(), "#fcd34d")}
  `)}

  ${section("Revenue", `
    ${stat("MRR", `$${data.mrr.toLocaleString()}`, "#6ee7b7")}
    ${stat("Active Clients", data.activeClients)}
    ${data.forecast > 0 ? stat("Weighted Forecast", `+$${data.forecast.toLocaleString()}/mo`, "#fcd34d") : ""}
  `)}

  ${data.mailboxStatus.length > 0 ? section("Mailboxes", data.mailboxStatus.map(mailboxRow).join("")) : ""}

  ${hasAttentionItems || data.emergencyPaused ? section("Needs Attention", attentionHtml) : section("Status", `<div style="font-size:13px;color:#6ee7b7;padding:8px 0">All clear — no overdue items, stale deals, or unresolved replies.</div>`)}

  <tr><td style="padding:20px 24px;border-top:1px solid #27272a">
    <a href="${getServerEnv().APP_BASE_URL.replace(/\/$/, "")}/dashboard" style="display:inline-block;padding:8px 16px;background:#3f3f46;color:#fafafa;border-radius:6px;font-size:12px;font-weight:500;text-decoration:none">Open Dashboard</a>
  </td></tr>
</table>
</body></html>`;
}

function renderDigestPlain(data: DigestData): string {
  const lines: string[] = [
    `AXIOM DAILY BRIEFING — ${data.dateLabel}`,
    "",
    "YESTERDAY",
    `  Sends: ${data.sendsYesterday}  |  Replies: ${data.repliesYesterday}  |  Leads found: ${data.leadsFoundYesterday}  |  Reply rate: ${data.replyRate}`,
    "",
    "PIPELINE",
    `  Total leads: ${data.totalLeads.toLocaleString()}  |  Contacted: ${data.totalContacted.toLocaleString()}  |  Replied: ${data.totalReplied.toLocaleString()}`,
    "",
    "REVENUE",
    `  MRR: $${data.mrr.toLocaleString()}/mo  |  Active clients: ${data.activeClients}  |  Forecast: +$${data.forecast.toLocaleString()}/mo`,
    "",
  ];

  if (data.mailboxStatus.length > 0) {
    lines.push("MAILBOXES");
    for (const mb of data.mailboxStatus) {
      lines.push(`  ${mb.email}: ${mb.connected ? "Connected" : "DISCONNECTED"} (${mb.sentYesterday} sent yesterday)`);
    }
    lines.push("");
  }

  const alerts: string[] = [];
  if (data.emergencyPaused) alerts.push("  [!!] Emergency stop is active");
  for (const item of data.overdueItems) alerts.push(`  [OVERDUE ${item.daysOverdue}d] ${item.businessName} — ${item.nextAction ?? item.dealStage}`);
  for (const item of data.unresolvedReplies) {
    const age = item.hoursAgo < 24 ? `${item.hoursAgo}h` : `${Math.floor(item.hoursAgo / 24)}d`;
    alerts.push(`  [REPLY ${age}] ${item.businessName} — no deal stage`);
  }
  for (const item of data.staleDeals) alerts.push(`  [STALE ${item.daysSinceContact}d] ${item.businessName} — ${item.dealStage}`);
  for (const item of data.riskyProposals) {
    const val = item.monthlyValue ? ` ($${item.monthlyValue}/mo)` : "";
    alerts.push(`  [RISKY ${item.daysSinceProposal}d] ${item.businessName}${val}`);
  }

  if (alerts.length > 0) {
    lines.push("NEEDS ATTENTION", ...alerts);
  } else {
    lines.push("All clear — no overdue items, stale deals, or unresolved replies.");
  }

  lines.push("", `Dashboard: ${getServerEnv().APP_BASE_URL.replace(/\/$/, "")}/dashboard`);
  return lines.join("\n");
}

// ─── Sending ───────────────────────────────────────────────────────

async function getDigestSenderConnection(): Promise<GmailConnectionRecord | null> {
  const prisma = getPrisma();
  const recipients = await getDigestRecipients();
  // Prefer a connection matching the first admin email so the digest
  // arrives "from" the primary operator rather than whichever account
  // was touched most recently.
  if (recipients.length > 0) {
    const preferred = await prisma.gmailConnection.findFirst({
      where: { gmailAddress: recipients[0] },
    }) as GmailConnectionRecord | null;
    if (preferred) return preferred;
  }
  return prisma.gmailConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  }) as Promise<GmailConnectionRecord | null>;
}

async function getDigestRecipients(): Promise<string[]> {
  const env = getServerEnv();
  const admins = env.AUTH_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.length > 0 ? admins : [];
}

export async function sendDailyDigest(): Promise<{ sent: boolean; recipients: string[]; error?: string }> {
  const connection = await getDigestSenderConnection();
  if (!connection) {
    return { sent: false, recipients: [], error: "No Gmail connection available" };
  }

  const recipients = await getDigestRecipients();
  if (recipients.length === 0) {
    return { sent: false, recipients: [], error: "No admin recipients configured" };
  }

  const data = await gatherDigestData();
  const html = renderDigestHtml(data);
  const plain = renderDigestPlain(data);

  const { accessToken, updated } = await getValidAccessToken(connection);
  if (updated) {
    const prisma = getPrisma();
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: { accessToken: updated.accessToken, tokenExpiresAt: updated.tokenExpiresAt },
    });
  }

  const attentionCount = data.overdueItems.length + data.unresolvedReplies.length
    + data.staleDeals.length + data.riskyProposals.length;
  const subjectSuffix = attentionCount > 0 ? ` — ${attentionCount} item${attentionCount > 1 ? "s" : ""} need attention` : " — all clear";

  for (const recipient of recipients) {
    await sendGmailEmail({
      accessToken,
      from: connection.gmailAddress,
      fromName: "Axiom Pipeline",
      to: recipient,
      subject: `Daily Briefing ${data.dateLabel}${subjectSuffix}`,
      bodyHtml: html,
      bodyPlain: plain,
    });
  }

  return { sent: true, recipients };
}

// ─── Cron guard ────────────────────────────────────────────────────

export async function maybeRunDailyDigest(): Promise<{ ran: boolean; result?: Awaited<ReturnType<typeof sendDailyDigest>> }> {
  const { hour, dateStr } = getEasternNow();

  if (hour < DIGEST_SEND_HOUR) {
    return { ran: false };
  }

  const db = getDatabase();

  const existing = await db
    .prepare(`SELECT "value" FROM "KvStore" WHERE "key" = ?`)
    .bind(DIGEST_KV_KEY)
    .first<{ value: string }>()
    .catch(() => null);

  if (existing?.value === dateStr) {
    return { ran: false };
  }

  // Claim: upsert the date so concurrent ticks don't double-send.
  await db
    .prepare(
      `INSERT INTO "KvStore" ("key", "value", "updatedAt") VALUES (?, ?, datetime('now'))
       ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
    )
    .bind(DIGEST_KV_KEY, dateStr)
    .run();

  try {
    const result = await sendDailyDigest();
    console.log(`[digest] Sent daily digest to ${result.recipients.join(", ")}`);
    return { ran: true, result };
  } catch (error) {
    console.error("[digest] Failed to send daily digest:", error);
    // Reset the claim so next tick retries
    await db
      .prepare(`DELETE FROM "KvStore" WHERE "key" = ?`)
      .bind(DIGEST_KV_KEY)
      .run()
      .catch(() => null);
    return { ran: false };
  }
}
