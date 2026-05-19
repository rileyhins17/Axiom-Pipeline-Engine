import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/cloudflare";
import { getServerEnv } from "@/lib/env";
import { getValidAccessToken } from "@/lib/gmail";
import {
  forceResetAllBlockedState,
  healStaleSchedulerState,
  listAutomationOverview,
  runAutomationScheduler,
} from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// MCP server over HTTP (JSON-RPC 2.0). Compatible with `mcp-remote` so any
// MCP client (Claude Desktop, Claude.ai, Claude Code) can connect by pointing
// the proxy at this URL with a bearer token.
// ---------------------------------------------------------------------------

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "axiom-pipeline-engine", version: "1.0.0" };

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

function requireMcpAuth(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const token = getServerEnv().MCP_API_TOKEN;
  if (!token) return { ok: false, response: unauthorized() };
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].trim() !== token) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}

// ---------- Tool implementations ----------

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function toolListMailboxes() {
  const prisma = getPrisma();
  const mailboxes = await prisma.outreachMailbox.findMany({});
  const now = Date.now();
  return mailboxes.map((m) => ({
    id: m.id,
    gmailAddress: m.gmailAddress,
    status: m.status,
    connected: Boolean(m.gmailConnectionId),
    dailyLimit: m.dailyLimit,
    hourlyLimit: m.hourlyLimit,
    minDelaySeconds: m.minDelaySeconds,
    warmupLevel: m.warmupLevel,
    lastSentAt: m.lastSentAt,
    stuckCooldownSentinel: m.lastSentAt ? new Date(m.lastSentAt).getTime() > now + 30 * 60 * 1000 : false,
  }));
}

async function toolReactivateMailbox(args: Record<string, unknown>) {
  const idOrEmail = asString(args.idOrEmail || args.id || args.email);
  if (!idOrEmail) throw new Error("idOrEmail required");
  const prisma = getPrisma();
  const mailbox = await prisma.outreachMailbox.findFirst({
    where: idOrEmail.includes("@")
      ? { gmailAddress: idOrEmail }
      : { id: idOrEmail },
  });
  if (!mailbox) throw new Error(`Mailbox not found: ${idOrEmail}`);

  let refreshOk = true;
  let refreshError: string | null = null;
  if (mailbox.gmailConnectionId) {
    const connection = await prisma.gmailConnection.findUnique({
      where: { id: mailbox.gmailConnectionId },
    });
    if (connection) {
      try {
        const result = await getValidAccessToken({
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          tokenExpiresAt: connection.tokenExpiresAt,
        });
        if (result.updated) {
          await prisma.gmailConnection.update({
            where: { id: connection.id },
            data: result.updated,
          });
        }
      } catch (e) {
        refreshOk = false;
        refreshError = e instanceof Error ? e.message : "Token refresh failed";
      }
    } else {
      refreshOk = false;
      refreshError = "Gmail connection record missing";
    }
  } else {
    refreshOk = false;
    refreshError = "No Gmail connection linked";
  }

  if (!refreshOk) {
    return {
      ok: false,
      needsReconnect: true,
      gmailAddress: mailbox.gmailAddress,
      reason: refreshError,
      connectUrl: `/api/outreach/gmail/connect?email=${encodeURIComponent(mailbox.gmailAddress)}`,
    };
  }

  await prisma.outreachMailbox.update({
    where: { id: mailbox.id },
    data: { status: "ACTIVE", lastSentAt: null, updatedAt: new Date() },
  });

  return {
    ok: true,
    gmailAddress: mailbox.gmailAddress,
    previousStatus: mailbox.status,
    newStatus: "ACTIVE",
  };
}

async function toolNextSends(args: Record<string, unknown>) {
  const limit = Math.min(50, Math.max(1, asNumber(args.limit, 5)));
  const overview = await listAutomationOverview();
  const now = Date.now();
  return overview.sequences
    .filter((s) => s.nextSendAt && new Date(s.nextSendAt).getTime() >= now)
    .sort((a, b) => new Date(a.nextSendAt as Date).getTime() - new Date(b.nextSendAt as Date).getTime())
    .slice(0, limit)
    .map((s) => ({
      sequenceId: s.id,
      leadId: s.leadId,
      businessName: s.lead?.businessName ?? null,
      recipientEmail: s.lead?.email ?? null,
      city: s.lead?.city ?? null,
      senderInbox: s.mailbox?.gmailAddress ?? null,
      nextSendAt: s.nextSendAt,
      currentStep: s.currentStep,
      state: s.state,
    }));
}

async function toolRecentSends(args: Record<string, unknown>) {
  const limit = Math.min(100, Math.max(1, asNumber(args.limit, 20)));
  const prisma = getPrisma();
  const rows = await prisma.outreachEmail.findMany({
    orderBy: { sentAt: "desc" },
    take: limit,
  });
  const leadIds = Array.from(new Set(rows.map((r) => r.leadId)));
  const leads = leadIds.length > 0
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, businessName: true, city: true },
      })
    : [];
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    businessName: leadMap.get(r.leadId)?.businessName ?? null,
    city: leadMap.get(r.leadId)?.city ?? null,
    senderEmail: r.senderEmail,
    recipientEmail: r.recipientEmail,
    subject: r.subject,
    status: r.status,
    sentAt: r.sentAt,
  }));
}

