import { chatCompletion } from "@/lib/deepseek";
import { hasValidPipelineEmail } from "@/lib/lead-qualification";
import {
  DEFAULT_WEBSITE_RENDER_SUMMARY,
  leadAssessmentSchema,
  PIPELINE_ASSESSMENT_PROMPT_VERSION,
  type LeadAssessment,
  type LeadFacts,
} from "@/lib/lead-pipeline/schema";
import { selectBestLeadEmail } from "@/lib/lead-pipeline/compatibility";

const ASSESSMENT_MODEL = "deepseek/deepseek-chat";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildAssessmentInput(facts: LeadFacts) {
  return {
    identity: facts.identity,
    location: facts.location,
    contact: {
      phone: facts.contact.phone,
      website: facts.contact.website,
      emails: facts.contact.emails.slice(0, 5),
      socialLinks: facts.contact.socialLinks.slice(0, 5),
    },
    discovery: facts.discovery,
    website: facts.website,
    rendering: facts.rendering || DEFAULT_WEBSITE_RENDER_SUMMARY,
    features: facts.features,
    ux: facts.ux,
    extractionConfidence: facts.extractionConfidence,
    evidence: facts.evidence.slice(0, 12).map((item) => ({
      id: item.id,
      label: item.label,
      snippet: item.snippet,
      source: item.source,
    })),
  };
}

function getAssessmentGate(facts: LeadFacts) {
  const bestEmail = selectBestLeadEmail(facts);
  const hasValidEmail = hasValidPipelineEmail({
    email: bestEmail.email,
    emailConfidence: bestEmail.confidence,
    emailType: bestEmail.emailType,
    emailFlags: bestEmail.flags,
  });
  const hasReachableWebsite = Boolean(facts.contact.website && facts.website.homepageReachable);
  const strongDeterministicCoverage =
    facts.extractionConfidence >= 0.58 &&
    facts.evidence.length >= 4 &&
    facts.discovery.verticalConfidence !== "low" &&
    facts.discovery.geoConfidence !== "low";
  const safeSiteType = facts.website.siteType !== "directory" && facts.website.siteType !== "placeholder";

  return {
    bestEmail,
    hasValidEmail,
    hasReachableWebsite,
    shouldUseDeepSeek:
      hasValidEmail &&
      strongDeterministicCoverage &&
      (hasReachableWebsite || facts.features.contactFormExists || facts.contact.phonesFound.length > 0) &&
      safeSiteType,
  };
}

function validateEvidenceReferences(assessment: LeadAssessment, facts: LeadFacts) {
  const evidenceIds = new Set(facts.evidence.map((item) => item.id));
  for (const pain of assessment.painSignals) {
    if (pain.evidenceRefs.some((ref) => !evidenceIds.has(ref))) {
      throw new Error(`Assessment referenced unknown evidence ids for pain signal ${pain.type}`);
    }
  }
}

