/**
 * Outreach Enrichment Module
 *
 * Uses DeepSeek to deeply re-analyze selected leads, producing
 * actionable intelligence for personalized email outreach.
 */

import { chatCompletionJson } from "@/lib/deepseek";
import type { LeadRecord } from "@/lib/prisma";

export type EnrichmentResult = {
  valueProposition: string;
  pitchAngle: string;
  anticipatedObjections: string[];
  emailTone: "casual" | "professional" | "urgent";
  keyPainPoint: string;
  competitiveEdge: string;
  personalizedHook: string;
  recommendedCTA: string;
  enrichmentSummary: string;
};

function shortLeadName(lead: LeadRecord) {
  return lead.businessName.trim() || "this business";
}

const ENRICHMENT_BANNED_PHRASES = [
  "stellar reputation",
  "glowing reviews",
  "award-winning",
  "award winning",
  "high-converting",
  "high converting",
  "modernize",
  "boost revenue",
  "grow your brand",
  "online presence",
  "digital transformation",
  "best-in-class",
  "best in class",
  "stand out online",
  "unlock growth",
];

function clampText(value: string | null | undefined, maxLength: number, fallback: string) {
  const cleaned = (value || "")
    .replace(/[—–]/g, ",")
    .replace(/!/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength).trim();
}

function sanitizeEnrichmentText(value: string | null | undefined, fallback: string, maxLength: number) {
  let cleaned = clampText(value, maxLength, fallback);
  for (const phrase of ENRICHMENT_BANNED_PHRASES) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
  return cleaned || fallback;
}

function sanitizeAnticipatedObjections(value: string[] | null | undefined) {
  const objections = Array.isArray(value) ? value : [];
  const sanitized = objections
    .map((item) => sanitizeEnrichmentText(item, "", 120))
    .filter(Boolean)
    .slice(0, 3);

  if (sanitized.length > 0) {
    return sanitized;
  }

  return [
    "Most work still comes from referrals.",
    "The current site may feel good enough for now.",
  ];
}

function normalizeEnrichmentResult(result: EnrichmentResult): EnrichmentResult {
  return {
    valueProposition: sanitizeEnrichmentText(
      result.valueProposition,
      "Axiom can likely help make the website clearer, more trustworthy, and easier to act on.",
      220,
    ),
    pitchAngle: sanitizeEnrichmentText(
      result.pitchAngle,
      "The site may be creating more friction than it should for someone deciding whether to reach out.",
      160,
    ),
    anticipatedObjections: sanitizeAnticipatedObjections(result.anticipatedObjections),
    emailTone:
      result.emailTone === "casual" || result.emailTone === "urgent" || result.emailTone === "professional"
        ? result.emailTone
        : "professional",
    keyPainPoint: sanitizeEnrichmentText(
      result.keyPainPoint,
      "The website may not be making the next step clear enough.",
      160,
    ),
    competitiveEdge: sanitizeEnrichmentText(
      result.competitiveEdge,
      "Competitors may be making trust, clarity, or contact easier to understand online.",
      180,
    ),
    personalizedHook: sanitizeEnrichmentText(
      result.personalizedHook,
      "I had one quick thought while looking through the business online.",
      180,
    ),
    recommendedCTA: sanitizeEnrichmentText(
      result.recommendedCTA,
      "Would it be helpful if I sent over 2 or 3 ideas?",
      120,
    ),
    enrichmentSummary: sanitizeEnrichmentText(
      result.enrichmentSummary,
      "This looks like a lead where the site may not fully support the trust and clarity the business already needs.",
      220,
    ),
  };
}

function parseStoredEnrichment(value: string | null | undefined): EnrichmentResult | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as EnrichmentResult;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeEnrichmentResult(parsed);
  } catch {
    return null;
  }
}

