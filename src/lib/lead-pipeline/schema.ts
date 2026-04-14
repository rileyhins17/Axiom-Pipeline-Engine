import { z } from "zod";

export const PIPELINE_FACTS_VERSION = "2026-04-10.0";
export const PIPELINE_ASSESSMENT_PROMPT_VERSION = "assessment-v2";
export const PIPELINE_EMAIL_PROMPT_VERSION = "email-v1";

const discoveryQualitySchema = z.object({
  actionability: z.enum(["high", "medium", "low"]).default("medium"),
  geoConfidence: z.enum(["high", "medium", "low"]).default("medium"),
  qualityFlags: z.array(z.string()).default([]),
  qualityNotes: z.array(z.string()).default([]),
  qualityScore: z.number().int().min(0).max(100).default(50),
  retainedReason: z.string().default("Discovery result retained."),
  verticalConfidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export const websiteRenderSummarySchema = z.object({
  heroHeading: z.string().nullable(),
  supportingLine: z.string().nullable(),
  primaryCTA: z.string().nullable(),
  headingCount: z.number().int().nonnegative(),
  sectionCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  buttonCount: z.number().int().nonnegative(),
  formCount: z.number().int().nonnegative(),
  navLinkCount: z.number().int().nonnegative(),
  contentDensity: z.enum(["sparse", "balanced", "dense"]),
  visualClutterRisk: z.enum(["low", "medium", "high"]),
  mobileReadabilityRisk: z.enum(["low", "medium", "high"]),
  visualSignals: z.array(z.string()),
  aboveFoldText: z.string().nullable(),
  accessibilityNotes: z.array(z.string()),
});

export const DEFAULT_WEBSITE_RENDER_SUMMARY = {
  heroHeading: null,
  supportingLine: null,
  primaryCTA: null,
  headingCount: 0,
  sectionCount: 0,
  imageCount: 0,
  buttonCount: 0,
  formCount: 0,
  navLinkCount: 0,
  contentDensity: "sparse" as const,
  visualClutterRisk: "low" as const,
  mobileReadabilityRisk: "low" as const,
  visualSignals: [],
  aboveFoldText: null,
  accessibilityNotes: [],
};

export const evidenceSnippetSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["google_places", "website_homepage", "website_internal", "legacy_projection", "derived"]),
  label: z.string().min(1),
  snippet: z.string().min(1),
  reference: z.string().nullable().optional(),
});

export const discoveredLeadSchema = z.object({
  businessName: z.string().min(1),
  primaryCategory: z.string().nullable(),
  secondaryCategories: z.array(z.string()).default([]),
  placeId: z.string().min(1),
  formattedAddress: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  googleMapsUrl: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  businessStatus: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  source: z.literal("google_places"),
  discoveryQuery: z.string().min(1),
  discoveredAt: z.string().datetime(),
  sourceKey: z.string().nullable().optional(),
  normalizedNiche: z.string().nullable().default(null),
  normalizedCity: z.string().nullable().default(null),
  queryVariant: z.string().nullable().default(null),
  discoveryQuality: discoveryQualitySchema.default({
    actionability: "medium",
    geoConfidence: "medium",
    qualityFlags: [],
    qualityNotes: [],
    qualityScore: 50,
    retainedReason: "Discovery result retained.",
    verticalConfidence: "medium",
  }),
  rawPayload: z.record(z.string(), z.unknown()),
});

