/**
 * Outreach Email Generator
 *
 * Uses DeepSeek to generate personalized cold emails based on
 * enrichment data. Produces both HTML and plain text versions.
 */

import { chatCompletionJson } from "@/lib/deepseek";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";
import type { LeadRecord } from "@/lib/prisma";

export type GeneratedEmail = {
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
};

function buildGenerationContext(lead: LeadRecord, enrichment: EnrichmentResult, senderName: string): string {
  const lines: string[] = [];

  lines.push(`SENDER: ${senderName} from Axiom Infrastructure`);
  lines.push(`RECIPIENT BUSINESS: ${lead.businessName}`);
  lines.push(`RECIPIENT CITY: ${lead.city}`);
  lines.push(`RECIPIENT NICHE: ${lead.niche}`);
  if (lead.contactName) lines.push(`RECIPIENT CONTACT NAME: ${lead.contactName}`);
  lines.push(`RECIPIENT EMAIL: ${lead.email}`);
  lines.push(`WEBSITE STATUS: ${lead.websiteStatus || "UNKNOWN"}`);
  if (lead.rating != null) lines.push(`GOOGLE RATING: ${lead.rating}/5 (${lead.reviewCount || 0} reviews)`);
  lines.push(``);
  lines.push(`=== ENRICHMENT INTELLIGENCE ===`);
  lines.push(`VALUE PROPOSITION: ${enrichment.valueProposition}`);
  lines.push(`PITCH ANGLE: ${enrichment.pitchAngle}`);
  lines.push(`KEY PAIN POINT: ${enrichment.keyPainPoint}`);
  lines.push(`COMPETITIVE EDGE: ${enrichment.competitiveEdge}`);
  lines.push(`PERSONALIZED HOOK: ${enrichment.personalizedHook}`);
  lines.push(`RECOMMENDED CTA: ${enrichment.recommendedCTA}`);
  lines.push(`EMAIL TONE: ${enrichment.emailTone}`);
  lines.push(`ANTICIPATED OBJECTIONS: ${enrichment.anticipatedObjections.join("; ")}`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are writing a personalized cold outreach email on behalf of Axiom Infrastructure, a web design and development agency in Ontario, Canada.

STRICT RULES:
1. Write the email as the sender (first person). Sign off with the sender's first name only.
2. Keep the email under 120 words. Shorter is better. Every word must earn its place.
3. The subject line must be compelling and non-spammy. Do NOT use ALL CAPS, excessive punctuation, or clickbait.
4. Reference the specific business by name and their specific situation.
5. Use the enrichment data to make the email feel personally researched, not templated.
6. Match the recommended email tone (casual/professional/urgent).
7. Include one clear CTA based on the enrichment's recommendedCTA.
8. Do NOT use placeholder tokens like [Name] or {{business}} — everything must be filled in.
9. Do NOT use phrases like "I noticed" or "I came across" more than once.
10. The plain text version should be a clean version without any HTML.
11. The HTML version should use simple inline styles — no CSS classes. Use a clean, minimal design with:
    - Font: system-ui, -apple-system, sans-serif
    - Dark text (#1a1a1a) on white background
    - Subtle signature styling
    - No images, no heavy formatting
    - Paragraphs with adequate spacing

Respond with a JSON object:
{
  "subject": "Email subject line",
  "bodyHtml": "Full HTML email body (complete, ready to send)",
  "bodyPlain": "Plain text version of the same email"
}`;

/**
 * Generate a personalized email for a single lead.
 */
export async function generateEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
): Promise<GeneratedEmail> {
  const context = buildGenerationContext(lead, enrichment, senderName);

  return chatCompletionJson<GeneratedEmail>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Generate a personalized cold outreach email using this context:\n\n${context}`,
    temperature: 0.7,
    maxTokens: 1536,
  });
}