export function buildFallbackEnrichment(lead: LeadRecord): EnrichmentResult {
  const businessName = shortLeadName(lead);
  const websiteStatus = String(lead.websiteStatus || "").toUpperCase();
  const hasWebsite = websiteStatus !== "MISSING";
  const websiteLine = hasWebsite
    ? "The current site looks like it may still be leaving some easy contact opportunities on the table."
    : "The business looks like it may be relying on directories or social profiles instead of a proper site.";

  return {
    valueProposition: `Axiom can help ${businessName} make the next step clearer for people who are already looking.`,
    pitchAngle: websiteLine,
    anticipatedObjections: [
      "Most work still comes from referrals.",
      "The current setup may be good enough for now.",
    ],
    emailTone: "professional",
    keyPainPoint: hasWebsite
      ? "The contact path may not be obvious enough."
      : "There may not be a clear website path for new enquiries.",
    competitiveEdge: "Nearby competitors may be making it easier to contact them quickly.",
    personalizedHook: `I had a quick look at ${businessName} and noticed one thing that stood out.`,
    recommendedCTA: "Would it help if I sent over a couple of ideas?",
    enrichmentSummary: hasWebsite
      ? "This lead is a reasonable fit for a short, low-friction outreach note."
      : "This lead is a reasonable fit for a short outreach note because the web presence looks light.",
  };
}

export function resolveLeadEnrichment(lead: LeadRecord): EnrichmentResult {
  return parseStoredEnrichment(lead.enrichmentData) || buildFallbackEnrichment(lead);
}

