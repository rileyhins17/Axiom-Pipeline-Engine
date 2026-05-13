-- Simple key-value store for lightweight operational state (e.g. daily digest last-sent date).
CREATE TABLE IF NOT EXISTS "KvStore" (
  "key"       TEXT PRIMARY KEY,
  "value"     TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);
