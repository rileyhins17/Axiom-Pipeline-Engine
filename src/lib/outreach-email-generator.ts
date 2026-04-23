/**
 * Outreach Email Generator
 *
 * Uses DeepSeek to generate personalized outreach email copy based on
 * enrichment data. Cold emails are validated against tone/style rules
 * before HTML is rendered for delivery.
 */

import type { PainSignal, WebsiteAssessment } from "@/lib/axiom-scoring";
import { chatCompletionJson } from "@/lib/deepseek";
import {
  buildHtmlEmail,
  buildPlainTextEmail,
  buildRetryInstructions,
  chooseColdEmailPlan,
  type ColdEmailCtaType,
  type ColdEmailDraft,
  type ColdEmailPlan,
  validateColdEmailDraft,
} from "@/lib/outreach-email-style";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";
import type { LeadRecord } from "@/lib/prisma";

export type GeneratedEmail = {
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  personalization_reason?: string;
  observed_issue?: string;
  CTA_type?: ColdEmailCtaType | "follow_up";
  confidence_score?: number;
};

export type OutreachSequenceStepType = "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2";

type FollowUpSourceEmail = {
  subject: string;
  bodyPlain: string;
  sentAt: string | Date;
};

type RawGeneratedColdEmail = {
  subject: string;
  body: string;
  personalization_reason: string;
  observed_issue: string;
  CTA_type: ColdEmailCtaType;
  confidence_score: number;
};

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function firstName(senderName: string) {
  return senderName.trim().split(/\s+/)[0] || senderName.trim() || "Riley";
}

function buildPainSignalContext(lead: LeadRecord) {
  const painSignals = parseJson<PainSignal[]>(lead.painSignals);
  if (!Array.isArray(painSignals) || painSignals.length === 0) {
    return "PAIN SIGNALS: none recorded";
  }

  const lines = painSignals
    .slice(0, 4)
    .map(
      (signal) =>
        `- ${signal.type} (severity ${signal.severity}, ${signal.source}): ${signal.evidence || "No evidence provided"}`,
    );

  return ["PAIN SIGNALS:", ...lines].join("\n");
}

function buildWebsiteAssessmentContext(lead: LeadRecord) {
  const assessment = parseJson<WebsiteAssessment>(lead.axiomWebsiteAssessment);
  if (!assessment) {
    return "WEBSITE ASSESSMENT: none recorded";
  }

  return [
    "WEBSITE ASSESSMENT:",
    `- Overall grade: ${assessment.overallGrade || "unknown"}`,
    `- Speed risk: ${assessment.speedRisk}/10`,
    `- Conversion risk: ${assessment.conversionRisk}/10`,
    `- Trust risk: ${assessment.trustRisk}/10`,
    `- SEO risk: ${assessment.seoRisk}/10`,
    `- Top fixes: ${(assessment.topFixes || []).slice(0, 3).join("; ") || "none recorded"}`,
  ].join("\n");
}

