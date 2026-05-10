import { SettingsClient } from "./SettingsClient";

import { getCloudflareBindings, getDatabase } from "@/lib/cloudflare";
import { getDeepSeekBalanceStatus } from "@/lib/deepseek";
import { getServerEnv } from "@/lib/env";
import { getAutomationSettings, syncMailboxesForGmailConnections } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { isSendableMailbox } from "@/lib/ui/data-accuracy";

export const dynamic = "force-dynamic";

/**
 * Direct OutreachMailbox query — independent of listAutomationOverview()
 * so a single heavy-helper failure doesn't blank the connect screen.
 * Used as a safety net alongside the sync helper.
 */
async function listConnectedMailboxes(): Promise<Array<{ gmailAddress: string; status: string | null; gmailConnectionId: string | null }>> {
  const result = await getDatabase()
    .prepare(
      `SELECT LOWER("gmailAddress") AS gmailAddress, "status", "gmailConnectionId"
       FROM "OutreachMailbox"
       ORDER BY "updatedAt" DESC`,
    )
    .all<{ gmailAddress: string; status: string | null; gmailConnectionId: string | null }>();
  return result.results ?? [];
}

async function getScrapeHealthSummary() {
  const result = await getDatabase()
    .prepare(
      `SELECT "id", "status", "niche", "city", "statsJson", "errorMessage", "createdAt", "updatedAt"
       FROM "ScrapeJob"
       ORDER BY datetime("createdAt") DESC
       LIMIT 20`,
    )
    .all<Record<string, unknown>>();

  const jobs = (result.results ?? []).map((row) => {
    let stats: Record<string, unknown> = {};
    try {
      stats = row.statsJson ? JSON.parse(String(row.statsJson)) as Record<string, unknown> : {};
    } catch {
      stats = {};
    }
    return {
      id: String(row.id || ""),
      status: String(row.status || ""),
      niche: String(row.niche || ""),
      city: String(row.city || ""),
      errorMessage: row.errorMessage ? String(row.errorMessage) : null,
      qualityStatus: String(stats.qualityStatus || ""),
      targetsFound: Number(stats.targetsFound || 0),
      targetsWithWebsite: Number(stats.targetsWithWebsite || 0),
      targetsWithCategory: Number(stats.targetsWithCategory || 0),
      withEmail: Number(stats.withEmail || 0),
      updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    };
  });

  const latest = jobs[0] ?? null;
  return {
    criticalRecent: jobs.filter((job) => job.qualityStatus === "critical" || /quality gate/i.test(job.errorMessage || "")).length,
    latest,
    warningRecent: jobs.filter((job) => job.qualityStatus === "warning").length,
  };
}

export default async function SettingsPage() {
  const session = await requireAdminSession();
  const env = getServerEnv();
  const bindings = getCloudflareBindings();
  const prisma = getPrisma();
  const automationSettings = await getAutomationSettings(prisma).catch(() => ({
    emergencyPaused: false,
    emergencyPausedAt: null,
    emergencyPausedBy: null,
    emergencyPauseReason: null,
    intakePaused: false,
    intakePausedAt: null,
    intakePausedBy: null,
  }));

  // Three independent sources, OR'd together — connection state is
  // critical and any one of them blanking shouldn't hide a real connection.
  const [connections, syncedMailboxes, directMailboxes, deepSeekBalance, scrapeHealth] = await Promise.all([
    prisma.gmailConnection
      .findMany({ select: { gmailAddress: true } })
      .catch(() => [] as Array<{ gmailAddress: string }>),
    syncMailboxesForGmailConnections().catch(
      () => [] as Array<{ gmailAddress: string; status: string }>,
    ),
    listConnectedMailboxes().catch(() => [] as Array<{ gmailAddress: string; status: string | null; gmailConnectionId: string | null }>),
    getDeepSeekBalanceStatus().catch((error) => ({
      available: false,
      balances: [],
      checkedAt: new Date().toISOString(),
      configured: Boolean(env.DEEPSEEK_API_KEY),
      error: error instanceof Error ? error.message : String(error),
    })),
    getScrapeHealthSummary().catch(() => ({
      criticalRecent: 0,
      latest: null,
      warningRecent: 0,
    })),
  ]);

  const connectedAddresses = new Set(
    connections.map((connection) => connection.gmailAddress.toLowerCase()),
  );

  const expected = ["aidan@getaxiom.ca", "riley@getaxiom.ca"] as const;
  const mailboxes = expected.map((email) => {
    const synced = syncedMailboxes.find(
      (m) => m.gmailAddress.toLowerCase() === email,
    );
    const direct = directMailboxes.find(
      (m) => (m.gmailAddress || "").toLowerCase() === email,
    );
    const found = synced ?? direct;
    return {
      email,
      connected: connectedAddresses.has(email) || Boolean(found && isSendableMailbox(found)),
      status: found?.status ?? null,
    };
  });

  return (
    <SettingsClient
      runtimeStatus={{
        currentUserEmail: session.user.email,
        appBaseUrl: env.APP_BASE_URL,
        browserRenderingConfigured: Boolean(bindings?.BROWSER),
        databaseTarget: bindings?.DB ? "cloudflare-d1" : "binding-missing",
        deepSeekBalance,
        deepSeekConfigured: Boolean(env.DEEPSEEK_API_KEY),
        globalDailySendCap: env.AUTONOMOUS_MAX_SENDS_PER_DAY,
        intakeDailyLeadCap: env.AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
        intakePaused: automationSettings.intakePaused,
        scrapeHealth,
        scrapeConcurrencyLimit: env.SCRAPE_CONCURRENCY_LIMIT,
        scrapeTimeoutMs: env.SCRAPE_TIMEOUT_MS,
        cloudScrapeEnabled: env.CLOUD_SCRAPE_ENABLED,
      }}
      mailboxes={mailboxes}
      emergencyControl={{
        emergencyPaused: automationSettings.emergencyPaused,
        emergencyPausedAt: automationSettings.emergencyPausedAt ? automationSettings.emergencyPausedAt.toISOString() : null,
        emergencyPausedBy: automationSettings.emergencyPausedBy,
        emergencyPauseReason: automationSettings.emergencyPauseReason,
      }}
    />
  );
}