export const websiteInspectionResultSchema = z.object({
  websiteExists: z.boolean(),
  homepageReachable: z.boolean(),
  responseStatus: z.number().int().nullable(),
  sslStatus: z.enum(["valid", "invalid", "unknown"]),
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  navItems: z.array(z.string()),
  contactPageExists: z.boolean(),
  contactFormExists: z.boolean(),
  bookingDetected: z.boolean(),
  menuDetected: z.boolean(),
  galleryDetected: z.boolean(),
  testimonialsDetected: z.boolean(),
  ctaTexts: z.array(z.string()),
  socialLinks: z.array(z.string()),
  embeddedMapDetected: z.boolean(),
  emailsFound: z.array(z.string()),
  phonesFound: z.array(z.string()),
  techHints: z.array(z.string()),
  internalPages: z.array(z.string()),
  pageCountEstimate: z.number().int().nonnegative(),
  servicePageCount: z.number().int().nonnegative().default(0),
  aboutPageExists: z.boolean().default(false),
  teamPageExists: z.boolean().default(false),
  quoteIntentDetected: z.boolean().default(false),
  directoryShellDetected: z.boolean().default(false),
  placeholderDetected: z.boolean().default(false),
  businessNameLikelyPresent: z.boolean().default(false),
  siteType: z.enum(["business", "directory", "placeholder", "parked", "social", "unknown"]).default("unknown"),
  contactChannelCount: z.number().int().nonnegative().default(0),
  qualityFlags: z.array(z.string()).default([]),
  mobileViewportMissing: z.boolean(),
  mobileOverflowDetected: z.boolean(),
  brokenFlags: z.array(z.string()),
  performanceSignals: z.object({
    fetchDurationMs: z.number().nonnegative().nullable(),
    domContentLoadedMs: z.number().nonnegative().nullable(),
    loadEventMs: z.number().nonnegative().nullable(),
  }),
  renderSummary: websiteRenderSummarySchema.default(DEFAULT_WEBSITE_RENDER_SUMMARY),
  renderStrategy: z.enum(["fetch", "playwright"]),
  finalUrl: z.string().nullable(),
  extractedText: z.string().nullable(),
  evidence: z.array(evidenceSnippetSchema),
  rawPayload: z.record(z.string(), z.unknown()),
  errorMessage: z.string().nullable().optional(),
});

export const leadFactsSchema = z.object({
  identity: z.object({
    businessName: z.string().min(1),
    placeId: z.string().nullable(),
    primaryCategory: z.string().nullable(),
    secondaryCategories: z.array(z.string()),
  }),
  location: z.object({
    formattedAddress: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    googleMapsUrl: z.string().nullable(),
  }),
  contact: z.object({
    phone: z.string().nullable(),
    website: z.string().nullable(),
    emails: z.array(z.string()),
    phonesFound: z.array(z.string()),
    socialLinks: z.array(z.string()),
  }),
  discovery: z.object({
    source: z.string().min(1),
    discoveryQuery: z.string().min(1),
    discoveredAt: z.string().datetime(),
    businessStatus: z.string().nullable(),
    rating: z.number().nullable(),
    reviewCount: z.number().int().nullable(),
    normalizedNiche: z.string().nullable().default(null),
    normalizedCity: z.string().nullable().default(null),
    queryVariant: z.string().nullable().default(null),
    geoConfidence: z.enum(["high", "medium", "low"]).default("medium"),
    verticalConfidence: z.enum(["high", "medium", "low"]).default("medium"),
    actionability: z.enum(["high", "medium", "low"]).default("medium"),
    qualityFlags: z.array(z.string()).default([]),
  }),
  website: z.object({
    websiteExists: z.boolean(),
    homepageReachable: z.boolean(),
    responseStatus: z.number().int().nullable(),
    sslStatus: z.enum(["valid", "invalid", "unknown"]),
    title: z.string().nullable(),
    metaDescription: z.string().nullable(),
    navItems: z.array(z.string()),
    internalPages: z.array(z.string()),
    pageCountEstimate: z.number().int().nonnegative(),
    techHints: z.array(z.string()),
    renderStrategy: z.enum(["fetch", "playwright", "unavailable"]),
    servicePageCount: z.number().int().nonnegative().default(0),
    directoryShellDetected: z.boolean().default(false),
    placeholderDetected: z.boolean().default(false),
    businessNameLikelyPresent: z.boolean().default(false),
    siteType: z.enum(["business", "directory", "placeholder", "parked", "social", "unknown"]).default("unknown"),
    contactChannelCount: z.number().int().nonnegative().default(0),
    qualityFlags: z.array(z.string()).default([]),
  }),
  rendering: websiteRenderSummarySchema.default(DEFAULT_WEBSITE_RENDER_SUMMARY),
  features: z.object({
    contactPageExists: z.boolean(),
    contactFormExists: z.boolean(),
    aboutPageExists: z.boolean().default(false),
    teamPageExists: z.boolean().default(false),
    bookingDetected: z.boolean(),
    menuDetected: z.boolean(),
    galleryDetected: z.boolean(),
    testimonialsDetected: z.boolean(),
    embeddedMapDetected: z.boolean(),
    quoteIntentDetected: z.boolean().default(false),
    servicePageCount: z.number().int().nonnegative().default(0),
    trustSignalCount: z.number().int().nonnegative().default(0),
    ctaTexts: z.array(z.string()),
  }),
  ux: z.object({
    mobileViewportMissing: z.boolean(),
    mobileOverflowDetected: z.boolean(),
    brokenFlags: z.array(z.string()),
    performanceSignals: z.object({
      fetchDurationMs: z.number().nonnegative().nullable(),
      domContentLoadedMs: z.number().nonnegative().nullable(),
      loadEventMs: z.number().nonnegative().nullable(),
    }),
  }),
  extractionConfidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSnippetSchema),
});

