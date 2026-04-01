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

const SYSTEM_PROMPT = `You are a B2B outreach strategist for Axiom Infrastructure, a web design and development agency based in Ontario, Canada. Your job is to analyze a business lead and produce actionable intelligence for a personalized cold email outreach campaign.

Axiom Infrastructure specializes in:
- Modern, high-converting websites for local service businesses
- Speed optimization and mobile-first design
- SEO and local search visibility
- Online booking/quote systems
- Brand identity and trust-building

Your analysis must be specific to the business — never generic. Reference their actual pain points, industry, and competitive landscape.

Respond with a JSON object containing these fields:
- valueProposition: A 1-2 sentence explanation of why Axiom specifically helps THIS business (reference their problems)
- pitchAngle: The single most compelling angle for the email (e.g., "competitors are stealing your customers online")
- anticipatedObjections: Array of 2-3 likely pushbacks (e.g., "I get business from word of mouth", "I tried a website before")
- emailTone: One of "casual", "professional", or "urgent" — based on the business type and pain severity
- keyPainPoint: The #1 pain point to lead the email with
- competitiveEdge: What competitors are likely doing better online
- personalizedHook: An opening line that shows research was done on this specific business
- recommendedCTA: What action to ask for (e.g., "quick 10-minute call", "reply to this email")
- enrichmentSummary: A 2-3 sentence executive summary of why this lead is worth pursuing`;

/**
 * Enrich a single lead using DeepSeek.
 */
export async function enrichLead(lead: LeadRecord): Promise<EnrichmentResult> {
  const context = buildLeadContext(lead);

  return chatCompletionJson<EnrichmentResult>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Analyze this lead and produce outreach intelligence:\n\n${context}`,
    temperature: 0.5,
    maxTokens: 1024,
  });
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
