import { AXIOM_OUTREACH_MIN_SCORE, getWebsiteQualityLabel, hasValidPipelineEmail } from "./lead-qualification";

export interface PainSignal {
  type:
    | "CONVERSION"
    | "SPEED"
    | "TRUST"
    | "SEO"
    | "NO_WEBSITE"
    | "DESIGN"
    | "FUNCTIONALITY"
    | "FIT"
    | "CONTACT"
    | "LOCAL";
  severity: number;
  evidence: string;
  source: "site_scan" | "ai_analysis" | "heuristic" | "maps_data";
}

export interface ScoreBreakdown {
  businessValue: number;
  painOpportunity: number;
  reachability: number;
  localFit: number;
}

export interface WebsiteAssessment {
  speedRisk: number;
  conversionRisk: number;
  trustRisk: number;
  seoRisk: number;
  overallGrade: string;
  topFixes: string[];
}

export interface ContactQuality {
  emailType: "owner" | "staff" | "generic" | "unknown";
  emailConfidence: number;
  phoneConfidence: number;
  emailFlags?: string[];
  phoneFlags?: string[];
}

export interface AxiomScoreResult {
  axiomScore: number;
  tier: string;
  breakdown: ScoreBreakdown;
  painSignals: PainSignal[];
  outreachEligible: boolean;
  hasValidEmail: boolean;
  emailGateApplied: boolean;
  websiteQuality: "NO_WEBSITE" | "WEAK_WEBSITE" | "STRONG_WEBSITE";
  websiteLabel: string;
  reasonCodes: string[];
  reasonSummary: string[];
  fitLabel: "Weak" | "Promising" | "Strong" | "Pipeline Ready";
}

const SERVICE_BUSINESS_KEYWORDS = [
  "roof",
  "roofer",
  "hvac",
  "heating",
  "cooling",
  "plumb",
  "electric",
  "landscap",
  "lawn",
  "concrete",
  "paving",
  "asphalt",
  "cleaning",
  "janitorial",
  "med spa",
  "medspa",
  "medical spa",
  "dent",
  "orthodont",
  "clinic",
  "physio",
  "chiropr",
  "auto detail",
  "detailing",
  "painting",
  "painter",
  "flooring",
  "fence",
  "fencing",
  "tree service",
  "arborist",
  "garage door",
  "window",
  "siding",
  "insulation",
  "renovat",
  "remodel",
  "cabinet",
  "kitchen",
  "pest control",
  "moving",
  "mover",
  "pool",
  "solar",
  "vet",
  "veterinar",
];

const MODERATE_FIT_KEYWORDS = [
  "law",
  "lawyer",
  "realtor",
  "real estate",
  "insurance",
  "broker",
  "accounting",
  "bookkeeping",
  "consulting",
  "photography",
  "wellness",
  "fitness",
  "gym",
  "spa",
  "salon",
  "barber",
];

const LOW_FIT_KEYWORDS = [
  "food truck",
  "thrift",
  "charity",
  "nonprofit",
  "church",
  "freelance",
  "garage sale",
  "flea market",
];

export const AXIOM_PRIORITY_CITIES = [
  "kitchener",
  "waterloo",
  "cambridge",
  "guelph",
  "hamilton",
  "london",
  "brantford",
  "stratford",
  "woodstock",
  "burlington",
  "oakville",
  "milton",
  "mississauga",
  "toronto",
];

