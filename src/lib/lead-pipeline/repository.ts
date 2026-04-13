import { getDatabase } from "@/lib/cloudflare";
import {
  leadAssessmentSchema,
  leadFactsSchema,
  PIPELINE_FACTS_VERSION,
  pipelineArtifactsSchema,
  sendDecisionSchema,
  websiteInspectionResultSchema,
  type EmailDraft,
  type LeadAssessment,
  type LeadFacts,
  type PipelineArtifacts,
  type SendDecision,
  type WebsiteInspectionResult,
} from "@/lib/lead-pipeline/schema";
import { emailDraftSchema } from "@/lib/lead-pipeline/schema";

type RawRow = Record<string, unknown>;

type PersistArtifactsInput = {
  leadId: number;
  artifacts: PipelineArtifacts;
};

type LatestAssessmentRecord = {
  id: string;
  createdAt: Date;
  promptVersion: string;
  model: string;
  assessment: LeadAssessment;
};

type LatestFactsRecord = {
  id: string;
  updatedAt: Date;
  facts: LeadFacts;
};

type LatestDraftRecord = {
  id: string;
  createdAt: Date;
  promptVersion: string;
  model: string;
  draft: EmailDraft;
  bodyPlain: string;
  bodyHtml: string;
  subject: string;
};

type LatestDecisionRecord = {
  id: string;
  createdAt: Date;
  decision: SendDecision;
};

function db() {
  return getDatabase();
}

function normalizeValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value ?? null;
}

function parseDate(value: unknown) {
  if (!value) return new Date(0);
  return value instanceof Date ? value : new Date(String(value));
}

async function run(query: string, params: unknown[] = []) {
  return db()
    .prepare(query)
    .bind(...params.map(normalizeValue))
    .run();
}

async function first<T = RawRow>(query: string, params: unknown[] = []) {
  return db()
    .prepare(query)
    .bind(...params.map(normalizeValue))
    .first<T>();
}

async function all<T = RawRow>(query: string, params: unknown[] = []) {
  const result = await db()
    .prepare(query)
    .bind(...params.map(normalizeValue))
    .all<T>();
  return result.results ?? [];
}

function createId() {
  return crypto.randomUUID();
}

function stringify(value: unknown) {
  return JSON.stringify(value);
}

function parseJson<T>(value: unknown, schema: { parse: (input: unknown) => T }): T {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return schema.parse(parsed);
}

