import type { PainSignal, WebsiteAssessment } from "@/lib/axiom-scoring";
import { validateContact } from "@/lib/contact-validation";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";

import type { LeadAssessment, LeadFacts } from "@/lib/lead-pipeline/schema";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

function lookupEvidence(facts: LeadFacts, refs: string[]) {
  return facts.evidence.filter((evidence) => refs.includes(evidence.id));
}

export function buildLegacyWebsiteAssessment(facts: LeadFacts): WebsiteAssessment {
  const render = facts.rendering;
  const speedRisk = clamp(
    (facts.ux.performanceSignals.loadEventMs && facts.ux.performanceSignals.loadEventMs > 4500 ? 3 : 0) +
      (facts.ux.performanceSignals.domContentLoadedMs && facts.ux.performanceSignals.domContentLoadedMs > 2500 ? 2 : 0) +
      (facts.ux.performanceSignals.fetchDurationMs && facts.ux.performanceSignals.fetchDurationMs > 2500 ? 1 : 0) +
      (render.visualClutterRisk === "high" ? 1 : 0),
    0,
    5,
  );
  const conversionRisk = clamp(
    (facts.features.contactPageExists ? 0 : 2) +
      (facts.features.contactFormExists ? 0 : 1) +
      (facts.features.ctaTexts.length > 0 ? 0 : 2) +
      (facts.website.pageCountEstimate >= 3 ? 0 : 1) +
      (facts.features.servicePageCount > 0 ? 0 : 1) +
      (facts.features.quoteIntentDetected ? 0 : 1) +
      (render.contentDensity === "sparse" ? 1 : 0) +
      (render.mobileReadabilityRisk === "high" ? 2 : render.mobileReadabilityRisk === "medium" ? 1 : 0) +
      (render.primaryCTA ? 0 : 1),
    0,
    5,
  );
  const trustRisk = clamp(
      (facts.features.testimonialsDetected ? 0 : 2) +
      (facts.location.googleMapsUrl ? 0 : 1) +
      ((facts.discovery.reviewCount || 0) >= 10 && facts.features.testimonialsDetected ? 0 : 1) +
      (facts.website.title ? 0 : 1) +
      (facts.features.aboutPageExists ? 0 : 1) +
      (facts.website.businessNameLikelyPresent ? 0 : 1) +
      (render.visualClutterRisk === "high" ? 1 : 0) +
      (render.heroHeading ? 0 : 1),
    0,
    5,
  );
  const seoRisk = clamp(
    (facts.website.title ? 0 : 2) +
      (facts.website.metaDescription ? 0 : 2) +
      (facts.website.internalPages.length >= 3 ? 0 : 1) +
      (facts.features.servicePageCount > 0 ? 0 : 1) +
      (render.headingCount > 0 ? 0 : 1) +
      (render.contentDensity === "dense" ? 0 : 1),
    0,
    5,
  );

  const total = speedRisk + conversionRisk + trustRisk + seoRisk;
  const overallGrade =
    total <= 3 ? "A" :
    total <= 6 ? "B" :
    total <= 9 ? "C" :
    total <= 13 ? "D" : "F";

  const topFixes = uniqueStrings([
    !facts.features.contactPageExists ? "Add a clearer contact path from the homepage." : null,
    !facts.features.contactFormExists ? "Make it easier to submit a contact request without extra clicks." : null,
    facts.ux.mobileViewportMissing ? "Add a responsive viewport configuration for mobile users." : null,
    !facts.website.metaDescription ? "Add a clearer homepage description and search snippet." : null,
    !facts.features.testimonialsDetected && (facts.discovery.reviewCount || 0) > 0
      ? "Surface customer proof earlier on the site."
      : null,
    facts.ux.mobileOverflowDetected ? "Fix horizontal overflow on mobile layouts." : null,
    render.contentDensity === "sparse" ? "Add more meaningful homepage content and page structure." : null,
    render.visualClutterRisk === "high" ? "Simplify the layout so key actions are easier to scan." : null,
    render.mobileReadabilityRisk !== "low" ? "Tune the mobile presentation to reduce readability friction." : null,
    !render.primaryCTA ? "Make the main call to action more obvious above the fold." : null,
  ]).slice(0, 3);

  return {
    speedRisk,
    conversionRisk,
    trustRisk,
    seoRisk,
    overallGrade,
    topFixes,
  };
}

export function buildLegacyPainSignals(facts: LeadFacts, assessment: LeadAssessment): PainSignal[] {
  const signals: PainSignal[] = assessment.painSignals.map((pain) => {
    const evidence = lookupEvidence(facts, pain.evidenceRefs)
      .map((item) => item.snippet)
      .join(" | ");

    return {
      type: pain.type,
      severity: pain.severity,
      evidence: evidence || pain.summary,
      source: "ai_analysis" as const,
    };
  });

  if (signals.length === 0 && !facts.contact.website) {
    signals.push({
      type: "NO_WEBSITE",
      severity: 4,
      evidence: "No working website was available from discovery or inspection.",
      source: "heuristic",
    });
  }

  if (signals.length === 0 && facts.website.directoryShellDetected) {
    signals.push({
      type: "TRUST",
      severity: 3,
      evidence: "The discovered website looked more like a directory or listing shell than a direct business site.",
      source: "heuristic",
    });
  }

  return signals;
}

export function buildLegacyEnrichmentResult(assessment: LeadAssessment): EnrichmentResult {
  return {
    valueProposition: assessment.valueProposition,
    pitchAngle: assessment.pitchAngle,
    anticipatedObjections: assessment.anticipatedObjections,
    emailTone: assessment.emailTone,
    keyPainPoint: assessment.keyPainPoint,
    competitiveEdge: assessment.competitiveEdge,
    personalizedHook: assessment.personalizationLine,
    recommendedCTA: assessment.recommendedCTA,
    enrichmentSummary: assessment.summaryForOperator,
  };
}

export function selectBestLeadEmail(facts: LeadFacts, contactName?: string | null) {
  const candidates = facts.contact.emails;
  let best: { email: string | null; confidence: number; emailType: string; flags: string[] } = {
    email: null,
    confidence: 0,
    emailType: "unknown",
    flags: ["no_email"],
  };

  for (const candidate of candidates) {
    const validation = validateContact(candidate, facts.contact.phone, {
      businessWebsite: facts.contact.website,
      ownerName: contactName || null,
    });

    if (validation.emailConfidence > best.confidence) {
      best = {
        email: candidate,
        confidence: validation.emailConfidence,
        emailType: validation.emailType,
        flags: validation.emailFlags || [],
      };
    }
  }

  return best;
}

export function selectPrimaryPhone(facts: LeadFacts) {
  return facts.contact.phone || facts.contact.phonesFound[0] || null;
}

export function selectPrimarySocialLink(facts: LeadFacts) {
  return facts.contact.socialLinks[0] || null;
}

export function buildLegacyTacticalNote(assessment: LeadAssessment, facts: LeadFacts) {
  const ratingFragment =
    typeof facts.discovery.reviewCount === "number" && facts.discovery.reviewCount > 0
      ? ` ${facts.discovery.reviewCount} Google reviews are already on the table.`
      : "";
  return `${assessment.summaryForOperator}${ratingFragment}`.trim();
}

export function buildLegacyFollowUpQuestion(assessment: LeadAssessment) {
  const cta = assessment.recommendedCTA.replace(/[.?!]+$/g, "");
  return cta.endsWith("?") ? cta : `${cta}?`;
}

export function computeLegacyWebsiteStatus(facts: LeadFacts) {
  return facts.contact.website && facts.website.homepageReachable ? "ACTIVE" : "MISSING";
}
