import type { PainSignal, WebsiteAssessment } from "@/lib/axiom-scoring";
import { hasValidPipelineEmail } from "@/lib/lead-qualification";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";
import type { LeadRecord } from "@/lib/prisma";

export const BANNED_EMAIL_PHRASES = [
  "i hope you're well",
  "i hope you are well",
  "stellar reputation",
  "glowing reviews",
  "award-winning brand",
  "award winning brand",
  "high-converting platforms",
  "high converting platforms",
  "we specialize in",
  "modernize your website",
  "improve booking conversions",
  "boost revenue",
  "schedule a quick 10-minute call",
  "schedule a quick 10 minute call",
  "hop on a quick call",
  "modern, high-converting",
  "modern high-converting",
  "transforming sites like yours",
  "align your website with",
  "strong online presence",
  "really strong reputation",
  "very strong reputation",
  "award winning",
  "top-tier",
  "top tier",
  "best-in-class",
  "best in class",
  "first impression",
  "digital transformation",
  "online visibility",
  "optimize your site",
  "take things to the next level",
  "stand out from competitors",
  "winning more leads",
  "drive more leads",
  "unlock growth",
];

const GENERIC_FALLBACK_PATTERNS = [
  "digital presence",
  "custom solutions",
  "industry-leading",
  "cutting-edge",
  "streamline your business",
  "grow your brand",
  "take your business to the next level",
  "improve your online presence",
  "stand out online",
];

const SERVICE_BUSINESS_HINTS = [
  "roof",
  "hvac",
  "plumb",
  "electric",
  "landscap",
  "cleaning",
  "spa",
  "salon",
  "contract",
  "concrete",
  "cabinet",
  "kitchen",
  "renovat",
  "remodel",
  "dent",
  "clinic",
  "physio",
  "chiropr",
  "detail",
  "paint",
  "floor",
  "fence",
  "garage",
  "pest",
  "moving",
  "pool",
  "solar",
  "tree service",
];

export type ColdEmailStrategy = "observation_based" | "curiosity_based" | "soft_call";
export type ColdEmailCtaType = "observation_offer" | "permission_offer" | "soft_call";

export type ColdEmailDraft = {
  subject: string;
  body: string;
  personalization_reason: string;
  observed_issue: string;
  CTA_type: ColdEmailCtaType;
  confidence_score: number;
};

export type ColdEmailPlan = {
  strategy: ColdEmailStrategy;
  CTA_type: ColdEmailCtaType;
  confidence_score: number;
  observed_issue: string;
  personalization_reason: string;
  concreteAnchor: string;
  issueEvidence: string;
  observationHint: string;
  consequenceHint: string;
  ctaHint: string;
  softened: boolean;
  validEmail: boolean;
};