function buildLeadContext(lead: LeadRecord): string {
  const lines: string[] = [];

  lines.push(`Business Name: ${lead.businessName}`);
  lines.push(`Niche/Industry: ${lead.niche}`);
  if (lead.category) lines.push(`Category: ${lead.category}`);
  lines.push(`City: ${lead.city}`);
  if (lead.address) lines.push(`Address: ${lead.address}`);

  lines.push(`Website Status: ${lead.websiteStatus || "UNKNOWN"}`);
  if (lead.websiteUrl) lines.push(`Website URL: ${lead.websiteUrl}`);
  if (lead.websiteGrade) lines.push(`Website Grade: ${lead.websiteGrade}`);

  if (lead.rating != null) lines.push(`Google Rating: ${lead.rating}/5`);
  if (lead.reviewCount != null) lines.push(`Review Count: ${lead.reviewCount}`);

  if (lead.contactName) lines.push(`Contact Name: ${lead.contactName}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);
  if (lead.emailType) lines.push(`Email Type: ${lead.emailType}`);
  if (lead.emailConfidence != null) lines.push(`Email Confidence: ${(lead.emailConfidence * 100).toFixed(0)}%`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);

  if (lead.axiomScore != null) lines.push(`Axiom Score: ${lead.axiomScore}/100`);
  if (lead.axiomTier) lines.push(`Axiom Tier: ${lead.axiomTier}`);

  if (lead.scoreBreakdown) {
    try {
      const breakdown = JSON.parse(lead.scoreBreakdown);
      lines.push(`Score Breakdown: BV=${breakdown.businessValue || 0}, Pain=${breakdown.painOpportunity || 0}, Reach=${breakdown.reachability || 0}, Fit=${breakdown.localFit || 0}`);
    } catch { /* ignore */ }
  }

  if (lead.painSignals) {
    try {
      const signals = JSON.parse(lead.painSignals);
      if (Array.isArray(signals) && signals.length > 0) {
        const formatted = signals
          .slice(0, 5)
          .map((s: { type?: string; evidence?: string; severity?: number }) =>
            `${s.type || "UNKNOWN"} (severity ${s.severity || 0}): ${s.evidence || ""}`)
          .join("\n    ");
        lines.push(`Pain Signals:\n    ${formatted}`);
      }
    } catch { /* ignore */ }
  }

  if (lead.axiomWebsiteAssessment) {
    try {
      const assessment = JSON.parse(lead.axiomWebsiteAssessment);
      const parts: string[] = [];
      if (assessment.speedRisk != null) parts.push(`Speed Risk: ${assessment.speedRisk}/10`);
      if (assessment.conversionRisk != null) parts.push(`Conversion Risk: ${assessment.conversionRisk}/10`);
      if (assessment.trustRisk != null) parts.push(`Trust Risk: ${assessment.trustRisk}/10`);
      if (assessment.seoRisk != null) parts.push(`SEO Risk: ${assessment.seoRisk}/10`);
      if (assessment.overallGrade) parts.push(`Overall Grade: ${assessment.overallGrade}`);
      if (parts.length > 0) lines.push(`Website Assessment: ${parts.join(", ")}`);
    } catch { /* ignore */ }
  }

  if (lead.tacticalNote) lines.push(`AI Tactical Note: ${lead.tacticalNote}`);
  if (lead.callOpener) lines.push(`Call Opener: ${lead.callOpener}`);
  if (lead.followUpQuestion) lines.push(`Follow-Up Question: ${lead.followUpQuestion}`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are writing outreach intelligence for Axiom Infrastructure, an engineering-first web infrastructure firm for local businesses.

Your job is not to write polished agency strategy language. Your job is to produce grounded notes that help a human write a short, believable cold email.

Rules:
1. Be specific to the actual business and scraped evidence.
2. Prefer concrete observations over broad claims.
3. If evidence is weak, soften it with wording like "may be", "might be", or "feels like".
4. Do not exaggerate.
5. Do not flatter the business with generic compliments.
6. Do not use agency filler.
7. Do not recommend a high-friction CTA by default.
8. Keep each field concise and usable in a human-sounding email.
9. Do not use em dashes or exclamation marks.

Never use phrases like:
- stellar reputation
- glowing reviews
- award-winning brand
- high-converting
- modernize your website
- boost revenue
- online presence
- digital transformation
- stand out online

Good observation areas:
- site feels dated on mobile
- booking or contact path takes too many clicks
- trust signals are buried
- service pages are thin or unclear
- site feels slow
- the business looks stronger elsewhere than on the site
- no clear website surfaced

Respond with a JSON object containing these fields:
- valueProposition: 1 short sentence on how Axiom could help this business specifically, grounded in the observed issue
- pitchAngle: the clearest angle for the outreach email in 1 short sentence
- anticipatedObjections: Array of 2-3 realistic pushbacks
- emailTone: One of "casual", "professional", or "urgent"
- keyPainPoint: The single clearest issue to lead with
- competitiveEdge: What a stronger competitor or stronger local site is probably doing better in practical terms
- personalizedHook: One short opener tied to a concrete observation
- recommendedCTA: Low-friction CTA only, usually offering to send a few ideas
- enrichmentSummary: 1-2 short sentences summarizing why the lead is worth outreach`;

/**
 * Enrich a single lead using DeepSeek.
 */
export async function enrichLead(lead: LeadRecord): Promise<EnrichmentResult> {
  const context = buildLeadContext(lead);
  const firstPass = await chatCompletionJson<EnrichmentResult>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Analyze this lead and produce outreach intelligence:\n\n${context}`,
    temperature: 0.35,
    maxTokens: 1024,
  });

  return normalizeEnrichmentResult(firstPass);
}

/**
 * Enrich multiple leads in parallel batches.
 */
export async function enrichLeadsBatch(
  leads: LeadRecord[],
  batchSize = 5,
): Promise<Map<number, EnrichmentResult>> {
  const results = new Map<number, EnrichmentResult>();

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (lead) => {
        const result = await enrichLead(lead);
        return { id: lead.id, result };
      }),
    );

    for (const outcome of batchResults) {
      if (outcome.status === "fulfilled") {
        results.set(outcome.value.id, outcome.value.result);
      } else {
        console.error(`[enrich] Failed to enrich lead:`, outcome.reason);
      }
    }
  }

  return results;
}