async function requestAssessment(facts: LeadFacts, retryMessage?: string) {
  const response = await chatCompletion({
    model: ASSESSMENT_MODEL,
    responseFormat: "json_object",
    temperature: retryMessage ? 0.2 : 0.15,
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content: [
          "You are the AI interpretation stage for Axiom's outbound pipeline.",
          "You may interpret validated facts only. Never invent raw facts or missing features.",
          "The render summary reflects deterministic homepage structure and browser-enriched page quality.",
          "Use render summary fields to judge visual quality, content density, mobile readability, and CTA clarity.",
          "Do not treat a directory shell, parked site, or weak match as a strong opportunity unless the facts explicitly support it.",
          "Every pain signal must cite at least one evidence id from the provided evidence array.",
          "If geography match, vertical match, or evidence quality are weak, keep the assessment conservative.",
          "If evidence is weak, lower confidence and keep the angle conservative.",
          "No hype, no consultant filler, no fake certainty.",
          "Return JSON only.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Assess this lead for outbound fit using only the validated facts and evidence below.",
          requiredOutput: {
            fitScore: "integer 0-100",
            fitTier: "S | A | B | C",
            painSignals: [
              {
                type: "CONVERSION | SPEED | TRUST | SEO | NO_WEBSITE | DESIGN | FUNCTIONALITY | CONTACT | FIT | LOCAL",
                summary: "short sentence",
                severity: "integer 1-5",
                evidenceRefs: ["evidence-id"],
              },
            ],
            outreachAngle: "short sentence",
            personalizationLine: "single short line for an opener",
            assessmentConfidence: "0-1",
            reasonFlags: ["strings"],
            disqualifierFlags: ["strings"],
            summaryForOperator: "1-2 short sentences",
            valueProposition: "1 short sentence",
            pitchAngle: "1 short sentence",
            anticipatedObjections: ["2-3 concise objections"],
            emailTone: "casual | professional | urgent",
            keyPainPoint: "single issue",
            competitiveEdge: "short sentence",
            recommendedCTA: "low-friction CTA",
          },
          constraints: [
            "Do not claim a feature is missing unless the facts explicitly indicate false or absent.",
            "Do not mention evidence ids outside the provided list.",
            "If the website is unavailable, focus on the absence of a working site and validated discovery signals.",
            "If the website looks like a directory, social profile, or placeholder, say so plainly instead of pretending it is a strong business site.",
            "Keep output concise and operator-grade.",
          ],
          facts: buildAssessmentInput(facts),
          retryMessage: retryMessage || null,
        }),
      },
    ],
  });

  const parsed = leadAssessmentSchema.parse(JSON.parse(response.content));
  validateEvidenceReferences(parsed, facts);
  return parsed;
}

