import { computeAxiomScore } from "@/lib/axiom-scoring";
import { validateContact } from "@/lib/contact-validation";
import { extractDomain, generateDedupeKey } from "@/lib/dedupe";
import { checkDisqualifiers } from "@/lib/disqualifiers";
import { generatePersonalization } from "@/lib/lead-personalization";
import type { LeadRecord } from "@/lib/prisma";
import type { ScrapeLeadWriteInput } from "@/lib/scrape-jobs";

import { assessLeadFacts } from "@/lib/lead-pipeline/assessment";
import {
  buildLegacyEnrichmentResult,
  buildLegacyFollowUpQuestion,
  buildLegacyPainSignals,
  buildLegacyTacticalNote,
  buildLegacyWebsiteAssessment,
  computeLegacyWebsiteStatus,
  selectBestLeadEmail,
  selectPrimaryPhone,
  selectPrimarySocialLink,
} from "@/lib/lead-pipeline/compatibility";
import { draftLeadEmail } from "@/lib/lead-pipeline/email-drafting";
import {
  buildEmailPromptVersion,
} from "@/lib/lead-pipeline/email-prompt";
import {
  createLeadAssessmentRecord,
  createLeadDraftRecord,
  createLeadFactsRecord,
  createSendDecisionRecord,
  getLatestLeadAssessment,
  getLatestLeadDraft,
  getLatestLeadFacts,
  getLatestSendDecision,
} from "@/lib/lead-pipeline/repository";
import { decideLeadSendability } from "@/lib/lead-pipeline/send-decision";
import { getPrisma } from "@/lib/prisma";
import {
  DEFAULT_WEBSITE_RENDER_SUMMARY,
  discoveredLeadSchema,
  leadFactsSchema,
  pipelineArtifactsSchema,
  type DiscoveredLead,
  type LeadFacts,
  type PipelineArtifacts,
  type WebsiteInspectionResult,
} from "@/lib/lead-pipeline/schema";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

function evidenceId(prefix: string, index: number) {
  return `${prefix}_${index + 1}`;
}

function buildDiscoveryEvidence(discovered: DiscoveredLead) {
  return uniqueStrings([
    discovered.businessName ? `Business name: ${discovered.businessName}` : null,
    discovered.primaryCategory ? `Primary category: ${discovered.primaryCategory}` : null,
    discovered.formattedAddress ? `Address: ${discovered.formattedAddress}` : null,
    discovered.phone ? `Phone: ${discovered.phone}` : null,
    discovered.website ? `Website: ${discovered.website}` : null,
    typeof discovered.reviewCount === "number" ? `Google reviews: ${discovered.reviewCount}` : null,
    typeof discovered.rating === "number" ? `Google rating: ${discovered.rating}` : null,
  ]).map((snippet, index) => ({
    id: evidenceId("places", index),
    source: "google_places" as const,
    label: "Google Places",
    snippet,
    reference: discovered.googleMapsUrl,
  }));
}

function buildDerivedEvidence(input: {
  discovered: DiscoveredLead;
  inspection: WebsiteInspectionResult | null;
}) {
  const review = input.discovered.discoveryQuality;
  const inspection = input.inspection;

  return uniqueStrings([
    review.geoConfidence === "high" ? `Exact target geography match for ${input.discovered.city || input.discovered.formattedAddress || "the discovery result"}.` : null,
    review.verticalConfidence === "high" && input.discovered.primaryCategory
      ? `Provider category aligns strongly with target niche: ${input.discovered.primaryCategory}.`
      : null,
    review.actionability === "high" ? "Discovery surfaced a direct contact path or strong commercial signals." : null,
    inspection?.directoryShellDetected ? "The discovered website behaves more like a directory or listing shell than a direct business site." : null,
    inspection?.placeholderDetected ? "The discovered website shows placeholder or parked-domain signals." : null,
    inspection?.businessNameLikelyPresent ? "The expected business name is visible on the inspected site." : null,
    inspection && !inspection.businessNameLikelyPresent && input.discovered.businessName
      ? `The expected business name was not clearly detected on the inspected site for ${input.discovered.businessName}.`
      : null,
    inspection?.servicePageCount && inspection.servicePageCount > 0
      ? `Service-page structure detected across ${inspection.servicePageCount} internal page(s).`
      : null,
    inspection?.contactChannelCount && inspection.contactChannelCount > 1
      ? `Multiple deterministic contact channels were found on the website.`
      : null,
  ]).map((snippet, index) => ({
    id: evidenceId("derived", index),
    source: "derived" as const,
    label: "Deterministic quality signal",
    snippet,
    reference: input.inspection?.finalUrl || input.discovered.googleMapsUrl,
  }));
}

