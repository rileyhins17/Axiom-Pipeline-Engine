-- Outreach automation: Gmail OAuth connections, email send log, and lead enrichment.

-- Gmail OAuth token storage (one connection per user)
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailAddress" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "scopes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");
CREATE INDEX "GmailConnection_gmailAddress_idx" ON "GmailConnection"("gmailAddress");

-- Outreach email send log
CREATE TABLE "OutreachEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyPlain" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "errorMessage" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutreachEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutreachEmail_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OutreachEmail_leadId_idx" ON "OutreachEmail"("leadId");
CREATE INDEX "OutreachEmail_senderUserId_sentAt_idx" ON "OutreachEmail"("senderUserId", "sentAt");
CREATE INDEX "OutreachEmail_recipientEmail_idx" ON "OutreachEmail"("recipientEmail");
CREATE INDEX "OutreachEmail_status_idx" ON "OutreachEmail"("status");

-- Lead enrichment columns
ALTER TABLE "Lead" ADD COLUMN "enrichedAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "enrichmentData" TEXT;

CREATE INDEX "Lead_enrichedAt_idx" ON "Lead"("enrichedAt");
