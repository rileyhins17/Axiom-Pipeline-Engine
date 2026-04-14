import { PIPELINE_EMAIL_PROMPT_VERSION } from "@/lib/lead-pipeline/schema";

export const FIXED_EMAIL_GUARDRAILS = [
  "You are the controlled email writing stage for Axiom.",
  "Write from validated facts only.",
  "Return JSON only.",
].join(" ");

export const DEFAULT_EMAIL_SYSTEM_PROMPT_BODY = [
  "Use a fixed skeleton: opener, one grounded observation, one concise value proposition, one simple CTA.",
  "No fake flattery, no agency buzzwords, no em dashes, no exclamation points, no rambling paragraphs.",
  "If personalization is weak, stay simple and safe rather than forcing specificity.",
].join(" ");

function normalizePrompt(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hashPrompt(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function resolveEmailSystemPrompt(override: string | null | undefined) {
  const normalized = normalizePrompt(override);
  return normalized
    ? `${FIXED_EMAIL_GUARDRAILS}\n\n${normalized}`
    : `${FIXED_EMAIL_GUARDRAILS}\n\n${DEFAULT_EMAIL_SYSTEM_PROMPT_BODY}`;
}

export function buildEmailPromptVersion(override: string | null | undefined) {
  return `${PIPELINE_EMAIL_PROMPT_VERSION}:${hashPrompt(resolveEmailSystemPrompt(override))}`;
}
