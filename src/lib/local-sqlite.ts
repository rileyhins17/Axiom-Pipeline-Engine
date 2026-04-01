/**
 * Local SQLite adapter that implements the D1DatabaseLike interface.
 * Used when running outside Cloudflare (e.g. on a Raspberry Pi).
 *
 * Wraps `better-sqlite3` to match the D1 prepare/bind/all/first/run API
 * so the existing prisma.ts ORM layer works without changes.
 */
import type { D1DatabaseLike, D1PreparedStatementLike } from "@/lib/cloudflare";

let cachedDb: D1DatabaseLike | null = null;

function getLocalDatabasePath(): string {
  return process.env.DATABASE_PATH || "./data/omniscient.db";
}

function createBetterSqliteStatement(
  db: import("better-sqlite3").Database,
  query: string,
): D1PreparedStatementLike {
  let boundValues: unknown[] = [];

  const statement: D1PreparedStatementLike = {
    bind(...values: unknown[]) {
      boundValues = values;
      return statement;
    },

    async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
      const stmt = db.prepare(query);
      const results = (boundValues.length > 0 ? stmt.all(...boundValues) : stmt.all()) as T[];
      return { results };
    },

    async first<T = Record<string, unknown>>(_column?: string): Promise<T | null> {
      const stmt = db.prepare(query);
      const row = (boundValues.length > 0 ? stmt.get(...boundValues) : stmt.get()) as T | undefined;
      return row ?? null;
    },

    async run(): Promise<{
      meta?: {
        changes?: number;
        last_row_id?: number | string;
      };
    }> {
      const stmt = db.prepare(query);
      const info = boundValues.length > 0 ? stmt.run(...boundValues) : stmt.run();
      return {
        meta: {
          changes: info.changes,
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    },
  };

  return statement;
}

export function getLocalDatabase(): D1DatabaseLike {
  if (cachedDb) return cachedDb;

  // Dynamic require to avoid bundling better-sqlite3 when running on Cloudflare
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require("better-sqlite3");
  const dbPath = getLocalDatabasePath();
  const db = new BetterSqlite3(dbPath) as import("better-sqlite3").Database;

  // Enable WAL mode for better concurrent read/write performance
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  cachedDb = {
    prepare(query: string): D1PreparedStatementLike {
      return createBetterSqliteStatement(db, query);
    },
  };

  return cachedDb;
}
