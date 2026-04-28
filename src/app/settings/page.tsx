import { SettingsClient } from "./SettingsClient";

import { getCloudflareBindings } from "@/lib/cloudflare";
import { getServerEnv } from "@/lib/env";
import { syncMailboxesForGmailConnections } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAdminSession();
  const env = getServerEnv();
  const bindings = getCloudflareBindings();
  const prisma = getPrisma();
  const [connections, syncedMailboxes] = await Promise.all([
    prisma.gmailConnection.findMany({
      select: {
        gmailAddress: true,
      },
    }),
    syncMailboxesForGmailConnections().catch(() => [] as Array<{ gmailAddress: string; status: string }>),
  ]);

  const expected = ["aidan@getaxiom.ca", "riley@getaxiom.ca"] as const;
  const connectedAddresses = new Set(
    connections.map((connection) => connection.gmailAddress.toLowerCase()),
  );
  const mailboxes = expected.map((email) => {
    const found = syncedMailboxes.find((m) => m.gmailAddress.toLowerCase() === email);
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
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        scrapeConcurrencyLimit: env.SCRAPE_CONCURRENCY_LIMIT,
        scrapeTimeoutMs: env.SCRAPE_TIMEOUT_MS,
        cloudScrapeEnabled: env.CLOUD_SCRAPE_ENABLED,
      }}
      mailboxes={mailboxes}
    />
  );
}