export function buildLeadFactsFromDiscovery(input: {
  discovered: DiscoveredLead;
  inspection: WebsiteInspectionResult | null;
}): LeadFacts {
  const discoveryEvidence = buildDiscoveryEvidence(input.discovered);
  const inspectionEvidence = input.inspection?.evidence || [];
  const derivedEvidence = buildDerivedEvidence(input);
  const evidence = [...discoveryEvidence, ...inspectionEvidence, ...derivedEvidence];
  const rendering = input.inspection?.renderSummary || DEFAULT_WEBSITE_RENDER_SUMMARY;
  const extractionConfidence = clamp(
    0.36 +
      (input.inspection?.homepageReachable ? 0.12 : 0) +
      ((input.inspection?.emailsFound.length || 0) > 0 ? 0.12 : 0) +
      ((input.inspection?.phonesFound.length || 0) > 0 ? 0.08 : 0) +
      (input.inspection?.contactFormExists ? 0.06 : 0) +
      ((input.inspection?.title ? 1 : 0) + (input.inspection?.metaDescription ? 1 : 0)) * 0.04 +
      (input.discovered.website ? 0.08 : 0) +
      (input.discovered.discoveryQuality.geoConfidence === "high" ? 0.08 : input.discovered.discoveryQuality.geoConfidence === "medium" ? 0.03 : -0.06) +
      (input.discovered.discoveryQuality.verticalConfidence === "high" ? 0.08 : input.discovered.discoveryQuality.verticalConfidence === "medium" ? 0.02 : -0.07) +
      (input.inspection?.businessNameLikelyPresent ? 0.06 : input.inspection ? -0.04 : 0) +
      (input.inspection?.servicePageCount ? Math.min(0.08, input.inspection.servicePageCount * 0.02) : 0) +
      (input.inspection?.directoryShellDetected ? -0.1 : 0) +
      (input.inspection?.placeholderDetected ? -0.08 : 0) +
      (input.inspection?.renderStrategy === "playwright" ? 0.03 : 0) +
      (rendering.heroHeading || rendering.primaryCTA || rendering.supportingLine ? 0.03 : 0) +
      (rendering.visualClutterRisk === "high" ? -0.02 : 0) +
      (rendering.mobileReadabilityRisk === "high" ? -0.03 : 0),
    0.22,
    0.99,
  );

  return leadFactsSchema.parse({
    identity: {
      businessName: input.discovered.businessName,
      placeId: input.discovered.placeId,
      primaryCategory: input.discovered.primaryCategory,
      secondaryCategories: input.discovered.secondaryCategories,
    },
    location: {
      formattedAddress: input.discovered.formattedAddress,
      city: input.discovered.city,
      region: input.discovered.region,
      postalCode: input.discovered.postalCode,
      country: input.discovered.country,
      lat: input.discovered.lat,
      lng: input.discovered.lng,
      googleMapsUrl: input.discovered.googleMapsUrl,
    },
    contact: {
      phone: input.discovered.phone,
      website: input.discovered.website,
      emails: input.inspection?.emailsFound || [],
      phonesFound: uniqueStrings([input.discovered.phone, ...(input.inspection?.phonesFound || [])]),
      socialLinks: input.inspection?.socialLinks || [],
    },
    discovery: {
      source: input.discovered.source,
      discoveryQuery: input.discovered.discoveryQuery,
      discoveredAt: input.discovered.discoveredAt,
      businessStatus: input.discovered.businessStatus,
      rating: input.discovered.rating,
      reviewCount: input.discovered.reviewCount,
      normalizedNiche: input.discovered.normalizedNiche,
      normalizedCity: input.discovered.normalizedCity,
      queryVariant: input.discovered.queryVariant,
      geoConfidence: input.discovered.discoveryQuality.geoConfidence,
      verticalConfidence: input.discovered.discoveryQuality.verticalConfidence,
      actionability: input.discovered.discoveryQuality.actionability,
      qualityFlags: input.discovered.discoveryQuality.qualityFlags,
    },
    website: {
      websiteExists: Boolean(input.discovered.website),
      homepageReachable: input.inspection?.homepageReachable || false,
      responseStatus: input.inspection?.responseStatus ?? null,
      sslStatus: input.inspection?.sslStatus || "unknown",
      title: input.inspection?.title || null,
      metaDescription: input.inspection?.metaDescription || null,
      navItems: input.inspection?.navItems || [],
      internalPages: input.inspection?.internalPages || [],
      pageCountEstimate: input.inspection?.pageCountEstimate || 0,
      techHints: input.inspection?.techHints || [],
      renderStrategy: input.inspection?.renderStrategy || "unavailable",
      servicePageCount: input.inspection?.servicePageCount || 0,
      directoryShellDetected: input.inspection?.directoryShellDetected || false,
      placeholderDetected: input.inspection?.placeholderDetected || false,
      businessNameLikelyPresent: input.inspection?.businessNameLikelyPresent || false,
      siteType: input.inspection?.siteType || "unknown",
      contactChannelCount: input.inspection?.contactChannelCount || 0,
      qualityFlags: input.inspection?.qualityFlags || [],
    },
    rendering,
    features: {
      contactPageExists: input.inspection?.contactPageExists || false,
      contactFormExists: input.inspection?.contactFormExists || false,
      aboutPageExists: input.inspection?.aboutPageExists || false,
      teamPageExists: input.inspection?.teamPageExists || false,
      bookingDetected: input.inspection?.bookingDetected || false,
      menuDetected: input.inspection?.menuDetected || false,
      galleryDetected: input.inspection?.galleryDetected || false,
      testimonialsDetected: input.inspection?.testimonialsDetected || false,
      embeddedMapDetected: input.inspection?.embeddedMapDetected || false,
      quoteIntentDetected: input.inspection?.quoteIntentDetected || false,
      servicePageCount: input.inspection?.servicePageCount || 0,
      trustSignalCount: [
        input.inspection?.testimonialsDetected,
        input.inspection?.embeddedMapDetected,
        (input.discovered.reviewCount || 0) >= 10,
        Boolean(input.inspection?.aboutPageExists),
      ].filter(Boolean).length,
      ctaTexts: input.inspection?.ctaTexts || [],
    },
    ux: {
      mobileViewportMissing: input.inspection?.mobileViewportMissing || false,
      mobileOverflowDetected: input.inspection?.mobileOverflowDetected || false,
      brokenFlags: input.inspection?.brokenFlags || [],
      performanceSignals: input.inspection?.performanceSignals || {
        fetchDurationMs: null,
        domContentLoadedMs: null,
        loadEventMs: null,
      },
    },
    extractionConfidence,
    evidence,
  });
}

