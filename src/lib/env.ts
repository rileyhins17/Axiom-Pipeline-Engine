import { z } from "zod";

import { getCloudflareBindings } from "@/lib/cloudflare";

const envSchema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_ALLOWED_EMAILS: z.string().default(""),
  AUTH_ADMIN_EMAILS: z.string().default(""),
  AUTH_ALLOWED_ORIGINS: z.string().default(""),
  AGENT_SHARED_SECRET: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters long"),
  OPENROUTER_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  OUTREACH_DAILY_SEND_LIMIT: z.coerce.number().int().nonnegative().default(50),
  OUTREACH_SEND_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_MAX_EXPORT: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_MAX_SCRAPE: z.coerce.number().int().nonnegative().default(3),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  SCRAPE_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(1),
  SCRAPE_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().int().positive().default(60000),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getServerEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const bindings = getCloudflareBindings();
  cachedEnv = envSchema.parse({
    APP_BASE_URL: bindings?.APP_BASE_URL ?? process.env.APP_BASE_URL,
    AUTH_ALLOWED_EMAILS: bindings?.AUTH_ALLOWED_EMAILS ?? process.env.AUTH_ALLOWED_EMAILS,
    AUTH_ADMIN_EMAILS: bindings?.AUTH_ADMIN_EMAILS ?? process.env.AUTH_ADMIN_EMAILS,
    AUTH_ALLOWED_ORIGINS: bindings?.AUTH_ALLOWED_ORIGINS ?? process.env.AUTH_ALLOWED_ORIGINS,
    AGENT_SHARED_SECRET: bindings?.AGENT_SHARED_SECRET ?? process.env.AGENT_SHARED_SECRET,
    BETTER_AUTH_SECRET: bindings?.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
    OPENROUTER_API_KEY: bindings?.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY,
    GEMINI_API_KEY: bindings?.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY,
    GMAIL_CLIENT_ID: bindings?.GMAIL_CLIENT_ID ?? process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: bindings?.GMAIL_CLIENT_SECRET ?? process.env.GMAIL_CLIENT_SECRET,
    OUTREACH_DAILY_SEND_LIMIT: bindings?.OUTREACH_DAILY_SEND_LIMIT ?? process.env.OUTREACH_DAILY_SEND_LIMIT,
    OUTREACH_SEND_DELAY_MS: bindings?.OUTREACH_SEND_DELAY_MS ?? process.env.OUTREACH_SEND_DELAY_MS,
    RATE_LIMIT_MAX_AUTH: bindings?.RATE_LIMIT_MAX_AUTH ?? process.env.RATE_LIMIT_MAX_AUTH,
    RATE_LIMIT_MAX_EXPORT: bindings?.RATE_LIMIT_MAX_EXPORT ?? process.env.RATE_LIMIT_MAX_EXPORT,
    RATE_LIMIT_MAX_SCRAPE: bindings?.RATE_LIMIT_MAX_SCRAPE ?? process.env.RATE_LIMIT_MAX_SCRAPE,
    RATE_LIMIT_WINDOW_SECONDS: bindings?.RATE_LIMIT_WINDOW_SECONDS ?? process.env.RATE_LIMIT_WINDOW_SECONDS,
    SCRAPE_CONCURRENCY_LIMIT: bindings?.SCRAPE_CONCURRENCY_LIMIT ?? process.env.SCRAPE_CONCURRENCY_LIMIT,
    SCRAPE_TIMEOUT_MS: bindings?.SCRAPE_TIMEOUT_MS ?? process.env.SCRAPE_TIMEOUT_MS,
    WORKER_HEARTBEAT_STALE_MS: bindings?.WORKER_HEARTBEAT_STALE_MS ?? process.env.WORKER_HEARTBEAT_STALE_MS,
  });

  return cachedEnv;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function splitOrigins(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getAllowedEmails(): string[] {
  return splitCsv(getServerEnv().AUTH_ALLOWED_EMAILS);
}

export function getAdminEmails(): string[] {
  return splitCsv(getServerEnv().AUTH_ADMIN_EMAILS);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.trim().toLowerCase());
}

export function getTrustedOrigins(): string[] {
  const env = getServerEnv();
  const origins = new Set<string>();

  try {
    const appUrl = new URL(env.APP_BASE_URL);
    origins.add(appUrl.origin);

    for (const origin of splitOrigins(env.AUTH_ALLOWED_ORIGINS)) {
      try {
        origins.add(new URL(origin).origin);
      } catch {
        // Ignore malformed trusted origins and continue with the rest.
      }
    }

    const isLoopback = appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1";

    if (isLoopback) {
      const protocol = appUrl.protocol;
      const loopbackHosts = ["localhost", "127.0.0.1"];
      const loopbackPorts = new Set([
        appUrl.port || (protocol === "https:" ? "443" : "80"),
        "3000",
        "3001",
        "3002",
      ]);

      for (let port = 8787; port <= 8799; port++) {
        loopbackPorts.add(String(port));
      }

      for (const host of loopbackHosts) {
        for (const port of loopbackPorts) {
          origins.add(`${protocol}//${host}${port ? `:${port}` : ""}`);
        }
      }
    }
  } catch {
    // Ignore invalid URLs here; env parsing will already have failed elsewhere.
  }

  return Array.from(origins);
}