function buildFallbackAssessment(facts: LeadFacts, reasonFlags: string[] = []): LeadAssessment {
  const noWebsite = !facts.contact.website || !facts.website.homepageReachable;
  const missingMeta = !facts.website.metaDescription;
  const missingContactPath = !facts.features.contactPageExists || !facts.features.contactFormExists;
  const directoryLike = facts.website.siteType === "directory" || facts.website.directoryShellDetected;
  const placeholderLike = facts.website.siteType === "placeholder" || facts.website.placeholderDetected;
  const render = facts.rendering || DEFAULT_WEBSITE_RENDER_SUMMARY;
  const renderPenalty =
    (render.contentDensity === "sparse" ? 6 : 0) +
    (render.visualClutterRisk === "high" ? 8 : render.visualClutterRisk === "medium" ? 4 : 0) +
    (render.mobileReadabilityRisk === "high" ? 8 : render.mobileReadabilityRisk === "medium" ? 4 : 0) +
    (!render.heroHeading ? 4 : 0) +
    (!render.primaryCTA ? 4 : 0);
  const baseScore = noWebsite
    ? 78
    : Math.max(
        35,
        76 -
          (facts.discovery.verticalConfidence === "low" ? 14 : facts.discovery.verticalConfidence === "medium" ? 4 : 0) -
          (facts.discovery.geoConfidence === "low" ? 14 : facts.discovery.geoConfidence === "medium" ? 3 : 0) -
          (directoryLike ? 10 : 0) -
          (placeholderLike ? 8 : 0) -
          (missingContactPath ? 10 : 0) -
          (missingMeta ? 6 : 0) -
          (facts.ux.mobileViewportMissing ? 8 : 0) -
          (facts.ux.mobileOverflowDetected ? 8 : 0) -
          renderPenalty,
      );
  const fitScore = clamp(baseScore, 0, 100);
  const fitTier = fitScore >= 85 ? "S" : fitScore >= 70 ? "A" : fitScore >= 55 ? "B" : "C";
  const evidenceRef = facts.evidence[0]?.id || "derived_fallback";
  const painSignals = noWebsite
    ? [{
        type: "NO_WEBSITE" as const,
        summary: "No working website was validated during inspection.",
        severity: 5,
        evidenceRefs: [evidenceRef],
      }]
    : [
        missingContactPath
          ? {
              type: "CONVERSION" as const,
              summary: "The site does not make the contact path obvious enough.",
              severity: 3,
              evidenceRefs: [evidenceRef],
            }
          : null,
        facts.ux.mobileViewportMissing || facts.ux.mobileOverflowDetected || render.mobileReadabilityRisk !== "low"
          ? {
              type: "DESIGN" as const,
              summary: "Mobile presentation issues are visible in deterministic inspection.",
              severity: 3,
              evidenceRefs: [evidenceRef],
            }
          : null,
        missingMeta || render.contentDensity === "sparse"
          ? {
              type: "SEO" as const,
              summary: "Search-facing metadata or content depth is incomplete on the homepage.",
              severity: 2,
              evidenceRefs: [evidenceRef],
            }
          : null,
      ].filter(Boolean);

  return leadAssessmentSchema.parse({
    fitScore,
    fitTier,
    painSignals,
    outreachAngle: noWebsite
      ? "Lead with the absence of a clear website and how that slows first-time trust."
      : "Lead with one visible site friction point and a lighter next-step improvement.",
    personalizationLine: noWebsite
      ? "I looked for a site and could not find a clear one for the business."
      : "I had one quick thought while looking through the site.",
    assessmentConfidence: 0.58,
    reasonFlags: [
      ...reasonFlags,
      noWebsite ? "no_working_website" : "deterministic_fallback",
      directoryLike ? "directory_like_site" : null,
      placeholderLike ? "placeholder_site" : null,
      facts.discovery.verticalConfidence === "low" ? "vertical_mismatch" : null,
      facts.discovery.geoConfidence === "low" ? "geo_mismatch" : null,
    ].filter((value): value is string => Boolean(value)),
    disqualifierFlags: [],
    summaryForOperator: noWebsite
      ? "No working website was validated, so the outreach angle is simple and grounded."
      : directoryLike
        ? "The discovered website behaves more like a directory shell, so the lead should stay conservative."
        : placeholderLike
          ? "The website looks placeholder-grade, so this lead should stay conservative unless other signals are strong."
      : reasonFlags.length > 0
        ? `Deterministic fallback was used because ${reasonFlags.join(", ")}. Treat the angle as conservative.`
        : "The AI assessment fell back to deterministic signals, so treat the angle as conservative.",
    valueProposition: noWebsite
      ? "Axiom can help create a cleaner first-stop site that makes the business easier to understand and contact."
      : "Axiom can help remove the most obvious friction without turning this into a big rebuild pitch.",
    pitchAngle: noWebsite
      ? "No clear site surfaced, which leaves trust and contact doing more work than they should."
      : "There is one clear site friction point worth mentioning without overstating it.",
    anticipatedObjections: [
      "Most work still comes from referrals.",
      "The current setup may feel good enough for now.",
    ],
    emailTone: "professional",
    keyPainPoint: noWebsite
      ? "No validated website was available."
      : missingContactPath
        ? "The contact path is weaker than it should be."
        : "The site leaves some obvious friction in place.",
    competitiveEdge: noWebsite
      ? "Competitors with a clearer site will likely make trust and next steps easier."
      : "Competitors with a cleaner path to contact will feel simpler to act on.",
    recommendedCTA: "Would it be useful if I sent over 2 or 3 ideas?",
  });
}

export async function assessLeadFacts(facts: LeadFacts) {
  const gate = getAssessmentGate(facts);

  if (!gate.shouldUseDeepSeek) {
    return {
      assessment: buildFallbackAssessment(facts, [
        !gate.hasReachableWebsite ? "website_gate" : null,
        !gate.hasValidEmail ? "email_gate" : null,
      ].filter((value): value is string => Boolean(value))),
      model: "deterministic-fallback",
      promptVersion: PIPELINE_ASSESSMENT_PROMPT_VERSION,
    };
  }

  try {
    const assessment = await requestAssessment(facts);
    return {
      assessment,
      model: ASSESSMENT_MODEL,
      promptVersion: PIPELINE_ASSESSMENT_PROMPT_VERSION,
    };
  } catch (error) {
    try {
      const assessment = await requestAssessment(
        facts,
        error instanceof Error ? `The previous response failed validation: ${error.message}` : "The previous response failed validation.",
      );
      return {
        assessment,
        model: ASSESSMENT_MODEL,
        promptVersion: PIPELINE_ASSESSMENT_PROMPT_VERSION,
      };
    } catch {
      return {
        assessment: buildFallbackAssessment(facts, ["deepseek_unavailable"]),
        model: "deterministic-fallback",
        promptVersion: PIPELINE_ASSESSMENT_PROMPT_VERSION,
      };
    }
  }
}
