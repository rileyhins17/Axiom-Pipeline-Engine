import "server-only";

export interface D1PreparedStatementLike {
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<{
    meta?: {
      changes?: number;
      last_row_id?: number | string;
    };
  }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AppBindings {
  DB?: D1DatabaseLike;
  BROWSER?: unknown;
  [key: string]: unknown;
}

export function getCloudflareBindings(): AppBindings | null {
  try {
    // Dynamic import to avoid crash when @opennextjs/cloudflare is not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    return getCloudflareContext().env as AppBindings;
  } catch {
    return null;
  }
}

/**
 * Returns a D1DatabaseLike handle — from Cloudflare D1 when available,
 * or from local better-sqlite3 when running on bare Node (e.g. Raspberry Pi).
 */
export function getDatabase(): D1DatabaseLike {
  const bindings = getCloudflareBindings();

  if (bindings?.DB) {
    return bindings.DB;
  }

  // Fallback to local SQLite
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getLocalDatabase } = require("./local-sqlite");
  return getLocalDatabase() as D1DatabaseLike;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}