const AXIOM_CORE_CITIES = ["kitchener", "waterloo", "cambridge", "guelph"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getWebsiteRiskScore(assessment: WebsiteAssessment | null) {
  if (!assessment) return null;
  return assessment.speedRisk + assessment.conversionRisk + assessment.trustRisk + assessment.seoRisk;
}

function classifyWebsiteQuality(
  websiteStatus: string,
  assessment: WebsiteAssessment | null,
  painSignals: PainSignal[],
): AxiomScoreResult["websiteQuality"] {
  if (websiteStatus === "MISSING") {
    return "NO_WEBSITE";
  }

  const risk = getWebsiteRiskScore(assessment);
  const severeWebsitePain = painSignals.some(
    (signal) =>
      (signal.type === "CONVERSION" ||
        signal.type === "DESIGN" ||
        signal.type === "SPEED" ||
        signal.type === "TRUST" ||
        signal.type === "FUNCTIONALITY") &&
      signal.severity >= 3,
  );

  if ((typeof risk === "number" && risk <= 5) || assessment?.overallGrade === "A" || assessment?.overallGrade === "B") {
    return severeWebsitePain ? "WEAK_WEBSITE" : "STRONG_WEBSITE";
  }

  return "WEAK_WEBSITE";
}

function scoreServiceFit(text: string) {
  if (SERVICE_BUSINESS_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 10;
  }

  if (MODERATE_FIT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 6;
  }

  if (LOW_FIT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 1;
  }

  return 4;
}

type ScoreBusinessValueInput = {
  niche: string;
  category: string;
  rating: number;
  reviewCount: number;
  websiteStatus: string;
  websiteContent: string;
  verticalConfidence?: "high" | "medium" | "low";
  siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
  servicePageCount?: number;
  aboutPageExists?: boolean;
  evidenceQuality?: number;
};

export function scoreBusinessValue(
  niche: string,
  category: string,
  rating: number,
  reviewCount: number,
  websiteContent: string,
  websiteStatus?: string,
): number;
export function scoreBusinessValue(input: ScoreBusinessValueInput): number;
export function scoreBusinessValue(
  inputOrNiche: ScoreBusinessValueInput | string,
  category?: string,
  rating?: number,
  reviewCount?: number,
  websiteContent?: string,
  websiteStatus = "ACTIVE",
) {
  const input: ScoreBusinessValueInput =
    typeof inputOrNiche === "string"
      ? {
          niche: inputOrNiche,
          category: category || "",
          rating: rating || 0,
          reviewCount: reviewCount || 0,
          websiteStatus,
          websiteContent: websiteContent || "",
        }
      : inputOrNiche;

  const text = normalizeText(input.niche, input.category, input.websiteContent);
  let score = 0;

  score += scoreServiceFit(text);

  if (input.reviewCount >= 100 && input.rating >= 4.1) score += 8;
  else if (input.reviewCount >= 40 && input.rating >= 3.8) score += 6;
  else if (input.reviewCount >= 15) score += 4;
  else if (input.reviewCount >= 5) score += 2;

  const revenueSurfaceSignals = [
    "services",
    "quote",
    "estimate",
    "book",
    "schedule",
    "appointment",
    "locations",
    "team",
    "financing",
    "projects",
    "gallery",
    "portfolio",
  ].filter((signal) => text.includes(signal)).length;
  score += clamp(revenueSurfaceSignals, 0, 7);

  if (input.websiteStatus === "MISSING" && input.reviewCount >= 5) {
    score += 2;
  }

  if (input.verticalConfidence === "high") score += 4;
  else if (input.verticalConfidence === "medium") score += 1;
  else if (input.verticalConfidence === "low") score -= 5;

  if ((input.servicePageCount || 0) >= 2) score += 2;
  if (input.aboutPageExists) score += 1;
  if (input.siteType === "directory" || input.siteType === "placeholder") score -= 3;
  if (typeof input.evidenceQuality === "number" && input.evidenceQuality < 0.45) score -= 3;

  return clamp(score, 0, 25);
}

type ScorePainOpportunityInput = {
  websiteStatus: string;
  assessment: WebsiteAssessment | null;
  painSignals: PainSignal[];
  reviewCount: number;
  siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
  servicePageCount?: number;
  quoteIntentDetected?: boolean;
  directoryShellDetected?: boolean;
  placeholderDetected?: boolean;
};

export function scorePainOpportunity(
  websiteStatus: string,
  assessment: WebsiteAssessment | null,
  painSignals: PainSignal[],
  reviewCount: number,
): number;
export function scorePainOpportunity(input: ScorePainOpportunityInput): number;
export function scorePainOpportunity(
  inputOrWebsiteStatus: ScorePainOpportunityInput | string,
  assessment?: WebsiteAssessment | null,
  painSignals: PainSignal[] = [],
  reviewCount = 0,
) {
  const input: ScorePainOpportunityInput =
    typeof inputOrWebsiteStatus === "string"
      ? {
          websiteStatus: inputOrWebsiteStatus,
          assessment: assessment || null,
          painSignals,
          reviewCount,
        }
      : inputOrWebsiteStatus;

  let score = 0;

  if (input.websiteStatus === "MISSING") {
    score += input.reviewCount >= 5 ? 22 : 15;
  }

  if (input.siteType === "directory" || input.directoryShellDetected) {
    score += input.reviewCount >= 8 ? 14 : 8;
  }

  if (input.siteType === "placeholder" || input.placeholderDetected) {
    score += input.reviewCount >= 8 ? 12 : 7;
  }

  if (input.assessment && input.websiteStatus === "ACTIVE") {
    score += clamp(input.assessment.conversionRisk * 3, 0, 15);
    score += clamp(input.assessment.trustRisk * 2, 0, 8);
    score += clamp(input.assessment.speedRisk * 2, 0, 6);
    score += clamp(input.assessment.seoRisk, 0, 4);
  }

  const severePainSignals = input.painSignals.filter((signal) => signal.severity >= 3).length;
  const moderatePainSignals = input.painSignals.filter((signal) => signal.severity === 2).length;
  score += clamp(severePainSignals * 2 + moderatePainSignals, 0, 8);

  if ((input.servicePageCount || 0) === 0 && input.websiteStatus === "ACTIVE") {
    score += 2;
  }
  if (!input.quoteIntentDetected && input.websiteStatus === "ACTIVE") {
    score += 2;
  }

  if (input.websiteStatus === "ACTIVE" && severePainSignals === 0 && moderatePainSignals === 0) {
    score = Math.min(score, 10);
  }

  return clamp(score, 0, 35);
}

type ScoreReachabilityInput = {
  contact: ContactQuality;
  hasContactForm: boolean;
  hasSocialMessaging: boolean;
  contactChannelCount?: number;
  actionability?: "high" | "medium" | "low";
  siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
};

export function scoreReachability(
  contact: ContactQuality,
  hasContactForm: boolean,
  hasSocialMessaging: boolean,
): number;
export function scoreReachability(input: ScoreReachabilityInput): number;
export function scoreReachability(
  inputOrContact: ScoreReachabilityInput | ContactQuality,
  hasContactForm = false,
  hasSocialMessaging = false,
) {
  const input: ScoreReachabilityInput =
    "contact" in inputOrContact
      ? inputOrContact
      : {
          contact: inputOrContact,
          hasContactForm,
          hasSocialMessaging,
        };

  let score = 0;

  const email = {
    email: "present",
    emailConfidence: input.contact.emailConfidence,
    emailType: input.contact.emailType,
    emailFlags: input.contact.emailFlags || [],
  };

  if (hasValidPipelineEmail(email)) {
    score += 15;
  } else if (input.contact.emailType !== "unknown" && input.contact.emailConfidence >= 0.35) {
    score += 6;
  }

  score += Math.round(clamp(input.contact.phoneConfidence, 0, 1) * 6);
  if (input.hasContactForm) score += 2;
  if (input.hasSocialMessaging) score += 2;
  if ((input.contactChannelCount || 0) >= 2) score += 2;
  if (input.actionability === "high") score += 2;
  else if (input.actionability === "low") score -= 3;
  if (input.siteType === "directory" && !input.hasContactForm) score -= 2;
  if (input.siteType === "placeholder") score -= 2;

  return clamp(score, 0, 25);
}

export function scoreLocalFit(city: string, reviewContent: string, nicheText?: string, geoConfidence?: "high" | "medium" | "low"): number;
export function scoreLocalFit(city: string, reviewContent: string, nicheText = "", geoConfidence: "high" | "medium" | "low" = "medium") {
  const cityLower = city.toLowerCase().trim();
  const text = normalizeText(reviewContent, nicheText);
  let score = 0;

  if (AXIOM_CORE_CITIES.includes(cityLower)) score += 8;
  else if (AXIOM_PRIORITY_CITIES.includes(cityLower)) score += 6;
  else if (cityLower.includes("ontario") || cityLower.includes(", on")) score += 3;
  else score += 1;

  const growthSignals = ["new location", "expanding", "hiring", "book now", "book online", "quote"];
  score += clamp(growthSignals.filter((signal) => text.includes(signal)).length * 2, 0, 7);

  if (geoConfidence === "high") score += 3;
  else if (geoConfidence === "low") score -= 5;

  return clamp(score, 0, 15);
}

function countQualifyingPainSignals(painSignals: PainSignal[]) {
  return painSignals.filter((signal) => signal.severity >= 2).length;
}

export function computeTier(score: number, painSignals?: PainSignal[]) {
  if (!painSignals) {
    if (score >= 85) return "S";
    if (score >= 70) return "A";
    if (score >= 50) return "B";
    if (score >= AXIOM_OUTREACH_MIN_SCORE) return "C";
    return "D";
  }

  const qualifyingPainSignals = countQualifyingPainSignals(painSignals);
  if (score >= 90) return qualifyingPainSignals >= 2 ? "S" : "B";
  if (score >= 80) return qualifyingPainSignals >= 2 ? "A" : "B";
  if (score >= 50) return "B";
  if (score >= AXIOM_OUTREACH_MIN_SCORE) return "C";
  return "D";
}

function dedupeReasonSummary(items: string[]) {
  return Array.from(new Set(items)).slice(0, 4);
}

function buildReasonSummary(input: {
  websiteQuality: AxiomScoreResult["websiteQuality"];
  hasValidEmail: boolean;
  serviceFitScore: number;
  localFit: number;
  assessment: WebsiteAssessment | null;
  reviewCount: number;
  geoConfidence?: "high" | "medium" | "low";
  verticalConfidence?: "high" | "medium" | "low";
  siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
  evidenceQuality?: number;
}) {
  const reasons: string[] = [];
  const codes: string[] = [];

  if (input.websiteQuality === "NO_WEBSITE") {
    reasons.push("No website found, so there is immediate infrastructure upside.");
    codes.push("no_website");
  } else if (input.websiteQuality === "WEAK_WEBSITE") {
    reasons.push("The current website shows real technical or conversion weaknesses.");
    codes.push("weak_website");
  } else {
    reasons.push("The website looks stronger, so the opportunity depends more on fit and contactability.");
    codes.push("strong_website");
  }

  if (input.hasValidEmail) {
    reasons.push("A vetted email is available, so the lead is directly reachable.");
    codes.push("valid_email");
  } else {
    reasons.push("No vetted email is available, so the score is capped below outreach range.");
    codes.push("email_gate");
  }

  if (input.serviceFitScore >= 8) {
    reasons.push("This business fits Axiom's strongest local service-business profile.");
    codes.push("service_fit");
  } else if (input.serviceFitScore >= 5) {
    reasons.push("The business is a moderate fit if the site and conversion opportunity are real.");
    codes.push("moderate_fit");
  } else {
    reasons.push("This is a weaker strategic fit unless the pain is unusually strong.");
    codes.push("weak_fit");
  }

  if (input.localFit >= 8) {
    reasons.push("The location is inside Axiom's preferred operating market.");
    codes.push("priority_market");
  }

  if (input.geoConfidence === "low") {
    reasons.push("The geography match is weak, so the lead is discounted even if other signals look interesting.");
    codes.push("geo_penalty");
  }

  if (input.verticalConfidence === "low") {
    reasons.push("The business category drifts away from Axiom's strongest service-business profile.");
    codes.push("vertical_penalty");
  }

  if (input.siteType === "directory" || input.siteType === "placeholder") {
    reasons.push("The discovered web presence looks thin or indirect, which increases qualification risk.");
    codes.push("weak_web_presence");
  }

  if (input.assessment && (input.assessment.conversionRisk >= 3 || input.assessment.trustRisk >= 3)) {
    reasons.push("The site likely needs conversion and trust improvements, not just cosmetic polish.");
    codes.push("conversion_pain");
  }

  if (input.reviewCount >= 15) {
    reasons.push("The business shows enough market activity to justify a serious web infrastructure upgrade.");
    codes.push("legitimate_business");
  }

  if (typeof input.evidenceQuality === "number" && input.evidenceQuality < 0.5) {
    reasons.push("Evidence quality is weaker than ideal, so this lead stays conservative.");
    codes.push("evidence_penalty");
  }

  return {
    reasonCodes: dedupeReasonSummary(codes),
    reasonSummary: dedupeReasonSummary(reasons),
  };
}

export function computeAxiomScore(input: {
  niche: string;
  category: string;
  city: string;
  rating: number;
  reviewCount: number;
  websiteStatus: string;
  websiteContent: string;
  assessment: WebsiteAssessment | null;
  painSignals: PainSignal[];
  contact: ContactQuality;
  hasContactForm: boolean;
  hasSocialMessaging: boolean;
  reviewContent: string;
  geoConfidence?: "high" | "medium" | "low";
  verticalConfidence?: "high" | "medium" | "low";
  actionability?: "high" | "medium" | "low";
  siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
  directoryShellDetected?: boolean;
  placeholderDetected?: boolean;
  contactChannelCount?: number;
  servicePageCount?: number;
  aboutPageExists?: boolean;
  quoteIntentDetected?: boolean;
  evidenceQuality?: number;
}): AxiomScoreResult {
  const websiteQuality = classifyWebsiteQuality(input.websiteStatus, input.assessment, input.painSignals);
  const serviceFitScore = scoreServiceFit(normalizeText(input.niche, input.category));
  const businessValue = scoreBusinessValue(input);
  const painOpportunity = scorePainOpportunity(input);
  const reachability = scoreReachability(input);
  const localFit = scoreLocalFit(input.city, input.reviewContent, normalizeText(input.niche, input.category), input.geoConfidence);
  const rawScore = clamp(businessValue + painOpportunity + reachability + localFit, 0, 100);

  const hasValidEmail = hasValidPipelineEmail({
    email: "present",
    emailConfidence: input.contact.emailConfidence,
    emailType: input.contact.emailType,
    emailFlags: input.contact.emailFlags || [],
  });

  const axiomScore = hasValidEmail ? rawScore : Math.min(rawScore, AXIOM_OUTREACH_MIN_SCORE - 1);
  const tier = computeTier(axiomScore);
  const outreachEligible = hasValidEmail && axiomScore > AXIOM_OUTREACH_MIN_SCORE;
  const emailGateApplied = !hasValidEmail && rawScore >= AXIOM_OUTREACH_MIN_SCORE;

  const websiteRiskScore = getWebsiteRiskScore(input.assessment);
  const { reasonCodes, reasonSummary } = buildReasonSummary({
    assessment: input.assessment,
    evidenceQuality: input.evidenceQuality,
    geoConfidence: input.geoConfidence,
    hasValidEmail,
    localFit,
    reviewCount: input.reviewCount,
    serviceFitScore,
    siteType: input.siteType,
    verticalConfidence: input.verticalConfidence,
    websiteQuality,
  });

  return {
    axiomScore,
    tier,
    breakdown: {
      businessValue,
      painOpportunity,
      reachability,
      localFit,
    },
    painSignals: input.painSignals,
    outreachEligible,
    hasValidEmail,
    emailGateApplied,
    websiteQuality,
    websiteLabel: getWebsiteQualityLabel(input.websiteStatus, input.assessment?.overallGrade, websiteRiskScore),
    reasonCodes,
    reasonSummary,
    fitLabel: outreachEligible
      ? axiomScore >= 70
        ? "Pipeline Ready"
        : "Strong"
      : axiomScore >= AXIOM_OUTREACH_MIN_SCORE
        ? "Promising"
        : "Weak",
  };
}

function buildBackfillPainSignals(lead: {
  websiteStatus: string | null;
  reviewCount: number | null;
  tacticalNote: string | null;
}) {
  const painSignals: PainSignal[] = [];

  if (lead.websiteStatus === "MISSING") {
    painSignals.push({
      type: "NO_WEBSITE",
      severity: 4,
      evidence: "No website found for the business.",
      source: "maps_data",
    });
  }

  const note = (lead.tacticalNote || "").toLowerCase();
  if (note.includes("outdated") || note.includes("poor") || note.includes("broken") || note.includes("cheap")) {
    painSignals.push({
      type: "DESIGN",
      severity: 3,
      evidence: "Stored analysis notes indicate visible website quality issues.",
      source: "ai_analysis",
    });
  }
  if (
    note.includes("no cta") ||
    note.includes("no form") ||
    note.includes("no booking") ||
    note.includes("hard to contact") ||
    note.includes("weak conversion")
  ) {
    painSignals.push({
      type: "CONVERSION",
      severity: 3,
      evidence: "Stored notes suggest weak conversion structure.",
      source: "ai_analysis",
    });
  }

  if ((lead.reviewCount || 0) >= 10 && lead.websiteStatus === "MISSING") {
    painSignals.push({
      type: "CONVERSION",
      severity: 3,
      evidence: "The business is active enough that missing web presence likely costs real demand.",
      source: "heuristic",
    });
  }

  return painSignals;
}

function validateContactBasic(email: string | null, phone: string | null): ContactQuality {
  const emailValue = (email || "").toLowerCase().trim();
  const flags: string[] = [];

  let emailType: ContactQuality["emailType"] = "unknown";
  let emailConfidence = 0;
  if (emailValue) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      flags.push("invalid_format");
    } else if (/^(info|contact|hello|office|admin|support|sales|bookings?)@/.test(emailValue)) {
      emailType = "generic";
      emailConfidence = emailValue.includes("@gmail.") || emailValue.includes("@yahoo.")
        ? 0.28
        : 0.48;
    } else if (
      emailValue.includes("@gmail.") ||
      emailValue.includes("@outlook.") ||
      emailValue.includes("@hotmail.") ||
      emailValue.includes("@icloud.")
    ) {
      emailType = "staff";
      emailConfidence = 0.42;
    } else {
      emailType = "owner";
      emailConfidence = 0.78;
    }
  } else {
    flags.push("no_email");
  }

  let phoneConfidence = 0;
  if (phone && phone.replace(/\D/g, "").length >= 10) {
    phoneConfidence = 0.8;
  }

  return {
    emailType,
    emailConfidence,
    phoneConfidence,
    emailFlags: flags,
    phoneFlags: [],
  };
}

export function computeAxiomScoreFromDbLead(lead: {
  niche: string;
  category: string | null;
  city: string;
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: string | null;
  email: string | null;
  phone: string | null;
  socialLink: string | null;
  contactName: string | null;
  tacticalNote: string | null;
}) {
  return computeAxiomScore({
    niche: lead.niche,
    category: lead.category || "",
    city: lead.city,
    rating: lead.rating || 0,
    reviewCount: lead.reviewCount || 0,
    websiteStatus: lead.websiteStatus || "MISSING",
    websiteContent: lead.tacticalNote || "",
    assessment: null,
    painSignals: buildBackfillPainSignals(lead),
    contact: validateContactBasic(lead.email, lead.phone),
    hasContactForm: false,
    hasSocialMessaging: Boolean(lead.socialLink && lead.socialLink.length > 0),
    reviewContent: lead.tacticalNote || "",
  });
}
