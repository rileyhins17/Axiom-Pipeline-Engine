-- Durable CRM activity history for client and opportunity records.
-- Lead remains the core CRM record in v1; activities provide the relationship
-- timeline around outreach replies, stage changes, notes, calls, meetings, and
-- lifecycle events.

CREATE TABLE IF NOT EXISTS "CrmActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" INTEGER NOT NULL,
  "actorUserId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CrmActivity_leadId_createdAt_idx" ON "CrmActivity"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "CrmActivity_type_createdAt_idx" ON "CrmActivity"("type", "createdAt");
