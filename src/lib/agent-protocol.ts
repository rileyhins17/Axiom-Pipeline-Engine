import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { ScrapeJobStatus, ScrapeLeadWriteInput } from "@/lib/scrape-jobs";

export const AGENT_AUTH_WINDOW_MS = 5 * 60 * 1000;

export const AGENT_HEADERS = {
  name: "x-agent-name",
  nonce: "x-agent-nonce",
  signature: "x-agent-signature",
  timestamp: "x-agent-timestamp",
} as const;

const agentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const jobIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

const jobStatusSchema = z.enum(["pending", "claimed", "running", "completed", "failed", "canceled"]);

const eventTypeSchema = z.enum(["log", "status", "progress", "done", "error", "result"]);

const leadSchema = z
  .object({
    address: z.string().optional().nullable(),
    axiomScore: z.number().finite(),
    axiomTier: z.string().min(1).max(16),
    axiomWebsiteAssessment: z.string().optional().nullable(),
    businessName: z.string().trim().min(1).max(256),
    callOpener: z.string().min(1).max(2000),
    category: z.string().trim().min(1).max(256).nullable().optional(),
    city: z.string().trim().min(1).max(128),
    contactName: z.string().optional().nullable(),
    dedupeKey: z.string().min(1).max(256),
    dedupeMatchedBy: z.string().min(1).max(128),
    disqualifiers: z.string().optional().nullable(),
    disqualifyReason: z.string().optional().nullable(),
    email: z.string().max(320),
    emailConfidence: z.number().finite(),
    emailFlags: z.string().max(512).optional().nullable(),
    emailType: z.string().min(1).max(64),
    followUpQuestion: z.string().min(1).max(2000),
    isArchived: z.boolean(),
    lastUpdated: z.union([z.string(), z.date()]),
    leadScore: z.number().finite(),
    niche: z.string().trim().min(1).max(128),
    painSignals: z.string().min(1),
    phone: z.string().max(64),
    phoneConfidence: z.number().finite(),
    phoneFlags: z.string().max(512).optional().nullable(),
    rating: z.number().finite(),
    reviewCount: z.number().finite(),
    scoreBreakdown: z.string().min(1),
    socialLink: z.string().max(2048).optional().nullable(),
    source: z.string().optional().nullable(),
    tacticalNote: z.string().min(1).max(4000),
    websiteGrade: z.string().optional().nullable(),
    websiteDomain: z.string().max(255).optional().nullable(),
    websiteUrl: z.string().max(2048).optional().nullable(),
    websiteStatus: z.string().trim().min(1).max(32),
  })
  .passthrough();

function formatZodIssues(issues: Array<{ message: string; path: ReadonlyArray<unknown> }>): string {
  if (issues.length === 0) {
    return "Invalid payload.";
  }

  return issues
    .map((issue) => {
      const path =
        issue.path.length > 0
          ? issue.path.map((part) => String(part)).join(".")
          : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

const statusPayloadSchema = z.object({
  jobId: jobIdSchema,
  jobStatus: jobStatusSchema,
  message: z.string().min(1).max(4000),
});

const progressPayloadSchema = z.object({
  jobId: jobIdSchema,
  jobStatus: jobStatusSchema.optional(),
  message: z.string().min(1).max(4000).optional(),
  progress: z.number().int().nonnegative().optional(),
  total: z.number().int().positive().optional(),
  stats: z
    .object({
      avgScore: z.number().finite().optional(),
      leadsFound: z.number().int().nonnegative().optional(),
      withEmail: z.number().int().nonnegative().optional(),
    })
    .passthrough()
    .optional(),
})
  .passthrough();

export function normalizeAgentName(value: unknown): string | null {
  const result = agentNameSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isValidJobId(value: unknown): value is string {
  return jobIdSchema.safeParse(value).success;
}

export function isValidJobStatus(value: unknown): value is ScrapeJobStatus {
  return jobStatusSchema.safeParse(value).success;
}

export function isValidAgentEventType(value: unknown): value is "log" | "status" | "progress" | "done" | "error" | "result" {
  return eventTypeSchema.safeParse(value).success;
}

export function validateAgentLeadPayload(value: unknown): { success: true; lead: ScrapeLeadWriteInput } | { success: false; error: string } {
  const result = leadSchema.safeParse(value);
  if (!result.success) {
    return { success: false, error: formatZodIssues(result.error.issues) };
  }

  return { success: true, lead: result.data as ScrapeLeadWriteInput };
}

export function validateAgentStatusPayload(value: unknown): { success: true; payload: z.infer<typeof statusPayloadSchema> } | { success: false; error: string } {
  const result = statusPayloadSchema.safeParse(value);
  if (!result.success) {
    return { success: false, error: formatZodIssues(result.error.issues) };
  }

  return { success: true, payload: result.data };
}

export function validateAgentProgressPayload(value: unknown): { success: true; payload: z.infer<typeof progressPayloadSchema> } | { success: false; error: string } {
  const result = progressPayloadSchema.safeParse(value);
  if (!result.success) {
    return { success: false, error: formatZodIssues(result.error.issues) };
  }

  return { success: true, payload: result.data };
}

export function buildSignedAgentHeaders(input: {
  agentName: string;
  bodyText: string;
  method: string;
  path: string;
  secret: string;
  nonce?: string;
  timestampMs?: number;
}): Record<string, string> {
  const timestamp = String(input.timestampMs ?? Date.now());
  const nonce = input.nonce ?? randomUUID();
  const signature = createHmac("sha256", input.secret)
    .update(`${timestamp}.${nonce}.${input.method.toUpperCase()}.${input.path}.${input.bodyText || ""}`)
    .digest("hex");

  return {
    [AGENT_HEADERS.name]: input.agentName,
    [AGENT_HEADERS.nonce]: nonce,
    [AGENT_HEADERS.signature]: signature,
    [AGENT_HEADERS.timestamp]: timestamp,
  };
}

export function verifySignedAgentRequest(input: {
  bodyText: string;
  method: string;
  nonce: string;
  path: string;
  secret: string;
  signature: string;
  timestamp: string;
}): boolean {
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${input.bodyText || ""}`)
    .digest();

  const provided = Buffer.from(input.signature, "hex");
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}
