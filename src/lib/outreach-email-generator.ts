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

export type OutreachSequenceStepType = "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2" | "FOLLOW_UP_3";

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

const COLD_EMAIL_SYSTEM_PROMPT = `You write cold emails for Axiom Infrastructure, a small studio that helps local service businesses get more from their website. Your only job is to earn a reply.

These emails go to real owners and managers on their phones. They take 2 seconds to judge. You have ONE shot to sound like a real person who actually looked at their business — not an agency, not a marketer, not a bot.

HARD RULES — violating any of these kills the conversion:
1. LENGTH: 45-75 words. Under 80 words, period. Short wins.
2. SUBJECT: 3-6 words, sentence case (capitalize the first word and proper nouns only — not Title Case, not all-lowercase), no salesy language. Good: "Noticed something on your site", "Quick thought for {Business}", "{City} {niche} — site question". Never all-lowercase, never SHOUTY CASE, never: "Exclusive Opportunity", "Unlock Your Potential", "Grow {Business} 10x".
3. OPENING LINE: Must reference a SPECIFIC concrete detail from the context (the niche in that city, the domain, a visible issue, the contact's first name). Never "I hope you're doing well", "My name is X", "I came across your website and was impressed".
4. ONE OBSERVATION: Point out ONE specific thing you noticed. Soften it with "looks like", "seems to", "might be", "from a visitor's eye". Never list multiple issues. Never sound like an audit.
5. ONE CTA: A single, easy-to-reply-to question. Best: "worth me sharing a quick fix or two?", "want me to send over what I'd change?", "open to a 10-min look?". Never: "Schedule a call via this link", "Book a demo", "Let me know when you're available to hop on a 30-minute discovery call".
6. SIGNOFF: "Best,\\n{First Name}" or "Thanks,\\n{First Name}" — nothing else. No title, no company name after the signature.
7. BANNED PHRASES (never use, even paraphrased): "hope this finds you well", "my name is", "we specialize in", "I help businesses like yours", "would love to", "circle back", "touch base", "unlock growth", "digital transformation", "boost revenue", "online presence", "scale your business", "award-winning", "stellar reputation", "glowing reviews", "high-converting", "best-in-class", "schedule a quick 10-minute call", "hop on a call".
8. NO exclamation marks. NO em dashes (—). NO bold. NO HTML. Plain text only.
9. NO complimenting the business generically ("you have a great business"). Compliments feel fake; specific observations feel real.
10. GOOGLE REVIEWS: Do NOT open with reviews/rating/stars. It's the laziest hook and every agency does it. Only reference reviews if the provided anchor explicitly calls them out, and even then never in the first sentence.

STRUCTURE that converts (follow this exactly):
  Line 1 — first-name greeting OR skip greeting entirely. "Hey {first name}," or no greeting if unknown.
  Line 2 — concrete observation that proves you actually looked (niche in city, specific page, something on their site).
  Line 3 — the ONE soft issue framed as curiosity, not critique.
  Line 4 — the single low-friction CTA (question format).
  Line 5 — "Best,\\n{first name of sender}"

Return JSON only:
{
  "subject": "3-6 word sentence-case subject (capitalize first word and proper nouns only)",
  "body": "plain-text body, no greetings template, exactly the 4-5 lines described",
  "personalization_reason": "one sentence on why this email will resonate with this specific lead",
  "observed_issue": "the single issue referenced",
  "CTA_type": "observation_offer | permission_offer | soft_call",
  "confidence_score": 0
}`;

const FOLLOW_UP_SYSTEM_PROMPT = `You are writing a short plain-text follow-up email on behalf of Axiom Infrastructure.

STRICT RULES:
1. Follow-up only. Acknowledge the prior note in one natural phrase.
2. Keep FOLLOW_UP_1 under 65 words and FOLLOW_UP_2/FOLLOW_UP_3 under 55 words.
3. Plain text only. No HTML, markdown, bullets, footer, title, or company name in the body.
4. End with exactly "Best,\\n{sender first name}". Nothing after it.
5. Add one fresh useful angle, but do not repeat the same critique verbatim.
6. Keep the CTA low-friction and easy to answer.
7. Do NOT use placeholders.
8. Do NOT use "broken", "costing you leads", "one last time", "last note", "circle back", or "touch base".
9. No exclamation marks. No em dashes.
10. Prefer a natural reply-style subject in sentence case (capitalize first word and proper nouns only — not Title Case, not all-lowercase). "Re:" is allowed when it fits.

Respond with a JSON object:
{
  "subject": "short sentence-case subject line",
  "bodyPlain": "plain text follow-up"
}`;

function toSentenceCase(value: string) {
  const lower = value.toLowerCase();
  // Capitalize the first alphabetic character only — preserves domain names,
  // hyphenated tokens, and avoids Title Case which reads spammy.
  return lower.replace(/^(\W*)([a-z])/, (_match, lead, first) => `${lead}${first.toUpperCase()}`);
}