export type ColdEmailValidation = {
  valid: boolean;
  score: number;
  wordCount: number;
  errors: string[];
  checks: {
    specificity: number;
    humanTone: number;
    genericAgencyLanguage: number;
    ctaFriction: number;
    length: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim();
}

function normalizeLower(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function firstSentence(value: string | null | undefined, fallback: string) {
  const cleaned = normalizeText(value);
  if (!cleaned) return fallback;
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return sentence.trim();
}

function extractDomain(value: string | null | undefined) {
  const input = normalizeText(value);
  if (!input) return "";
  try {
    const url = input.startsWith("http://") || input.startsWith("https://") ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "";
  }
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getWebsiteAssessment(lead: LeadRecord) {
  return parseJson<WebsiteAssessment>(lead.axiomWebsiteAssessment);
}

function getPainSignals(lead: LeadRecord) {
  return parseJson<PainSignal[]>(lead.painSignals) || [];
}

function hasModerateOrStrongServiceFit(lead: LeadRecord) {
  const text = `${lead.niche || ""} ${lead.category || ""}`.toLowerCase();
  return SERVICE_BUSINESS_HINTS.some((keyword) => text.includes(keyword));
}

function hasOwnerOperatorStyleContact(lead: LeadRecord) {
  const emailType = normalizeLower(lead.emailType);
  return emailType === "owner" || emailType === "staff" || Boolean(normalizeText(lead.contactName));
}

function getEmailValidity(lead: LeadRecord) {
  return hasValidPipelineEmail({
    email: lead.email,
    emailConfidence: lead.emailConfidence,
    emailType: lead.emailType,
    emailFlags: lead.emailFlags,
  });
}

function getObservationFromAssessment(lead: LeadRecord, assessment: WebsiteAssessment | null) {
  if (lead.websiteStatus === "MISSING") {
    return {
      observedIssue: "No clear website surfaced for the business.",
      observationHint: "I tried to look through the site and could not find a clear website that explains the business cleanly.",
      consequenceHint: "That can make it harder for someone new to understand the work or know where to reach out.",
      evidence: "No website was found during the scrape.",
      strength: 72,
      softened: true,
    };
  }

  if (!assessment) {
    return null;
  }

  const reviewCount = Number(lead.reviewCount || 0);

  if (assessment.conversionRisk >= 4) {
    return {
      observedIssue: "The contact or quote path looks more complicated than it needs to be.",
      observationHint: "The contact or quote path feels like it takes more effort than it should, especially for someone already close to reaching out.",
      consequenceHint: "That kind of friction can slow people down right at the point where they are ready to reach out.",
      evidence: `Website assessment flagged conversion risk ${assessment.conversionRisk}/10.`,
      strength: 88,
      softened: assessment.conversionRisk < 6,
    };
  }

  if (assessment.trustRisk >= 4 && reviewCount >= 8) {
    return {
      observedIssue: "The website does not fully surface the trust the business has already built.",
      observationHint: "The site does not fully reflect the trust the business has already built elsewhere, especially for a first-time visitor.",
      consequenceHint: "That can make a new visitor pause longer than they should before taking the next step.",
      evidence: `Trust risk ${assessment.trustRisk}/10 with ${reviewCount} Google reviews.`,
      strength: 84,
      softened: assessment.trustRisk < 6,
    };
  }

  if (assessment.speedRisk >= 4) {
    return {
      observedIssue: "The site feels slower than it needs to on first load.",
      observationHint: "The site feels a bit slower than it should on first load, especially on mobile.",
      consequenceHint: "That can make the site feel less clear and dependable before the main content is even seen.",
      evidence: `Speed risk ${assessment.speedRisk}/10.`,
      strength: 78,
      softened: assessment.speedRisk < 6,
    };
  }

  if (assessment.seoRisk >= 4) {
    return {
      observedIssue: "Important service information feels harder to scan than it should be.",
      observationHint: "Some of the service information feels thinner or harder to scan than it could be.",
      consequenceHint: "That can make it harder for people to tell quickly whether they should reach out.",
      evidence: `SEO/content risk ${assessment.seoRisk}/10.`,
      strength: 74,
      softened: true,
    };
  }

  return null;
}

function getObservationFromPainSignals(lead: LeadRecord, painSignals: PainSignal[]) {
  const strongest = [...painSignals].sort((a, b) => b.severity - a.severity)[0];
  if (!strongest) {
    return null;
  }

  const softened = strongest.severity < 4;

  switch (strongest.type) {
    case "CONVERSION":
    case "CONTACT":
      return {
        observedIssue: "The contact path may be creating more friction than it should.",
        observationHint: "The contact path may be creating more friction than it should for someone ready to reach out.",
        consequenceHint: "Even small bits of friction there can be enough to slow down replies or quote requests.",
        evidence: strongest.evidence || "Stored pain signals suggest contact or conversion friction.",
        strength: 82,
        softened,
      };
    case "TRUST":
      return {
        observedIssue: "Trust signals feel buried or not surfaced clearly enough.",
        observationHint: "The site feels like it could bring trust signals forward much earlier.",
        consequenceHint: "That can slow down new visitors who are trying to decide quickly.",
        evidence: strongest.evidence || "Stored pain signals suggest trust friction.",
        strength: 79,
        softened,
      };
    case "SPEED":
      return {
        observedIssue: "The site may feel slower than it should.",
        observationHint: "The site feels like it may be carrying some speed friction.",
        consequenceHint: "That can make the site feel less reliable before the main information is even seen.",
        evidence: strongest.evidence || "Stored pain signals suggest speed risk.",
        strength: 76,
        softened: true,
      };
    case "DESIGN":
      return {
        observedIssue: "The site does not fully reflect the quality of the business.",
        observationHint: "The site does not fully reflect the quality of the business itself.",
        consequenceHint: "That mismatch can make a new customer hesitate a little longer than they should.",
        evidence: strongest.evidence || "Stored pain signals suggest visible quality issues.",
        strength: 77,
        softened: true,
      };
    case "FUNCTIONALITY":
      return {
        observedIssue: "Key parts of the site experience feel less direct than they could be.",
        observationHint: "A few parts of the site flow feel less direct than they could be.",
        consequenceHint: "That can add friction for people trying to take the next step.",
        evidence: strongest.evidence || "Stored pain signals suggest functionality issues.",
        strength: 78,
        softened: true,
      };
    case "NO_WEBSITE":
      return {
        observedIssue: "No clear website surfaced for the business.",
        observationHint: "I could not find a clear website that really shows the business online.",
        consequenceHint: "That can make it harder for new customers to understand the work or know where to start.",
        evidence: strongest.evidence || "Stored pain signals indicate no website.",
        strength: 72,
        softened: true,
      };
    default:
      return null;
  }
}

function getObservationCandidate(lead: LeadRecord) {
  const assessment = getWebsiteAssessment(lead);
  const painSignals = getPainSignals(lead);
  return getObservationFromAssessment(lead, assessment) || getObservationFromPainSignals(lead, painSignals);
}

function buildPersonalizationReason(lead: LeadRecord, observation: ReturnType<typeof getObservationCandidate>) {
  const parts = [`Email is personalized to ${lead.businessName} in ${lead.city}`];

  if (observation?.evidence) {
    parts.push(`and an observed issue: ${observation.evidence}`);
  } else if (lead.websiteStatus === "MISSING") {
    parts.push("and no usable website surfaced during the scrape");
  } else if (lead.niche) {
    parts.push(`using the ${lead.niche} context and available site signals`);
  } else {
    parts.push("using the available site and lead context without forcing a hard claim");
  }

  return parts.join(" ");
}

/**
 * The "concrete anchor" is the specific detail the LLM must weave into the
 * opening line so the email feels researched and not templated. It used to
 * hard-code "X Google reviews" whenever a review count existed, which made
 * EVERY email open with the same review mention. Now we pick deterministically
 * (based on lead id) from a pool of anchors — domain, niche, city, category,
 * website grade, contact name — so hooks rotate naturally and review counts
 * are just one option among many, never a guaranteed mention.
 */
function buildConcreteAnchor(lead: LeadRecord) {
  const domain = extractDomain(lead.websiteUrl);
  const city = lead.city?.trim() || "";
  const niche = lead.niche?.trim() || "";
  const category = lead.category?.trim() || "";
  const name = lead.businessName?.trim() || "their site";
  const grade = lead.websiteGrade?.trim() || "";
  const contactFirst = (lead.contactName || "").trim().split(/\s+/)[0] || "";
  const reviewCount = Number(lead.reviewCount || 0);

  const candidates: string[] = [];
  if (domain) candidates.push(`while clicking through ${domain}`);
  if (domain && niche) candidates.push(`poking around ${domain} looking at ${niche} shops in ${city || "the area"}`);
  if (niche && city) candidates.push(`while looking at ${niche} in ${city}`);
  if (category && city) candidates.push(`while scanning ${category} around ${city}`);
  if (domain && grade && /[DE]/i.test(grade)) candidates.push(`after poking at ${domain} for a minute on mobile`);
  if (domain && contactFirst) candidates.push(`while clicking around ${domain} and spotting ${contactFirst}'s name`);
  if (niche) candidates.push(`while looking at a few ${niche} sites tonight`);
  if (city) candidates.push(`while digging through local businesses in ${city}`);
  // Review count is allowed but only as one candidate among many, and only
  // when it is actually notable (10+). Prevents "X Google reviews" from
  // being forced into every email.
  if (domain && reviewCount >= 10) {
    candidates.push(`while looking through ${domain} (saw ${reviewCount} reviews too)`);
  }
  // Ultimate fallback: nothing specific, but still feels casual.
  candidates.push(`while looking at ${name} in ${city || "your area"}`);

  // Deterministic pick so the same lead always gets the same anchor (stable
  // across retries / regenerations), but anchors vary across leads.
  const seed = Number(lead.id || 0) || name.length + city.length;
  return candidates[seed % candidates.length];
}

function buildConfidenceScore(lead: LeadRecord, observationStrength: number, validEmail: boolean) {
  let score = 40;
  score += clamp(observationStrength - 60, 0, 30);

  if (hasModerateOrStrongServiceFit(lead)) score += 10;
  if (hasOwnerOperatorStyleContact(lead)) score += 8;
  if (Number(lead.reviewCount || 0) >= 10) score += 6;
  if (typeof lead.axiomScore === "number") score += clamp(Math.round((lead.axiomScore - 35) / 3), 0, 10);
  if (validEmail) score += 6;

  return clamp(score, 35, 95);
}

export function chooseColdEmailPlan(lead: LeadRecord, enrichment: EnrichmentResult): ColdEmailPlan {
  const validEmail = getEmailValidity(lead);
  const observation = getObservationCandidate(lead);
  const observationStrength = observation?.strength || 0;
  const confidenceScore = buildConfidenceScore(lead, observationStrength, validEmail);
  const canUseSoftCall = Boolean(
    observation &&
    confidenceScore >= 88 &&
    hasOwnerOperatorStyleContact(lead) &&
    validEmail &&
    normalizeLower(lead.emailType) === "owner" &&
    observationStrength >= 88,
  );

  const strategy: ColdEmailStrategy = canUseSoftCall
    ? "soft_call"
    : observation
      ? "observation_based"
      : "curiosity_based";

  const CTA_type: ColdEmailCtaType =
    strategy === "soft_call"
      ? "soft_call"
      : strategy === "observation_based"
        ? "observation_offer"
        : "permission_offer";

  const observedIssue = observation?.observedIssue || "No strong observation was reliable enough to force into the email.";
  const personalizationReason = buildPersonalizationReason(lead, observation);
  const concreteAnchor = buildConcreteAnchor(lead);

  let ctaHint = "Would it be helpful if I sent over 2 or 3 ideas?";
  if (CTA_type === "permission_offer") {
    ctaHint = "Happy to send a few quick observations if useful.";
  } else if (CTA_type === "soft_call") {
    ctaHint = "If helpful, I'd be happy to walk you through it briefly.";
  }

  const curiosityObservation =
    lead.websiteStatus === "MISSING"
      ? `I was looking at ${lead.businessName} and had one quick thought after not finding a clear site for it.`
      : `I was looking through ${extractDomain(lead.websiteUrl) || lead.businessName}'s site and had one quick thought.`;

  return {
    strategy,
    CTA_type,
    confidence_score: confidenceScore,
    observed_issue: observedIssue,
    personalization_reason: personalizationReason,
    concreteAnchor,
    issueEvidence: observation?.evidence || "Evidence is limited, so the email should stay curiosity-based and permission-oriented.",
    observationHint: observation?.observationHint || curiosityObservation,
    consequenceHint:
      observation?.consequenceHint ||
      "If the website is not doing enough of the trust and clarity work up front, that can create avoidable hesitation.",
    ctaHint,
    softened: observation?.softened ?? true,
    validEmail,
  };
}

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function includesAny(text: string, values: string[]) {
  const haystack = text.toLowerCase();
  return values.some((value) => haystack.includes(value.toLowerCase()));
}

export function validateColdEmailDraft(draft: ColdEmailDraft, lead: LeadRecord, plan: ColdEmailPlan): ColdEmailValidation {
  const wordCount = countWords(draft.body);
  const combined = `${draft.subject}\n${draft.body}\n${draft.personalization_reason}\n${draft.observed_issue}`;
  const combinedLower = combined.toLowerCase();
  const errors: string[] = [];

  const lengthScore = wordCount >= 45 && wordCount <= 85 ? 100 : wordCount < 45 ? 45 : 35;
  if (lengthScore < 100) {
    errors.push(`Email length must stay between 45 and 85 words. Current count: ${wordCount}.`);
  }

  const bannedHits = BANNED_EMAIL_PHRASES.filter((phrase) => combinedLower.includes(phrase));
  if (bannedHits.length > 0) {
    errors.push(`Banned phrases detected: ${bannedHits.join(", ")}.`);
  }

  if (/[—–]/.test(combined)) {
    errors.push("Em dashes are not allowed.");
  }
  if (combined.includes("!")) {
    errors.push("Exclamation marks are not allowed.");
  }

  const genericHits = GENERIC_FALLBACK_PATTERNS.filter((phrase) => combinedLower.includes(phrase));
  const genericAgencyLanguageScore = genericHits.length === 0 ? 100 : Math.max(20, 100 - genericHits.length * 35);
  if (genericHits.length > 0) {
    errors.push(`Generic agency language detected: ${genericHits.join(", ")}.`);
  }

  const businessMentioned = combinedLower.includes(lead.businessName.toLowerCase());
  const concreteAnchorHits = [
    lead.city,
    String(Number(lead.reviewCount || 0)),
    extractDomain(lead.websiteUrl),
    lead.niche,
    lead.category || "",
  ]
    .map((value) => normalizeLower(value))
    .filter(Boolean);
  const specificityKeywords = [
    "mobile",
    "contact",
    "quote",
    "booking",
    "book",
    "trust",
    "reviews",
    "speed",
    "scan",
    "service page",
    "website",
    "homepage",
    "first-time visitor",
  ];
  const hasConcreteAnchor = concreteAnchorHits.some((value) => combinedLower.includes(value));
  const specificityScore = businessMentioned && hasConcreteAnchor && includesAny(combinedLower, specificityKeywords)
    ? 100
    : businessMentioned && (hasConcreteAnchor || normalizeLower(draft.observed_issue) !== normalizeLower("No strong observation was reliable enough to force into the email."))
      ? 72
      : 30;
  if (specificityScore < 70) {
    errors.push("Draft is not specific enough to the business or observed issue.");
  }

  const humanTonePenaltyPatterns = [
    "best regards",
    "dear ",
    "award-winning",
    "increase conversions",
    "optimize your site",
    "digital transformation",
    "quietly cost",
    "does its job",
    "built a really strong reputation",
    "the business itself",
    "up front",
  ];
  const humanToneHits = humanTonePenaltyPatterns.filter((phrase) => combinedLower.includes(phrase));
  const humanToneScore = humanToneHits.length === 0 ? 100 : Math.max(25, 100 - humanToneHits.length * 30);
  if (humanToneHits.length > 0) {
    errors.push(`Tone still sounds too polished or templated: ${humanToneHits.join(", ")}.`);
  }

  const callPatterns = [
    "schedule a call",
    "book a call",
    "jump on a call",
    "10-minute call",
    "15-minute call",
    "zoom call",
    "quick call",
  ];
  const lowFrictionPatterns = [
    "send over",
    "send a few",
    "send a couple",
    "happy to send",
    "would it be helpful",
    "if useful",
    "want me to send",
  ];
  const callHit = includesAny(combinedLower, callPatterns);
  let ctaFrictionScore = 100;
  if (plan.CTA_type !== "soft_call" && callHit) {
    ctaFrictionScore = 20;
    errors.push("CTA is too high-friction for the selected strategy.");
  } else if (plan.CTA_type === "soft_call" && !callHit && !combinedLower.includes("walk you through")) {
    ctaFrictionScore = 55;
    errors.push("Soft call strategy was selected, but the CTA does not reflect it clearly.");
  } else if (plan.CTA_type !== "soft_call" && !includesAny(combinedLower, lowFrictionPatterns)) {
    ctaFrictionScore = 45;
    errors.push("Default CTA should stay low-friction and offer to send ideas or observations.");
  }

  if (draft.CTA_type !== plan.CTA_type) {
    errors.push(`CTA type should be ${plan.CTA_type}, received ${draft.CTA_type}.`);
  }

  if (draft.confidence_score < 0 || draft.confidence_score > 100) {
    errors.push("confidence_score must stay between 0 and 100.");
  }

  const score = Math.round(
    (specificityScore + humanToneScore + genericAgencyLanguageScore + ctaFrictionScore + lengthScore) / 5,
  );

  return {
    valid: errors.length === 0,
    score,
    wordCount,
    errors,
    checks: {
      specificity: specificityScore,
      humanTone: humanToneScore,
      genericAgencyLanguage: genericAgencyLanguageScore,
      ctaFriction: ctaFrictionScore,
      length: lengthScore,
    },
  };
}

export function buildRetryInstructions(validation: ColdEmailValidation, plan: ColdEmailPlan) {
  return [
    "The first draft did not pass validation. Rewrite it once and fix every issue below.",
    ...validation.errors.map((error) => `- ${error}`),
    `- Keep the CTA type as ${plan.CTA_type}.`,
    `- Keep the email between 45 and 85 words.`,
    "- Use plain English and make it sound like a real person who actually looked at the business.",
  ].join("\n");
}

export function buildPlainTextEmail(body: string, senderFirstName: string) {
  const escapedSender = senderFirstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const signaturePattern = new RegExp(
    `(?:\\n\\s*)?(?:best|thanks|thank you|regards),?\\s*\\n?\\s*${escapedSender}(?:\\s+hinsperger)?(?:\\s+axiom\\s+infrastructure)?\\s*$`,
    "i",
  );
  const inlineSignaturePattern = new RegExp(
    `\\s+${escapedSender}(?:\\s+hinsperger)?\\s+axiom\\s+infrastructure\\s*$`,
    "i",
  );

  const sanitized = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[â€”â€“]/g, ",")
    .replace(/[—–]/g, ",")
    .replace(/\bone last time\b/gi, "again")
    .replace(/\blast note\b/gi, "quick note")
    .replace(/\bstill broken\b/gi, "still hard to use")
    .replace(/\bbroken\b/gi, "hard to use")
    .replace(/\bcosting you leads\b/gi, "making it harder for visitors to reach out")
    .replace(/!/g, ".")
    .replace(/\r/g, "")
    .replace(/[ \t]+([,.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\n?---\s*\nFrom Axiom Infrastructure\s*\ngetaxiom\.ca\s*$/i, "")
    .replace(/\s*From Axiom Infrastructure\s+getaxiom\.ca\s*$/i, "")
    .replace(signaturePattern, "")
    .replace(inlineSignaturePattern, "")
    .trim()
    .replace(/\n{3,}/g, "\n\n");

  return `${sanitized}\n\nBest,\n${senderFirstName}`.trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHtmlEmail(bodyPlain: string) {
  const paragraphs = bodyPlain
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#111827;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  return [
    `<!DOCTYPE html>`,
    `<html>`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `</head>`,
    `<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;">`,
    `<div style="padding:0;">`,
    paragraphs,
    `</div>`,
    `</body>`,
    `</html>`,
  ].join("");
}