export async function buildPipelineArtifacts(input: {
  discovered: DiscoveredLead;
  inspection: WebsiteInspectionResult | null;
}) {
  const facts = buildLeadFactsFromDiscovery(input);
  const { assessment, model, promptVersion } = await assessLeadFacts(facts);
  return pipelineArtifactsSchema.parse({
    sourceRecord: discoveredLeadSchema.parse(input.discovered),
    websiteInspection: input.inspection,
    facts,
    assessment,
    assessmentMeta: {
      model,
      promptVersion,
    },
  });
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

export function buildScrapeLeadWriteInput(input: {
  city: string;
  niche: string;
  artifacts: PipelineArtifacts;
}): ScrapeLeadWriteInput & { pipelineArtifacts: PipelineArtifacts } {
  const facts = input.artifacts.facts;
  const assessment = input.artifacts.assessment;
  const legacyWebsiteAssessment = buildLegacyWebsiteAssessment(facts);
  const painSignals = buildLegacyPainSignals(facts, assessment);
  const primaryPhone = selectPrimaryPhone(facts);
  const bestEmail = selectBestLeadEmail(facts);
  const websiteStatus = computeLegacyWebsiteStatus(facts);
  const contactValidation = validateContact(bestEmail.email, primaryPhone, {
    businessWebsite: facts.contact.website,
  });

  const scoreResult = computeAxiomScore({
    niche: input.niche,
    category: facts.identity.primaryCategory || input.niche,
    city: facts.location.city || input.city,
    rating: facts.discovery.rating || 0,
    reviewCount: facts.discovery.reviewCount || 0,
    websiteStatus,
    websiteContent: facts.evidence.map((item) => item.snippet).join(" "),
    assessment: legacyWebsiteAssessment,
    painSignals,
    contact: contactValidation,
    hasContactForm: facts.features.contactFormExists,
    hasSocialMessaging: facts.contact.socialLinks.length > 0,
    reviewContent: facts.evidence.map((item) => item.snippet).join(" "),
    geoConfidence: facts.discovery.geoConfidence,
    verticalConfidence: facts.discovery.verticalConfidence,
    actionability: facts.discovery.actionability,
    siteType: facts.website.siteType,
    directoryShellDetected: facts.website.directoryShellDetected,
    placeholderDetected: facts.website.placeholderDetected,
    contactChannelCount: facts.website.contactChannelCount,
    servicePageCount: facts.website.servicePageCount,
    aboutPageExists: facts.features.aboutPageExists,
    quoteIntentDetected: facts.features.quoteIntentDetected,
    evidenceQuality: facts.extractionConfidence,
  });

  const disqualifiers = checkDisqualifiers({
    assessment: legacyWebsiteAssessment,
    axiomScore: scoreResult.axiomScore,
    businessName: facts.identity.businessName,
    category: facts.identity.primaryCategory || input.niche,
    city: facts.location.city || input.city,
    niche: input.niche,
    painSignals,
    rating: facts.discovery.rating || 0,
    reviewCount: facts.discovery.reviewCount || 0,
    tier: scoreResult.tier,
    websiteContent: facts.evidence.map((item) => item.snippet).join(" "),
    websiteStatus,
    businessStatus: facts.discovery.businessStatus,
    geoConfidence: facts.discovery.geoConfidence,
    verticalConfidence: facts.discovery.verticalConfidence,
    siteType: facts.website.siteType,
    directoryShellDetected: facts.website.directoryShellDetected,
    placeholderDetected: facts.website.placeholderDetected,
    contactChannelCount: facts.website.contactChannelCount,
    extractionConfidence: facts.extractionConfidence,
  });

  const personalization = generatePersonalization({
    assessment: legacyWebsiteAssessment,
    businessName: facts.identity.businessName,
    city: facts.location.city || input.city,
    contactName: null,
    niche: input.niche,
    painSignals,
    websiteStatus,
  });

  const discovered = input.artifacts.sourceRecord;
  const dedupe = generateDedupeKey(
    facts.identity.businessName,
    facts.location.city || input.city,
    primaryPhone,
    facts.contact.website,
    facts.location.formattedAddress,
  );

  return {
    address: facts.location.formattedAddress,
    axiomScore: scoreResult.axiomScore,
    axiomTier: scoreResult.tier,
    axiomWebsiteAssessment: stringifyJson(legacyWebsiteAssessment),
    businessName: facts.identity.businessName,
    callOpener: personalization.callOpener,
    category: facts.identity.primaryCategory,
    city: facts.location.city || input.city,
    contactName: null,
    dedupeKey: dedupe.key,
    dedupeMatchedBy: dedupe.matchedBy,
    disqualifiers: disqualifiers.reasons.length > 0 ? stringifyJson(disqualifiers.reasons) : null,
    disqualifyReason: disqualifiers.primaryReason,
    email: bestEmail.email || "",
    emailConfidence: contactValidation.emailConfidence,
    emailFlags: stringifyJson(contactValidation.emailFlags),
    emailType: contactValidation.emailType,
    followUpQuestion: buildLegacyFollowUpQuestion(assessment),
    isArchived: disqualifiers.disqualified,
    lastUpdated: new Date(),
    leadScore: scoreResult.axiomScore,
    niche: input.niche,
    painSignals: stringifyJson(painSignals),
    phone: primaryPhone || "",
    phoneConfidence: contactValidation.phoneConfidence,
    phoneFlags: stringifyJson(contactValidation.phoneFlags),
    rating: facts.discovery.rating || 0,
    reviewCount: facts.discovery.reviewCount || 0,
    scoreBreakdown: stringifyJson(scoreResult.breakdown),
    socialLink: selectPrimarySocialLink(facts) || "",
    source: `google_places|${discovered.discoveryQuery}|${discovered.discoveredAt.slice(0, 10)}`,
    tacticalNote: buildLegacyTacticalNote(assessment, facts),
    websiteGrade: legacyWebsiteAssessment.overallGrade,
    websiteDomain: extractDomain(facts.contact.website),
    websiteUrl: facts.contact.website,
    websiteStatus,
    pipelineArtifacts: input.artifacts,
  };
}

export function buildFactsFromLegacyLead(lead: LeadRecord): LeadFacts {
  const evidence = uniqueStrings([
    lead.businessName ? `Business name: ${lead.businessName}` : null,
    lead.category ? `Category: ${lead.category}` : null,
    lead.address ? `Address: ${lead.address}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.websiteUrl ? `Website: ${lead.websiteUrl}` : null,
    lead.websiteStatus ? `Website status: ${lead.websiteStatus}` : null,
    typeof lead.rating === "number" ? `Rating: ${lead.rating}` : null,
    typeof lead.reviewCount === "number" ? `Review count: ${lead.reviewCount}` : null,
  ]).map((snippet, index) => ({
    id: evidenceId("legacy", index),
    source: "legacy_projection" as const,
    label: "Legacy lead row",
    snippet,
    reference: lead.websiteUrl,
  }));

  return leadFactsSchema.parse({
    identity: {
      businessName: lead.businessName,
      placeId: null,
      primaryCategory: lead.category,
      secondaryCategories: [],
    },
    location: {
      formattedAddress: lead.address,
      city: lead.city,
      region: null,
      postalCode: null,
      country: null,
      lat: null,
      lng: null,
      googleMapsUrl: null,
    },
    contact: {
      phone: lead.phone,
      website: lead.websiteUrl,
      emails: lead.email ? [lead.email] : [],
      phonesFound: lead.phone ? [lead.phone] : [],
      socialLinks: lead.socialLink ? [lead.socialLink] : [],
    },
    discovery: {
      source: lead.source || "legacy_lead",
      discoveryQuery: `${lead.niche} in ${lead.city}`,
      discoveredAt: lead.createdAt.toISOString(),
      businessStatus: null,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
    },
    website: {
      websiteExists: Boolean(lead.websiteUrl),
      homepageReachable: lead.websiteStatus === "ACTIVE",
      responseStatus: null,
      sslStatus: lead.websiteUrl?.startsWith("https://") ? "valid" : "unknown",
      title: null,
      metaDescription: null,
      navItems: [],
      internalPages: [],
      pageCountEstimate: 0,
      techHints: [],
      renderStrategy: lead.websiteUrl ? "unavailable" : "unavailable",
    },
    features: {
      contactPageExists: false,
      contactFormExists: false,
      bookingDetected: false,
      menuDetected: false,
      galleryDetected: false,
      testimonialsDetected: false,
      embeddedMapDetected: false,
      ctaTexts: [],
    },
    ux: {
      mobileViewportMissing: false,
      mobileOverflowDetected: false,
      brokenFlags: [],
      performanceSignals: {
        fetchDurationMs: null,
        domContentLoadedMs: null,
        loadEventMs: null,
      },
    },
    extractionConfidence: 0.5,
    evidence,
  });
}

export async function prepareLeadOutreachPackage(input: {
  lead: LeadRecord;
  senderName: string;
  forceRefresh?: boolean;
  skipDraftDecision?: boolean;
}) {
  let factsRecord = await getLatestLeadFacts(input.lead.id);
  if (!factsRecord) {
    const facts = buildFactsFromLegacyLead(input.lead);
    const factsId = await createLeadFactsRecord({
      leadId: input.lead.id,
      facts,
    });
    factsRecord = {
      id: factsId,
      updatedAt: new Date(),
      facts,
    };
  }

  let assessmentRecord = !input.forceRefresh ? await getLatestLeadAssessment(input.lead.id) : null;
  if (!assessmentRecord) {
    const generated = await assessLeadFacts(factsRecord.facts);
    const assessmentId = await createLeadAssessmentRecord({
      leadId: input.lead.id,
      leadFactsId: factsRecord.id,
      assessment: generated.assessment,
      model: generated.model,
      promptVersion: generated.promptVersion,
    });
    assessmentRecord = {
      id: assessmentId,
      createdAt: new Date(),
      promptVersion: generated.promptVersion,
      model: generated.model,
      assessment: generated.assessment,
    };
  }

  const bestEmail = selectBestLeadEmail(factsRecord.facts, input.lead.contactName);
  const prisma = getPrisma();
  let draftRecord = null;
  let decisionRecord = null;
  if (!input.skipDraftDecision) {
    const automationSettings = await prisma.outreachAutomationSetting.findUnique({
      where: { id: "global" },
      select: { emailSystemPrompt: true },
    });
    const emailPromptVersion = buildEmailPromptVersion(automationSettings?.emailSystemPrompt ?? null);
    draftRecord = !input.forceRefresh ? await getLatestLeadDraft(input.lead.id) : null;
    if (!draftRecord || draftRecord.promptVersion !== emailPromptVersion) {
      const drafted = await draftLeadEmail({
        facts: factsRecord.facts,
        assessment: assessmentRecord.assessment,
        senderName: input.senderName,
        systemPromptOverride: automationSettings?.emailSystemPrompt ?? null,
      });
      const draftId = await createLeadDraftRecord({
        leadId: input.lead.id,
        leadFactsId: factsRecord.id,
        leadAssessmentId: assessmentRecord.id,
        draft: drafted.draft,
        model: drafted.model,
        promptVersion: drafted.promptVersion,
        bodyPlain: drafted.bodyPlain,
        bodyHtml: drafted.bodyHtml,
        subject: drafted.subject,
        personalizationEvidence: drafted.draft.selectedEvidenceRefs,
      });
      draftRecord = {
        id: draftId,
        createdAt: new Date(),
        promptVersion: drafted.promptVersion,
        model: drafted.model,
        draft: drafted.draft,
        subject: drafted.subject,
        bodyPlain: drafted.bodyPlain,
        bodyHtml: drafted.bodyHtml,
      };
    }

    decisionRecord = !input.forceRefresh ? await getLatestSendDecision(input.lead.id) : null;
    if (!decisionRecord && draftRecord) {
      const decision = decideLeadSendability({
        facts: factsRecord.facts,
        assessment: assessmentRecord.assessment,
        draft: draftRecord.draft,
        email: bestEmail.email || input.lead.email,
        emailConfidence: bestEmail.confidence || input.lead.emailConfidence || 0,
        emailType: bestEmail.emailType || input.lead.emailType,
        emailFlags: bestEmail.flags.length > 0 ? bestEmail.flags : input.lead.emailFlags,
      });
      const decisionId = await createSendDecisionRecord({
        leadId: input.lead.id,
        leadFactsId: factsRecord.id,
        leadAssessmentId: assessmentRecord.id,
        leadEmailDraftId: draftRecord.id,
        decision,
      });
      decisionRecord = {
        id: decisionId,
        createdAt: new Date(),
        decision,
      };
    }
  }

  const legacyWebsiteAssessment = buildLegacyWebsiteAssessment(factsRecord.facts);
  const legacyPainSignals = buildLegacyPainSignals(factsRecord.facts, assessmentRecord.assessment);
  const legacyEnrichment = buildLegacyEnrichmentResult(assessmentRecord.assessment);

  return {
    factsRecord,
    assessmentRecord,
    draftRecord,
    decisionRecord,
    bestEmail,
    legacyCompatibility: {
      tacticalNote: buildLegacyTacticalNote(assessmentRecord.assessment, factsRecord.facts),
      painSignals: legacyPainSignals,
      websiteAssessment: legacyWebsiteAssessment,
      enrichment: legacyEnrichment,
      websiteStatus: computeLegacyWebsiteStatus(factsRecord.facts),
      phone: selectPrimaryPhone(factsRecord.facts),
      socialLink: selectPrimarySocialLink(factsRecord.facts),
      websiteUrl: factsRecord.facts.contact.website,
      websiteDomain: extractDomain(factsRecord.facts.contact.website),
      followUpQuestion: buildLegacyFollowUpQuestion(assessmentRecord.assessment),
    },
  };
}