function buildGenerationContext(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
  plan: ColdEmailPlan,
): string {
  const lines: string[] = [];

  lines.push(`SENDER: ${senderName} from Axiom Infrastructure`);
  lines.push(`SENDER FIRST NAME: ${firstName(senderName)}`);
  lines.push(`BUSINESS: ${lead.businessName}`);
  lines.push(`CITY: ${lead.city}`);
  lines.push(`NICHE: ${lead.niche}`);
  if (lead.category) lines.push(`CATEGORY: ${lead.category}`);
  if (lead.contactName) lines.push(`CONTACT NAME: ${lead.contactName}`);
  if (lead.email) lines.push(`EMAIL: ${lead.email}`);
  if (lead.emailType) lines.push(`EMAIL TYPE: ${lead.emailType}`);
  if (lead.emailConfidence != null) lines.push(`EMAIL CONFIDENCE: ${lead.emailConfidence}`);
  if (lead.callOpener) lines.push(`CALL OPENER CANDIDATE: ${lead.callOpener}`);
  if (lead.followUpQuestion) lines.push(`FOLLOW-UP QUESTION CANDIDATE: ${lead.followUpQuestion}`);
  lines.push(`WEBSITE STATUS: ${lead.websiteStatus || "UNKNOWN"}`);
  if (lead.websiteUrl) lines.push(`WEBSITE URL: ${lead.websiteUrl}`);
  if (lead.websiteGrade) lines.push(`WEBSITE GRADE: ${lead.websiteGrade}`);
  if (lead.rating != null) lines.push(`GOOGLE RATING: ${lead.rating}`);
  if (lead.reviewCount != null) lines.push(`REVIEW COUNT: ${lead.reviewCount}`);
  if (lead.axiomScore != null) lines.push(`AXIOM SCORE: ${lead.axiomScore}`);
  if (lead.axiomTier) lines.push(`AXIOM TIER: ${lead.axiomTier}`);
  if (lead.tacticalNote) lines.push(`TACTICAL NOTE: ${lead.tacticalNote}`);
  lines.push("");
  lines.push(buildWebsiteAssessmentContext(lead));
  lines.push("");
  lines.push(buildPainSignalContext(lead));
  lines.push("");
  lines.push("ENRICHMENT INTELLIGENCE:");
  lines.push(`- Value proposition: ${enrichment.valueProposition}`);
  lines.push(`- Pitch angle: ${enrichment.pitchAngle}`);
  lines.push(`- Key pain point: ${enrichment.keyPainPoint}`);
  lines.push(`- Personalized hook: ${enrichment.personalizedHook}`);
  lines.push(`- Recommended CTA: ${enrichment.recommendedCTA}`);
  lines.push(`- Tone: ${enrichment.emailTone}`);
  lines.push(`- Summary: ${enrichment.enrichmentSummary}`);
  lines.push("");
  lines.push("SELECTED EMAIL STRATEGY:");
  lines.push(`- Strategy: ${plan.strategy}`);
  lines.push(`- CTA type: ${plan.CTA_type}`);
  lines.push(`- Confidence score: ${plan.confidence_score}`);
  lines.push(`- Personalization reason: ${plan.personalization_reason}`);
  lines.push(`- Concrete anchor to reference: ${plan.concreteAnchor}`);
  lines.push(`- Observed issue: ${plan.observed_issue}`);
  lines.push(`- Evidence: ${plan.issueEvidence}`);
  lines.push(`- Preferred observation framing: ${plan.observationHint}`);
  lines.push(`- Preferred soft consequence: ${plan.consequenceHint}`);
  lines.push(`- Preferred CTA: ${plan.ctaHint}`);
  lines.push(`- Use softened language: ${plan.softened ? "yes" : "no"}`);

  return lines.join("\n");
}

function buildFollowUpContext(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
  previousEmail: FollowUpSourceEmail,
  stepType: OutreachSequenceStepType = "FOLLOW_UP_1",
): string {
  const lines: string[] = [];

  lines.push(`SENDER: ${senderName} from Axiom Infrastructure`);
  lines.push(`RECIPIENT BUSINESS: ${lead.businessName}`);
  if (lead.contactName) lines.push(`RECIPIENT CONTACT NAME: ${lead.contactName}`);
  lines.push(`RECIPIENT EMAIL: ${lead.email}`);
  lines.push(`RECIPIENT CITY: ${lead.city}`);
  lines.push(`RECIPIENT NICHE: ${lead.niche}`);
  if (lead.emailType) lines.push(`RECIPIENT EMAIL TYPE: ${lead.emailType}`);
  if (lead.emailConfidence != null) lines.push(`RECIPIENT EMAIL CONFIDENCE: ${lead.emailConfidence}`);
  if (lead.websiteGrade) lines.push(`WEBSITE GRADE: ${lead.websiteGrade}`);
  lines.push(`WEBSITE STATUS: ${lead.websiteStatus || "UNKNOWN"}`);
  if (lead.rating != null) lines.push(`GOOGLE RATING: ${lead.rating}`);
  if (lead.reviewCount != null) lines.push(`REVIEW COUNT: ${lead.reviewCount}`);
  if (lead.axiomScore != null) lines.push(`AXIOM SCORE: ${lead.axiomScore}`);
  if (lead.axiomTier) lines.push(`AXIOM TIER: ${lead.axiomTier}`);
  if (lead.callOpener) lines.push(`CALL OPENER CANDIDATE: ${lead.callOpener}`);
  if (lead.followUpQuestion) lines.push(`FOLLOW-UP QUESTION CANDIDATE: ${lead.followUpQuestion}`);
  if (lead.tacticalNote) lines.push(`TACTICAL NOTE: ${lead.tacticalNote}`);
  lines.push("");
  lines.push(buildWebsiteAssessmentContext(lead));
  lines.push("");
  lines.push(buildPainSignalContext(lead));
  lines.push("");
  lines.push(`PREVIOUS EMAIL SUBJECT: ${previousEmail.subject}`);
  lines.push(`PREVIOUS EMAIL SENT AT: ${new Date(previousEmail.sentAt).toISOString()}`);
  lines.push(`PREVIOUS EMAIL BODY: ${truncateContextText(previousEmail.bodyPlain)}`);
  lines.push(`FOLLOW-UP STEP: ${stepType}`);
  lines.push(``);
  lines.push(`=== ENRICHMENT INTELLIGENCE ===`);
  lines.push(`VALUE PROPOSITION: ${enrichment.valueProposition}`);
  lines.push(`PITCH ANGLE: ${enrichment.pitchAngle}`);
  lines.push(`KEY PAIN POINT: ${enrichment.keyPainPoint}`);
  lines.push(`COMPETITIVE EDGE: ${enrichment.competitiveEdge}`);
  lines.push(`PERSONALIZED HOOK: ${enrichment.personalizedHook}`);
  lines.push(`RECOMMENDED CTA: ${enrichment.recommendedCTA}`);
  lines.push(`EMAIL TONE: ${enrichment.emailTone}`);

  return lines.join("\n");
}

