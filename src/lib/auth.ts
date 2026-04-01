import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { writeAuditEvent } from "@/lib/audit";
import { getClientIp, getCloudflareBindings } from "@/lib/cloudflare";
import { getAllowedEmails, getServerEnv, getTrustedOrigins, isAdminEmail } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

function isAllowedEmail(email: string) {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

const globalForAuth = globalThis as typeof globalThis & {
  axiomAuth?: any;
};

export function getAuth() {
  if (globalForAuth.axiomAuth) {
    return globalForAuth.axiomAuth;
  }

  const env = getServerEnv();
  const bindings = getCloudflareBindings();

  // Determine database config — use CF D1 when available, local SQLite otherwise
  let databaseConfig: { database: unknown };
  if (bindings?.DB) {
    databaseConfig = { database: bindings.DB };
  } else {
    // For local/Pi deployment, use the local SQLite database via better-sqlite3
    // better-auth accepts a better-sqlite3 Database instance directly
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3");
    const dbPath = process.env.DATABASE_PATH || "./data/omniscient.db";
    const localDb = new BetterSqlite3(dbPath);
    localDb.pragma("journal_mode = WAL");
    databaseConfig = { database: localDb };
  }

  const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_BASE_URL,
    ...databaseConfig,
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 6,
      cookieCache: {
        enabled: true,
        maxAge: 300,
        refreshCache: false,
        strategy: "compact",
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const ipAddress = ctx.request ? getClientIp(ctx.request) : "unknown";

        if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
          await assertRateLimit({
            identifier: `${ipAddress}:${ctx.path}`,
            limit: env.RATE_LIMIT_MAX_AUTH,
            scope: "auth",
            windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
          });
        }

        if (ctx.path === "/sign-up/email") {
          const email = String(ctx.body?.email || "").trim().toLowerCase();
          if (!email || !isAllowedEmail(email)) {
            throw new APIError("FORBIDDEN", {
              message: "This email address is not authorized for Axiom ops access.",
            });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const ipAddress = ctx.request ? getClientIp(ctx.request) : "unknown";
        const session = ctx.context.newSession;

        if (ctx.path === "/sign-in/email" && session) {
          await writeAuditEvent({
            action: "auth.sign_in",
            actorUserId: session.user.id,
            ipAddress,
            metadata: { email: session.user.email },
          });
        }

        if (ctx.path === "/sign-up/email" && session) {
          const promotedToAdmin = isAdminEmail(session.user.email);

          if (promotedToAdmin) {
            await getPrisma().user.update({
              where: { id: session.user.id },
              data: { role: "admin" },
            });
          }

          await writeAuditEvent({
            action: "auth.sign_up",
            actorUserId: session.user.id,
            ipAddress,
            metadata: {
              email: session.user.email,
              promotedToAdmin,
            },
          });
        }

        if (ctx.path === "/sign-out") {
          await writeAuditEvent({
            action: "auth.sign_out",
            actorUserId: session?.user.id ?? null,
            ipAddress,
          });
        }
      }),
    },
    plugins: [
      nextCookies(),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],
  });

  globalForAuth.axiomAuth = auth;
  return auth;
}
