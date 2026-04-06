import { SettingsClient } from "./SettingsClient";

import { getCloudflareBindings } from "@/lib/cloudflare";
import { getAdminEmails, getAllowedEmails, getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireAdminSession();

  const env = getServerEnv();
  const bindings = getCloudflareBindings();
  const prisma = getPrisma();
  const leadCount = await prisma.lead.count();

  return (
    <SettingsClient
      runtimeStatus={{
        currentUserEmail: session.user.email,
        appBaseUrl: env.APP_BASE_URL,
        authAllowedCount: getAllowedEmails().length,
        adminEmailCount: getAdminEmails().length,
        leadCount,
        browserRenderingConfigured: Boolean(bindings?.BROWSER),
        databaseTarget: bindings?.DB ? "cloudflare-d1" : "binding-missing",
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        rateLimitMaxAuth: env.RATE_LIMIT_MAX_AUTH,
        rateLimitMaxExport: env.RATE_LIMIT_MAX_EXPORT,
        rateLimitMaxScrape: env.RATE_LIMIT_MAX_SCRAPE,
        rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
        scrapeConcurrencyLimit: env.SCRAPE_CONCURRENCY_LIMIT,
        scrapeTimeoutMs: env.SCRAPE_TIMEOUT_MS,
      }}
    />
  );
}