const COLD_EMAIL_SYSTEM_PROMPT = `You write highly optimized, extremely natural cold emails for Axiom Infrastructure, reaching out to local service businesses.

Your only goal is to start a low-pressure conversation. The emails MUST feel completely human, hyper-casual, and as if a real person casually found their business online and typed it out in 30 seconds on their phone. NO "marketer" or "agency" talk. NO AI fluff.

Core Rules for Perfection:
1. Max Length: 3 to 6 short sentences (50 to 90 words). The shorter, the more human.
2. Structure: 
   - Casual hook (e.g., "Hey came across your site while looking at [niche] in [city]...")
   - Specific observation (call out the 'observed_issue' naturally without sounding like an audit)
   - Extremely soft suggestion/curiosity (what we can do about it)
   - Zero-friction CTA (e.g., "Open to seeing what I mean?", "Mind if I send over a few ideas?", "Worth a quick chat?")
3. Ban Words/Phrases (NEVER use these):
   - "I hope this email finds you well"
   - "My name is"
   - "We specialize in"
   - "Unlock growth", "digital transformation", "boost revenue", "online presence", "scale"
   - "Award-winning", "stellar reputation", "glowing reviews"
   - "Schedule a quick 10-minute call"
   - Any exclamation marks (!) - use periods only.
   - Any em dashes (—)
   - DO NOT mention Google reviews, review count, or star rating unless the
     provided anchor explicitly references them. Reviews are a boring,
     templated hook. Lead with something else — the domain, the niche, the
     city, the contact's name, a specific observation. Reviews may appear
     as a secondary aside at most, never as the opening line.
4. Formatting: 
   - Use plain text formatting. No bold. 
   - Keep paragraphs to 1-2 sentences. 
   - Sign off casually, just the sender's first name: "Best,\\n[Name]" or "Thanks,\\n[Name]".
5. Soften the Blow: If critiquing the site (speed, conversion), phrase it as "it looks like", "seems to be", or "might be missing out on". Don't act like you did a deep technical audit, just frame it as a casual observation from a visitor's perspective.

Return JSON only:
{
  "subject": "natural, lowercase or sentence-case subject line (max 5 words)",
  "body": "The perfectly written plain-text email body",
  "personalization_reason": "Brief internal note on why this email is relevant to them",
  "observed_issue": "The core issue you highlighted",
  "CTA_type": "observation_offer | permission_offer | soft_call",
  "confidence_score": 0
}`;

const FOLLOW_UP_SYSTEM_PROMPT = `You are writing a concise follow-up email on behalf of Axiom Infrastructure, a web design and development agency in Ontario, Canada.

STRICT RULES:
1. This is a follow-up to a previous cold email. Acknowledge the prior note briefly without sounding robotic.
2. Keep the email under 90 words.
3. Maintain the same personalized context from the original outreach and add one fresh, relevant angle.
4. FOLLOW_UP_1 should feel like a soft nudge with a new angle.
5. FOLLOW_UP_2 should feel like a concise final check-in and can politely close the loop.
6. The tone should be helpful, confident, and low-pressure.
7. Keep the CTA simple and easy to reply to.
8. Do NOT repeat the original email verbatim.
9. Prefer a natural reply-style subject. "Re:" is allowed when it fits.
10. Do NOT use placeholders.
11. The plain text version should be a clean version without any HTML.
12. The HTML version should use simple inline styles and remain lightweight.
13. Use one fresh detail from the lead context, website assessment, or pain signals instead of recycling the same hook.

Respond with a JSON object:
{
  "subject": "Follow-up email subject line",
  "bodyHtml": "Full HTML email body (complete, ready to send)",
  "bodyPlain": "Plain text version of the same email"
}`;