export async function persistPipelineArtifacts(input: PersistArtifactsInput) {
  const validated = pipelineArtifactsSchema.parse(input.artifacts);
  const sourceRecordId = createId();
  const discoveredAt = new Date(validated.sourceRecord.discoveredAt);

  await run(
    `INSERT INTO "LeadSourceRecord" (
      "id", "leadId", "source", "sourceKey", "placeId", "discoveryQuery", "dedupeKey",
      "rawPayload", "normalizedPayload", "discoveredAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceRecordId,
      input.leadId,
      validated.sourceRecord.source,
      validated.sourceRecord.sourceKey ?? null,
      validated.sourceRecord.placeId,
      validated.sourceRecord.discoveryQuery,
      validated.sourceRecord.placeId,
      stringify(validated.sourceRecord.rawPayload),
      stringify(validated.sourceRecord),
      discoveredAt,
    ],
  );

  let websiteInspectionId: string | null = null;
  if (validated.websiteInspection) {
    websiteInspectionId = createId();
    await run(
      `INSERT INTO "WebsiteInspection" (
        "id", "leadId", "sourceRecordId", "inspectionMode", "inspectionStatus", "websiteUrl", "finalUrl",
        "responseStatus", "sslStatus", "homepageReachable", "renderStrategy", "rawPayload", "extractedText",
        "evidenceJson", "errorMessage", "inspectedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        websiteInspectionId,
        input.leadId,
        sourceRecordId,
        validated.websiteInspection.renderStrategy,
        validated.websiteInspection.homepageReachable ? "completed" : "unreachable",
        validated.sourceRecord.website,
        validated.websiteInspection.finalUrl,
        validated.websiteInspection.responseStatus,
        validated.websiteInspection.sslStatus,
        validated.websiteInspection.homepageReachable,
        validated.websiteInspection.renderStrategy,
        stringify(validated.websiteInspection.rawPayload),
        validated.websiteInspection.extractedText,
        stringify(validated.websiteInspection.evidence),
        validated.websiteInspection.errorMessage ?? null,
        new Date(validated.sourceRecord.discoveredAt),
      ],
    );
  }

  const factsId = createId();
  await run(
    `INSERT INTO "LeadFacts" (
      "id", "leadId", "sourceRecordId", "websiteInspectionId", "factsJson",
      "extractionConfidence", "evidenceJson", "factsVersion", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      factsId,
      input.leadId,
      sourceRecordId,
      websiteInspectionId,
      stringify(validated.facts),
      validated.facts.extractionConfidence,
      stringify(validated.facts.evidence),
      PIPELINE_FACTS_VERSION,
      new Date(),
    ],
  );

  const assessmentId = createId();
  await run(
    `INSERT INTO "LeadAssessment" (
      "id", "leadId", "leadFactsId", "model", "promptVersion", "status",
      "assessmentJson", "fitScore", "fitTier", "assessmentConfidence", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assessmentId,
      input.leadId,
      factsId,
      validated.assessmentMeta.model,
      validated.assessmentMeta.promptVersion,
      "completed",
      stringify(validated.assessment),
      validated.assessment.fitScore,
      validated.assessment.fitTier,
      validated.assessment.assessmentConfidence,
      new Date(),
    ],
  );

  return {
    sourceRecordId,
    websiteInspectionId,
    factsId,
    assessmentId,
  };
}

export async function getLatestLeadFacts(leadId: number): Promise<LatestFactsRecord | null> {
  const row = await first<RawRow>(
    `SELECT "id", "factsJson", "updatedAt"
     FROM "LeadFacts"
     WHERE "leadId" = ?
     ORDER BY "updatedAt" DESC
     LIMIT 1`,
    [leadId],
  );

  if (!row) return null;
  return {
    id: String(row.id || ""),
    updatedAt: parseDate(row.updatedAt),
    facts: parseJson(row.factsJson, leadFactsSchema),
  };
}

export async function getLatestLeadAssessment(leadId: number): Promise<LatestAssessmentRecord | null> {
  const row = await first<RawRow>(
    `SELECT "id", "assessmentJson", "createdAt", "promptVersion", "model"
     FROM "LeadAssessment"
     WHERE "leadId" = ?
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [leadId],
  );

  if (!row) return null;
  return {
    id: String(row.id || ""),
    createdAt: parseDate(row.createdAt),
    promptVersion: String(row.promptVersion || ""),
    model: String(row.model || ""),
    assessment: parseJson(row.assessmentJson, leadAssessmentSchema),
  };
}

export async function createLeadAssessmentRecord(input: {
  leadId: number;
  leadFactsId: string;
  assessment: LeadAssessment;
  model: string;
  promptVersion: string;
}) {
  const validated = leadAssessmentSchema.parse(input.assessment);
  const id = createId();
  await run(
    `INSERT INTO "LeadAssessment" (
      "id", "leadId", "leadFactsId", "model", "promptVersion", "status",
      "assessmentJson", "fitScore", "fitTier", "assessmentConfidence", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.leadId,
      input.leadFactsId,
      input.model,
      input.promptVersion,
      "completed",
      stringify(validated),
      validated.fitScore,
      validated.fitTier,
      validated.assessmentConfidence,
      new Date(),
    ],
  );
  return id;
}