function sanitizeSubject(subject: string, businessName: string) {
  const trimmed = subject
    .replace(/[!]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (trimmed.length > 0) {
    const shortSubject = trimmed.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
    const normalizedSubject = shortSubject.toLowerCase().startsWith("re:")
      ? `Re: ${toSentenceCase(shortSubject.replace(/^re:\s*/i, ""))}`
      : toSentenceCase(shortSubject);
    return normalizedSubject.slice(0, 78);
  }

  return toSentenceCase(`quick thought on ${businessName}`).slice(0, 78);
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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
    "Ground every line in the PAIN SIGNALS, WEBSITE ASSESSMENT, and ENRICHMENT INTELLIGENCE below — reference a real signal that someone could only know by looking at this specific business. Do not generalize, do not paraphrase into vague advice, and do not echo the strategy or rules back at the reader.",
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
    "- Every sentence must be a complete thought ending in a period or question mark. Never trail off after a verb like \"noticed\" or \"saw\".",
    "- The opening observation must reference at least one concrete detail from the PAIN SIGNALS or WEBSITE ASSESSMENT (a specific page, contact path, missing element, review pattern, or domain), not a generic statement.",
    "- Do not write the email as if you are following a template — vary phrasing, do not start with \"I had a quick look\" or \"I looked through\" if those exact phrases appear in the personalized hook.",
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
  const bodySource = draft.bodyPlain || stripHtmlTags(draft.bodyHtml || "");
  const bodyPlain = buildPlainTextEmail(bodySource, firstName(senderName));

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

function stableHashFromLeadId(value: string | number | null | undefined) {
  const source = String(value ?? "");
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function rotateFallbackSubject(lead: LeadRecord): string {
  const domainOrName = lead.websiteDomain || lead.businessName;
  const pool: string[] = [
    `Quick thought on ${domainOrName}`,
    "Quick site thought",
    "Small site note",
    "Question about the site",
    "Noticed one thing",
    `Quick note on ${domainOrName}`,
  ];
  const index = stableHashFromLeadId(lead.id) % pool.length;
  return pool[index];
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
      lead.contactName ? `Hey ${recipientName},` : "Hi,",
      "",
      enrichment.personalizedHook,
      `The main thing I noticed is that ${enrichment.keyPainPoint.toLowerCase()}`,
      "Worth me sending over the 2 or 3 fixes I'd make?",
      "",
      "Best,",
      senderFirst,
    ].join("\n"),
    senderFirst,
  );

  return {
    subject: sanitizeSubject(rotateFallbackSubject(lead), lead.businessName),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
    personalization_reason: enrichment.personalizedHook,
    observed_issue: enrichment.keyPainPoint,
    CTA_type: "permission_offer",
    confidence_score: 48,
  };
}

function cleanEmailLine(value: string, fallback: string, maxLength = 180) {
  const cleaned = (value || fallback)
    .replace(/[!]/g, ".")
    .replace(/[—–]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maxLength).trim();
}

function buildPlanBasedInitialEmail(
  lead: LeadRecord,
  plan: ColdEmailPlan,
  senderName: string,
): GeneratedEmail {
  const senderFirst = firstName(senderName);
  const recipientName = getRecipientName(lead);
  const greeting = lead.contactName ? `Hey ${recipientName},` : "Hi,";
  const observation = cleanEmailLine(plan.observationHint, `I was looking at ${lead.businessName} and had one quick thought.`);
  const consequence = cleanEmailLine(
    plan.consequenceHint,
    "That can make it harder for a new visitor to know what to do next.",
  );
  const cta =
    plan.CTA_type === "soft_call"
      ? "Open to me walking you through the quick fix?"
      : "Worth me sending over a couple of quick fixes?";
  const bodyPlain = buildPlainTextEmail(
    [
      greeting,
      "",
      observation,
      consequence,
      cta.endsWith("?") ? cta : `${cta}?`,
      "",
      "Best,",
      senderFirst,
    ].join("\n"),
    senderFirst,
  );

  return {
    subject: sanitizeSubject(rotateFallbackSubject(lead), lead.businessName),
    bodyPlain,
    bodyHtml: buildHtmlEmail(bodyPlain),
    personalization_reason: plan.personalization_reason,
    observed_issue: plan.observed_issue,
    CTA_type: plan.CTA_type,
    confidence_score: Math.max(70, plan.confidence_score),
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
  const followUpLine = stepType === "FOLLOW_UP_3"
    ? "Wanted to send one practical thought before I close this out."
    : stepType === "FOLLOW_UP_2"
      ? "Wanted to send one more practical thought in case this is useful."
    : "Wanted to send one practical thought that may be useful.";
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
    subject: sanitizeSubject(stepType === "FOLLOW_UP_3" ? "Last site thought" : stepType === "FOLLOW_UP_2" ? "Quick site thought" : "One site thought", lead.businessName),
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
    const finalValidation = retryValidation.valid || retryValidation.score >= firstValidation.score
      ? retryValidation
      : firstValidation;
    if (!finalValidation.valid) {
      return buildPlanBasedInitialEmail(lead, plan, senderName);
    }
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