function sanitizeSubject(subject: string, businessName: string) {
  const trimmed = subject
    .replace(/[!]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (trimmed.length > 0) {
    const shortSubject = trimmed.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
    return shortSubject.slice(0, 78);
  }

  return `Quick thought on ${businessName}`;
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateContextText(value: string, maxLength = 800) {
  const cleaned = value.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeColdEmailDraft(
  draft: RawGeneratedColdEmail,
  plan: ColdEmailPlan,
  businessName: string,
): ColdEmailDraft {
  return {
    subject: sanitizeSubject(draft.subject || "", businessName),
    body: (draft.body || "").replace(/\r/g, "").trim(),
    personalization_reason: (draft.personalization_reason || plan.personalization_reason).trim(),
    observed_issue: (draft.observed_issue || plan.observed_issue).trim(),
    CTA_type: plan.CTA_type,
    confidence_score: Math.max(0, Math.min(100, Math.round(Number(draft.confidence_score || plan.confidence_score)))),
  };
}

async function generateColdEmailAttempt(
  context: string,
  plan: ColdEmailPlan,
  retryInstructions?: string,
): Promise<RawGeneratedColdEmail> {
  const userPrompt = [
    "Generate one cold email using the selected strategy and context below.",
    "The email must feel human, specific, low-friction, and reply-worthy.",
    "",
    context,
    "",
    "Additional rules:",
    `- Keep CTA type as ${plan.CTA_type}.`,
    `- Strategy is ${plan.strategy}.`,
    `- Use this concrete anchor somewhere naturally: ${plan.concreteAnchor}.`,
    `- Observed issue to anchor around: ${plan.observed_issue}.`,
    `- If evidence is limited, stay curiosity-based and ask permission to send ideas.`,
    "- Do not over-compliment the business.",
    retryInstructions ? `\n${retryInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return chatCompletionJson<RawGeneratedColdEmail>({
    systemPrompt: COLD_EMAIL_SYSTEM_PROMPT,
    userPrompt,
    temperature: retryInstructions ? 0.28 : 0.4,
    maxTokens: 1100,
  });
}

function finalizeColdEmail(
  draft: ColdEmailDraft,
  senderName: string,
): GeneratedEmail {
  const bodyPlain = buildPlainTextEmail(draft.body, firstName(senderName));
  const bodyHtml = buildHtmlEmail(bodyPlain);

  return {
    subject: draft.subject,
    bodyPlain,
    bodyHtml,
    personalization_reason: draft.personalization_reason,
    observed_issue: draft.observed_issue,
    CTA_type: draft.CTA_type,
    confidence_score: draft.confidence_score,
  };
}

function finalizeGeneratedEmail(
  draft: GeneratedEmail,
  senderName: string,
  businessName: string,
): GeneratedEmail {
  const bodySource = draft.bodyPlain || draft.bodyHtml || "";
  const bodyPlain = buildPlainTextEmail(stripHtmlTags(bodySource), firstName(senderName));

  return {
    subject: sanitizeSubject(draft.subject || "", businessName),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
    personalization_reason: (draft.personalization_reason || "").trim(),
    observed_issue: (draft.observed_issue || "").trim(),
    CTA_type: draft.CTA_type || "follow_up",
    confidence_score: Math.max(0, Math.min(100, Math.round(Number(draft.confidence_score || 0)))),
  };
}

function getRecipientName(lead: LeadRecord) {
  return lead.contactName?.trim().split(/\s+/)[0] || lead.businessName || "there";
}

function buildFallbackInitialEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
): GeneratedEmail {
  const senderFirst = firstName(senderName);
  const recipientName = getRecipientName(lead);
  const bodyPlain = buildPlainTextEmail(
    [
      `Hi ${recipientName},`,
      "",
      `I took a quick look at ${lead.businessName} and it looks like ${enrichment.pitchAngle.toLowerCase()}`,
      enrichment.recommendedCTA,
      "",
      "Best,",
      senderFirst,
    ].join("\n"),
    senderFirst,
  );

  return {
    subject: sanitizeSubject(`Quick note on ${lead.businessName}`, lead.businessName),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
    personalization_reason: enrichment.personalizedHook,
    observed_issue: enrichment.keyPainPoint,
    CTA_type: "permission_offer",
    confidence_score: 48,
  };
}

function buildFallbackFollowUpEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
  stepType: OutreachSequenceStepType,
): GeneratedEmail {
  const senderFirst = firstName(senderName);
  const recipientName = getRecipientName(lead);
  const followUpLine = stepType === "FOLLOW_UP_2"
    ? "Just wanted to close the loop in case this got buried."
    : "Wanted to circle back with one more quick thought.";
  const bodyPlain = buildPlainTextEmail(
    [
      `Hi ${recipientName},`,
      "",
      followUpLine,
      `The main thing I noticed was that ${enrichment.keyPainPoint.toLowerCase()}.`,
      enrichment.recommendedCTA,
      "",
      "Best,",
      senderFirst,
    ].join("\n"),
    senderFirst,
  );

  return {
    subject: sanitizeSubject(stepType === "FOLLOW_UP_2" ? "Quick follow up" : "Circling back", lead.businessName),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
    personalization_reason: enrichment.personalizedHook,
    observed_issue: enrichment.keyPainPoint,
    CTA_type: "follow_up",
    confidence_score: 42,
  };
}

/**
 * Generate a personalized email for a single lead.
 */
export async function generateEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
): Promise<GeneratedEmail> {
  try {
    const plan = chooseColdEmailPlan(lead, enrichment);
    const context = buildGenerationContext(lead, enrichment, senderName, plan);

    const firstDraft = normalizeColdEmailDraft(
      await generateColdEmailAttempt(context, plan),
      plan,
      lead.businessName,
    );
    const firstValidation = validateColdEmailDraft(firstDraft, lead, plan);
    if (firstValidation.valid) {
      return finalizeColdEmail(firstDraft, senderName);
    }

    const retryDraft = normalizeColdEmailDraft(
      await generateColdEmailAttempt(context, plan, buildRetryInstructions(firstValidation, plan)),
      plan,
      lead.businessName,
    );
    const retryValidation = validateColdEmailDraft(retryDraft, lead, plan);
    const finalDraft =
      retryValidation.valid || retryValidation.score >= firstValidation.score
        ? retryDraft
        : firstDraft;
    return finalizeColdEmail(finalDraft, senderName);
  } catch (error) {
    console.warn(`[outreach-email-generator] Falling back to template email for ${lead.id}:`, error);
    return buildFallbackInitialEmail(lead, enrichment, senderName);
  }
}

export async function generateFollowUpEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
  previousEmail: FollowUpSourceEmail,
  stepType: OutreachSequenceStepType = "FOLLOW_UP_1",
): Promise<GeneratedEmail> {
  try {
    const context = buildFollowUpContext(lead, enrichment, senderName, previousEmail, stepType);

    const draft = await chatCompletionJson<GeneratedEmail>({
      systemPrompt: FOLLOW_UP_SYSTEM_PROMPT,
      userPrompt: `Generate a personalized follow-up email using this context:\n\n${context}`,
      temperature: 0.35,
      maxTokens: 900,
    });
    return finalizeGeneratedEmail(draft, senderName, lead.businessName);
  } catch (error) {
    console.warn(`[outreach-email-generator] Falling back to follow-up template for ${lead.id}:`, error);
    return buildFallbackFollowUpEmail(lead, enrichment, senderName, stepType);
  }
}

export async function generateSequenceStepEmail(
  lead: LeadRecord,
  enrichment: EnrichmentResult,
  senderName: string,
  stepType: OutreachSequenceStepType,
  previousEmail?: FollowUpSourceEmail,
): Promise<GeneratedEmail> {
  if (stepType === "INITIAL") {
    return generateEmail(lead, enrichment, senderName);
  }

  if (!previousEmail) {
    throw new Error(`Previous email context is required for ${stepType}`);
  }

  return generateFollowUpEmail(lead, enrichment, senderName, previousEmail, stepType);
}