export async function createLeadFactsRecord(input: {
  leadId: number;
  facts: LeadFacts;
  sourceRecordId?: string | null;
  websiteInspectionId?: string | null;
}) {
  const validated = leadFactsSchema.parse(input.facts);
  const id = createId();
  await run(
    `INSERT INTO "LeadFacts" (
      "id", "leadId", "sourceRecordId", "websiteInspectionId", "factsJson",
      "extractionConfidence", "evidenceJson", "factsVersion", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.leadId,
      input.sourceRecordId ?? null,
      input.websiteInspectionId ?? null,
      stringify(validated),
      validated.extractionConfidence,
      stringify(validated.evidence),
      PIPELINE_FACTS_VERSION,
      new Date(),
    ],
  );
  return id;
}

export async function createLeadDraftRecord(input: {
  leadId: number;
  leadFactsId: string;
  leadAssessmentId: string;
  draft: EmailDraft;
  model: string;
  promptVersion: string;
  bodyPlain: string;
  bodyHtml: string;
  subject: string;
  personalizationEvidence: string[];
}) {
  const validated = emailDraftSchema.parse(input.draft);
  const id = createId();
  await run(
    `INSERT INTO "LeadEmailDraft" (
      "id", "leadId", "leadFactsId", "leadAssessmentId", "model", "promptVersion",
      "draftJson", "subject", "bodyPlain", "bodyHtml", "personalizationEvidenceJson", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.leadId,
      input.leadFactsId,
      input.leadAssessmentId,
      input.model,
      input.promptVersion,
      stringify(validated),
      input.subject,
      input.bodyPlain,
      input.bodyHtml,
      stringify(input.personalizationEvidence),
      new Date(),
    ],
  );
  return id;
}

export async function getLatestLeadDraft(leadId: number): Promise<LatestDraftRecord | null> {
  const row = await first<RawRow>(
    `SELECT "id", "draftJson", "subject", "bodyPlain", "bodyHtml", "createdAt", "promptVersion", "model"
     FROM "LeadEmailDraft"
     WHERE "leadId" = ?
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [leadId],
  );

  if (!row) return null;
  return {
    id: String(row.id || ""),
    createdAt: parseDate(row.createdAt),
    promptVersion: String(row.promptVersion || ""),
    model: String(row.model || ""),
    draft: parseJson(row.draftJson, emailDraftSchema),
    subject: String(row.subject || ""),
    bodyPlain: String(row.bodyPlain || ""),
    bodyHtml: String(row.bodyHtml || ""),
  };
}

export async function createSendDecisionRecord(input: {
  leadId: number;
  leadFactsId: string;
  leadAssessmentId: string | null;
  leadEmailDraftId: string | null;
  decision: SendDecision;
}) {
  const validated = sendDecisionSchema.parse(input.decision);
  const id = createId();
  await run(
    `INSERT INTO "LeadSendDecision" (
      "id", "leadId", "leadFactsId", "leadAssessmentId", "leadEmailDraftId",
      "decision", "reasonsJson", "checksJson", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.leadId,
      input.leadFactsId,
      input.leadAssessmentId,
      input.leadEmailDraftId,
      validated.decision,
      stringify(validated.reasons),
      stringify(validated.checks),
      new Date(),
    ],
  );
  return id;
}

export async function getLatestSendDecision(leadId: number): Promise<LatestDecisionRecord | null> {
  const row = await first<RawRow>(
    `SELECT "id", "decision", "reasonsJson", "checksJson", "createdAt"
     FROM "LeadSendDecision"
     WHERE "leadId" = ?
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [leadId],
  );

  if (!row) return null;
  return {
    id: String(row.id || ""),
    createdAt: parseDate(row.createdAt),
    decision: sendDecisionSchema.parse({
      decision: row.decision,
      reasons: parseJson(row.reasonsJson, { parse: (input) => input as string[] }),
      checks: parseJson(row.checksJson, { parse: (input) => input as SendDecision["checks"] }),
    }),
  };
}

export async function createReplyOutcomeRecord(input: {
  leadId: number;
  sequenceId?: string | null;
  mailboxId?: string | null;
  outcomeType: string;
  sentiment?: string | null;
  rawPayload: Record<string, unknown>;
}) {
  await run(
    `INSERT INTO "LeadReplyOutcome" (
      "id", "leadId", "sequenceId", "mailboxId", "outcomeType", "sentiment", "rawPayload", "createdAt"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId(),
      input.leadId,
      input.sequenceId ?? null,
      input.mailboxId ?? null,
      input.outcomeType,
      input.sentiment ?? null,
      stringify(input.rawPayload),
      new Date(),
    ],
  );
}

