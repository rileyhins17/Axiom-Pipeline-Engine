-- Deterministic lead pipeline artifacts and observability tables.

CREATE TABLE IF NOT EXISTS "LeadSourceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT,
    "placeId" TEXT,
    "discoveryQuery" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "normalizedPayload" TEXT NOT NULL,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadSourceRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadSourceRecord_leadId_idx" ON "LeadSourceRecord"("leadId");
CREATE INDEX IF NOT EXISTS "LeadSourceRecord_placeId_idx" ON "LeadSourceRecord"("placeId");
CREATE INDEX IF NOT EXISTS "LeadSourceRecord_dedupeKey_idx" ON "LeadSourceRecord"("dedupeKey");
CREATE INDEX IF NOT EXISTS "LeadSourceRecord_discoveredAt_idx" ON "LeadSourceRecord"("discoveredAt");

CREATE TABLE IF NOT EXISTS "WebsiteInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "sourceRecordId" TEXT,
    "inspectionMode" TEXT NOT NULL,
    "inspectionStatus" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "finalUrl" TEXT,
    "responseStatus" INTEGER,
    "sslStatus" TEXT,
    "homepageReachable" BOOLEAN NOT NULL DEFAULT false,
    "renderStrategy" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "extractedText" TEXT,
    "evidenceJson" TEXT NOT NULL,
    "errorMessage" TEXT,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteInspection_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebsiteInspection_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LeadSourceRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WebsiteInspection_leadId_idx" ON "WebsiteInspection"("leadId");
CREATE INDEX IF NOT EXISTS "WebsiteInspection_sourceRecordId_idx" ON "WebsiteInspection"("sourceRecordId");
CREATE INDEX IF NOT EXISTS "WebsiteInspection_inspectedAt_idx" ON "WebsiteInspection"("inspectedAt");

CREATE TABLE IF NOT EXISTS "LeadFacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "sourceRecordId" TEXT,
    "websiteInspectionId" TEXT,
    "factsJson" TEXT NOT NULL,
    "extractionConfidence" REAL NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "factsVersion" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadFacts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadFacts_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LeadSourceRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeadFacts_websiteInspectionId_fkey" FOREIGN KEY ("websiteInspectionId") REFERENCES "WebsiteInspection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadFacts_leadId_key" ON "LeadFacts"("leadId");
CREATE INDEX IF NOT EXISTS "LeadFacts_updatedAt_idx" ON "LeadFacts"("updatedAt");

CREATE TABLE IF NOT EXISTS "LeadAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "leadFactsId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assessmentJson" TEXT NOT NULL,
    "fitScore" INTEGER,
    "fitTier" TEXT,
    "assessmentConfidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadAssessment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadAssessment_leadFactsId_fkey" FOREIGN KEY ("leadFactsId") REFERENCES "LeadFacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadAssessment_leadId_createdAt_idx" ON "LeadAssessment"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadAssessment_fitTier_idx" ON "LeadAssessment"("fitTier");

CREATE TABLE IF NOT EXISTS "LeadEmailDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "leadFactsId" TEXT NOT NULL,
    "leadAssessmentId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "draftJson" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyPlain" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "personalizationEvidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadEmailDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadEmailDraft_leadFactsId_fkey" FOREIGN KEY ("leadFactsId") REFERENCES "LeadFacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadEmailDraft_leadAssessmentId_fkey" FOREIGN KEY ("leadAssessmentId") REFERENCES "LeadAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadEmailDraft_leadId_createdAt_idx" ON "LeadEmailDraft"("leadId", "createdAt");

CREATE TABLE IF NOT EXISTS "LeadSendDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "leadFactsId" TEXT NOT NULL,
    "leadAssessmentId" TEXT,
    "leadEmailDraftId" TEXT,
    "decision" TEXT NOT NULL,
    "reasonsJson" TEXT NOT NULL,
    "checksJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadSendDecision_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadSendDecision_leadFactsId_fkey" FOREIGN KEY ("leadFactsId") REFERENCES "LeadFacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadSendDecision_leadAssessmentId_fkey" FOREIGN KEY ("leadAssessmentId") REFERENCES "LeadAssessment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeadSendDecision_leadEmailDraftId_fkey" FOREIGN KEY ("leadEmailDraftId") REFERENCES "LeadEmailDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadSendDecision_leadId_createdAt_idx" ON "LeadSendDecision"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadSendDecision_decision_idx" ON "LeadSendDecision"("decision");

CREATE TABLE IF NOT EXISTS "LeadReplyOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" INTEGER NOT NULL,
    "sequenceId" TEXT,
    "mailboxId" TEXT,
    "outcomeType" TEXT NOT NULL,
    "sentiment" TEXT,
    "rawPayload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadReplyOutcome_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadReplyOutcome_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeadReplyOutcome_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "OutreachMailbox" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadReplyOutcome_leadId_createdAt_idx" ON "LeadReplyOutcome"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadReplyOutcome_outcomeType_idx" ON "LeadReplyOutcome"("outcomeType");
