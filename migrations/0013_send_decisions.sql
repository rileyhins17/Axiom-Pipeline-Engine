-- Audit trail for every send decision the autonomous engine makes.
-- One row per attempt, including SKIPPED / BLOCKED outcomes — not just SENT.
-- Lets us answer "why did the machine email this person?" or "why didn't it?"

CREATE TABLE "SendDecision" (
  "id"             TEXT PRIMARY KEY,
  "leadId"         INTEGER,
  "sequenceId"     TEXT,
  "stepId"         TEXT,
  "mailboxId"      TEXT,
  "senderEmail"    TEXT,
  "recipientEmail" TEXT,
  "decision"       TEXT NOT NULL,         -- SENT | BLOCKED | SKIPPED | DRY_RUN
  "reason"         TEXT,                  -- e.g., 'domain_cooldown_active', 'below_send_min_score'
  "axiomScore"     INTEGER,
  "axiomTier"      TEXT,
  "emailType"      TEXT,
  "subject"        TEXT,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_SendDecision_createdAt" ON "SendDecision" ("createdAt");
CREATE INDEX "idx_SendDecision_decision_createdAt" ON "SendDecision" ("decision", "createdAt");
CREATE INDEX "idx_SendDecision_leadId" ON "SendDecision" ("leadId");