async function toolGetEmail(args: Record<string, unknown>) {
  const id = asString(args.id);
  if (!id) throw new Error("id required");
  const prisma = getPrisma();
  const email = await prisma.outreachEmail.findUnique({ where: { id } });
  if (!email) throw new Error("Email not found");
  return {
    id: email.id,
    leadId: email.leadId,
    senderEmail: email.senderEmail,
    recipientEmail: email.recipientEmail,
    subject: email.subject,
    bodyPlain: email.bodyPlain,
    bodyHtml: email.bodyHtml,
    status: email.status,
    errorMessage: email.errorMessage,
    sentAt: email.sentAt,
    gmailThreadId: email.gmailThreadId,
  };
}

async function toolListLeadEmails(args: Record<string, unknown>) {
  const leadId = asNumber(args.leadId, 0);
  if (!leadId) throw new Error("leadId required");
  const prisma = getPrisma();
  const emails = await prisma.outreachEmail.findMany({
    where: { leadId },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
  return emails.map((e) => ({
    id: e.id,
    senderEmail: e.senderEmail,
    recipientEmail: e.recipientEmail,
    subject: e.subject,
    bodyPlain: e.bodyPlain,
    status: e.status,
    errorMessage: e.errorMessage,
    sentAt: e.sentAt,
  }));
}

async function toolSearchLeads(args: Record<string, unknown>) {
  const query = asString(args.query).trim();
  const limit = Math.min(50, Math.max(1, asNumber(args.limit, 20)));
  const db = getDatabase();
  const sql = query
    ? `SELECT id, businessName, city, niche, email, axiomScore, axiomTier, outreachStatus, firstContactedAt, lastReplyAt
       FROM "Lead"
       WHERE ("businessName" LIKE ?1 OR "email" LIKE ?1 OR "city" LIKE ?1 OR "niche" LIKE ?1)
         AND COALESCE("isArchived", 0) = 0
       ORDER BY "updatedAt" DESC
       LIMIT ${limit}`
    : `SELECT id, businessName, city, niche, email, axiomScore, axiomTier, outreachStatus, firstContactedAt, lastReplyAt
       FROM "Lead"
       WHERE COALESCE("isArchived", 0) = 0
       ORDER BY "updatedAt" DESC
       LIMIT ${limit}`;
  const result = query
    ? await db.prepare(sql).bind(`%${query}%`).all()
    : await db.prepare(sql).all();
  return result.results ?? [];
}

async function toolGetLead(args: Record<string, unknown>) {
  const leadId = asNumber(args.leadId, 0);
  if (!leadId) throw new Error("leadId required");
  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  return lead;
}

async function toolHealth() {
  const overview = await listAutomationOverview();
  const db = getDatabase();
  const lastRunRow = await db
    .prepare(
      `SELECT id, status, startedAt, finishedAt, claimedCount, sentCount, failedCount, skippedCount, metadata
       FROM "OutreachRun" ORDER BY startedAt DESC LIMIT 1`,
    )
    .first()
    .catch(() => null);
  const sentLast24hRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM "OutreachEmail"
       WHERE "status" = 'sent' AND datetime("sentAt") >= datetime('now', '-1 day')`,
    )
    .first<{ c: number | string }>()
    .catch(() => null);
  const stuckStepRows = await db
    .prepare(
      `SELECT "errorMessage" AS reason, COUNT(*) AS count
       FROM "OutreachSequenceStep"
       WHERE "status" = 'SCHEDULED' AND "errorMessage" IS NOT NULL
       GROUP BY "errorMessage" ORDER BY count DESC LIMIT 10`,
    )
    .all<{ reason: string; count: number }>()
    .catch(() => ({ results: [] }));
  return {
    engine: overview.engine,
    mailboxes: overview.mailboxes.map((m) => ({
      gmailAddress: m.gmailAddress,
      status: m.status,
      sentToday: m.sentToday,
      sentThisHour: m.sentThisHour,
      dailyLimit: m.dailyLimit,
      lastSentAt: m.lastSentAt,
    })),
    lastRun: lastRunRow,
    sentLast24h: Number(sentLast24hRow?.c ?? 0),
    stuckSteps: stuckStepRows.results ?? [],
  };
}

async function toolTriggerScheduler() {
  const result = await runAutomationScheduler({ immediate: true });
  return result;
}

async function toolHealMailboxes() {
  const prisma = getPrisma();
  const healed = await healStaleSchedulerState(prisma);
  return healed;
}

async function toolForceUnblock() {
  const prisma = getPrisma();
  const result = await forceResetAllBlockedState(prisma);
  return result;
}

// ---------- Tool registry ----------

const TOOLS: ToolDefinition[] = [
  {
    name: "health",
    description:
      "Diagnostic snapshot: engine mode, mailbox status, last scheduler run, 24h send count, top stuck-step reasons.",
    inputSchema: { type: "object", properties: {} },
    handler: () => toolHealth(),
  },
  {
    name: "list_mailboxes",
    description: "List every Gmail mailbox with status, daily limit, last sent time, and stuck-cooldown flag.",
    inputSchema: { type: "object", properties: {} },
    handler: () => toolListMailboxes(),
  },
  {
    name: "reactivate_mailbox",
    description:
      "Refresh a Gmail mailbox's OAuth token and flip status back to ACTIVE. Returns needsReconnect if the refresh token is revoked.",
    inputSchema: {
      type: "object",
      properties: {
        idOrEmail: { type: "string", description: "Mailbox id (uuid) or gmailAddress" },
      },
      required: ["idOrEmail"],
    },
    handler: (args) => toolReactivateMailbox(args),
  },
  {
    name: "next_sends",
    description:
      "Return the next scheduled outbound emails ordered by send time. Each row includes recipient, sender inbox, and exact scheduled time.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows (default 5, max 50)" },
      },
    },
    handler: (args) => toolNextSends(args),
  },
  {
    name: "recent_sends",
    description: "Recently sent outbound emails, newest first. Returns metadata only — use get_email for full body.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows (default 20, max 100)" },
      },
    },
    handler: (args) => toolRecentSends(args),
  },
  {
    name: "get_email",
    description: "Full content of a single sent email including bodyPlain + bodyHtml.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "OutreachEmail id" },
      },
      required: ["id"],
    },
    handler: (args) => toolGetEmail(args),
  },
  {
    name: "list_lead_emails",
    description: "All outbound emails sent to a specific lead, newest first, with bodies.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number", description: "Numeric Lead id" },
      },
      required: ["leadId"],
    },
    handler: (args) => toolListLeadEmails(args),
  },
  {
    name: "search_leads",
    description: "Search leads by business name, email, city, or niche substring.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to search; empty returns most recently updated leads" },
        limit: { type: "number", description: "Max rows (default 20, max 50)" },
      },
    },
    handler: (args) => toolSearchLeads(args),
  },
  {
    name: "get_lead",
    description: "Full lead record by numeric id.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "number" },
      },
      required: ["leadId"],
    },
    handler: (args) => toolGetLead(args),
  },
  {
    name: "trigger_scheduler",
    description:
      "Force an immediate scheduler run instead of waiting for the next 5-minute cron tick. Returns claimed/sent/failed counts.",
    inputSchema: { type: "object", properties: {} },
    handler: () => toolTriggerScheduler(),
  },
  {
    name: "heal_mailboxes",
    description: "Run the self-heal pass: clear stuck cooldown sentinels and auto-retry token refresh on disconnected mailboxes.",
    inputSchema: { type: "object", properties: {} },
    handler: () => toolHealMailboxes(),
  },
  {
    name: "force_unblock",
    description:
      "Aggressive recovery: clear every BLOCKED step's errorMessage, reschedule for now, and recover stuck CLAIMED/SENDING steps. Use when the queue is wedged.",
    inputSchema: { type: "object", properties: {} },
    handler: () => toolForceUnblock(),
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

// ---------- JSON-RPC dispatch ----------

async function handleRpc(rpc: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const respond = (result: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: rpc.id ?? null,
    result,
  });
  const error = (code: number, message: string, data?: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: rpc.id ?? null,
    error: { code, message, data },
  });

  switch (rpc.method) {
    case "initialize":
      return respond({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      // Notifications expect no response.
      return null;

    case "ping":
      return respond({});

    case "tools/list":
      return respond({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = asString((rpc.params as { name?: string })?.name);
      const args = ((rpc.params as { arguments?: Record<string, unknown> })?.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOL_MAP.get(name);
      if (!tool) return error(-32601, `Unknown tool: ${name}`);
      try {
        const result = await tool.handler(args);
        return respond({
          content: [
            { type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) },
          ],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Tool execution failed";
        return respond({
          isError: true,
          content: [{ type: "text", text: message }],
        });
      }
    }

    default:
      return error(-32601, `Method not found: ${rpc.method}`);
  }
}

// ---------- HTTP handlers ----------

export async function POST(request: Request) {
  const auth = requireMcpAuth(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((rpc) => handleRpc(rpc as JsonRpcRequest)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    return NextResponse.json(responses);
  }

  const response = await handleRpc(body as JsonRpcRequest);
  if (response === null) {
    return new Response(null, { status: 202 });
  }
  return NextResponse.json(response);
}

export async function GET(request: Request) {
  // Health-check / discovery endpoint. MCP itself uses POST.
  const auth = requireMcpAuth(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    protocol: "mcp",
    transport: "http",
    protocolVersion: PROTOCOL_VERSION,
    server: SERVER_INFO,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
