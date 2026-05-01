import { SettingsClient } from "./SettingsClient";

import { getCloudflareBindings, getDatabase } from "@/lib/cloudflare";
import { getServerEnv } from "@/lib/env";
import { getAutomationSettings, syncMailboxesForGmailConnections } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Direct OutreachMailbox query — independent of listAutomationOverview()
 * so a single heavy-helper failure doesn't blank the connect screen.
 * Used as a safety net alongside the sync helper.
 */
async function listConnectedMailboxes(): Promise<Array<{ gmailAddress: string; status: string }>> {
  const result = await getDatabase()
    .prepare(
      `SELECT LOWER("gmailAddress") AS gmailAddress, "status"
       FROM "OutreachMailbox"
       ORDER BY "updatedAt" DESC`,
    )
    .all<{ gmailAddress: string; status: string }>();
  return result.results ?? [];
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
  }));

  // Three independent sources, OR'd together — connection state is
  // critical and any one of them blanking shouldn't hide a real connection.
  const [connections, syncedMailboxes, directMailboxes] = await Promise.all([
    prisma.gmailConnection
      .findMany({ select: { gmailAddress: true } })
      .catch(() => [] as Array<{ gmailAddress: string }>),
    syncMailboxesForGmailConnections().catch(
      () => [] as Array<{ gmailAddress: string; status: string }>,
    ),
    listConnectedMailboxes().catch(() => []),
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
      connected: connectedAddresses.has(email) || Boolean(found),
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
        deepSeekConfigured: Boolean(env.DEEPSEEK_API_KEY),
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