export const assessmentPainSignalSchema = z.object({
  type: z.enum(["CONVERSION", "SPEED", "TRUST", "SEO", "NO_WEBSITE", "DESIGN", "FUNCTIONALITY", "CONTACT", "FIT", "LOCAL"]),
  summary: z.string().min(1).max(220),
  severity: z.number().int().min(1).max(5),
  evidenceRefs: z.array(z.string()).min(1),
});

export const leadAssessmentSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  fitTier: z.enum(["S", "A", "B", "C"]),
  painSignals: z.array(assessmentPainSignalSchema).max(4),
  outreachAngle: z.string().min(1).max(220),
  personalizationLine: z.string().min(1).max(220),
  assessmentConfidence: z.number().min(0).max(1),
  reasonFlags: z.array(z.string()).max(8),
  disqualifierFlags: z.array(z.string()).max(8),
  summaryForOperator: z.string().min(1).max(280),
  valueProposition: z.string().min(1).max(220),
  pitchAngle: z.string().min(1).max(220),
  anticipatedObjections: z.array(z.string()).min(2).max(3),
  emailTone: z.enum(["casual", "professional", "urgent"]),
  keyPainPoint: z.string().min(1).max(180),
  competitiveEdge: z.string().min(1).max(220),
  recommendedCTA: z.string().min(1).max(140),
});

export const emailDraftSchema = z.object({
  subject: z.string().min(1).max(90),
  opener: z.string().min(1).max(140),
  observation: z.string().min(1).max(180),
  valueProposition: z.string().min(1).max(180),
  cta: z.string().min(1).max(140),
  personalizationStrength: z.number().min(0).max(1),
  selectedEvidenceRefs: z.array(z.string()).min(1).max(3),
});

export const sendDecisionSchema = z.object({
  decision: z.enum(["auto-send", "review-recommended", "blocked"]),
  reasons: z.array(z.string()).min(1).max(8),
  checks: z.object({
    extractionConfidence: z.number().min(0).max(1),
    assessmentConfidence: z.number().min(0).max(1),
    personalizationStrength: z.number().min(0).max(1),
    hasValidEmail: z.boolean(),
    fitScore: z.number().int().min(0).max(100),
    hallucinationRisk: z.enum(["low", "medium", "high"]),
    requiredFieldsPresent: z.boolean(),
  }),
});

export const pipelineArtifactsSchema = z.object({
  sourceRecord: discoveredLeadSchema,
  websiteInspection: websiteInspectionResultSchema.nullable(),
  facts: leadFactsSchema,
  assessment: leadAssessmentSchema,
  assessmentMeta: z.object({
    model: z.string().min(1),
    promptVersion: z.string().min(1),
  }).default({
    model: "deterministic-fallback",
    promptVersion: PIPELINE_ASSESSMENT_PROMPT_VERSION,
  }),
});

export type EvidenceSnippet = z.infer<typeof evidenceSnippetSchema>;
export type DiscoveredLead = z.infer<typeof discoveredLeadSchema>;
export type WebsiteInspectionResult = z.infer<typeof websiteInspectionResultSchema>;
export type WebsiteRenderSummary = z.infer<typeof websiteRenderSummarySchema>;
export type LeadFacts = z.infer<typeof leadFactsSchema>;
export type AssessmentPainSignal = z.infer<typeof assessmentPainSignalSchema>;
export type LeadAssessment = z.infer<typeof leadAssessmentSchema>;
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export type SendDecision = z.infer<typeof sendDecisionSchema>;
export type PipelineArtifacts = z.infer<typeof pipelineArtifactsSchema>;