export async function countPipelineArtifacts() {
  const [source, inspected, normalized, assessed, drafted, decided, replies] = await Promise.all([
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadSourceRecord"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "WebsiteInspection"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadFacts"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadAssessment"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadEmailDraft"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadSendDecision"`),
    first<{ count: number }>(`SELECT COUNT(*) as count FROM "LeadReplyOutcome"`),
  ]);

  return {
    source: Number(source?.count || 0),
    inspected: Number(inspected?.count || 0),
    normalized: Number(normalized?.count || 0),
    assessed: Number(assessed?.count || 0),
    drafted: Number(drafted?.count || 0),
    decided: Number(decided?.count || 0),
    replies: Number(replies?.count || 0),
  };
}

export async function getTopAssessmentDimensions() {
  const rows = await all<RawRow>(
    `SELECT "assessmentJson" FROM "LeadAssessment" ORDER BY "createdAt" DESC LIMIT 200`,
  );

  const counts = {
    fitTier: new Map<string, number>(),
    outreachAngle: new Map<string, number>(),
    painSignal: new Map<string, number>(),
  };

  for (const row of rows) {
    const assessment = parseJson(row.assessmentJson, leadAssessmentSchema);
    counts.fitTier.set(assessment.fitTier, (counts.fitTier.get(assessment.fitTier) || 0) + 1);
    counts.outreachAngle.set(assessment.outreachAngle, (counts.outreachAngle.get(assessment.outreachAngle) || 0) + 1);
    for (const pain of assessment.painSignals) {
      counts.painSignal.set(pain.type, (counts.painSignal.get(pain.type) || 0) + 1);
    }
  }

  const toArray = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);

  return {
    fitTier: toArray(counts.fitTier),
    outreachAngle: toArray(counts.outreachAngle),
    painSignal: toArray(counts.painSignal),
  };
}

export async function getLatestWebsiteInspection(leadId: number): Promise<{ id: string; inspection: WebsiteInspectionResult } | null> {
  const row = await first<RawRow>(
    `SELECT "id", "rawPayload", "websiteUrl", "finalUrl", "responseStatus", "sslStatus",
            "homepageReachable", "renderStrategy", "extractedText", "evidenceJson", "errorMessage"
     FROM "WebsiteInspection"
     WHERE "leadId" = ?
     ORDER BY "inspectedAt" DESC
     LIMIT 1`,
    [leadId],
  );

  if (!row) return null;
  const rawPayload = typeof row.rawPayload === "string" ? JSON.parse(row.rawPayload) : {};
  const evidence = typeof row.evidenceJson === "string" ? JSON.parse(row.evidenceJson) : [];
  return {
    id: String(row.id || ""),
    inspection: websiteInspectionResultSchema.parse({
      ...(rawPayload as Record<string, unknown>),
      responseStatus: row.responseStatus === null || row.responseStatus === undefined ? null : Number(row.responseStatus),
      sslStatus: row.sslStatus || "unknown",
      homepageReachable: Boolean(row.homepageReachable),
      renderStrategy: row.renderStrategy || "fetch",
      finalUrl: row.finalUrl ?? null,
      extractedText: row.extractedText ?? null,
      evidence,
      errorMessage: row.errorMessage ?? null,
      websiteExists: (rawPayload as Record<string, unknown>).websiteExists ?? Boolean(row.websiteUrl),
    }),
  };
}
