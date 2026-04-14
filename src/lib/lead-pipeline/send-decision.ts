import { hasValidPipelineEmail } from "@/lib/lead-qualification";

import { sendDecisionSchema, type EmailDraft, type LeadAssessment, type LeadFacts, type SendDecision } from "@/lib/lead-pipeline/schema";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function decideLeadSendability(input: {
  facts: LeadFacts;
  assessment: LeadAssessment;
  draft: EmailDraft;
  email: string | null;
  emailConfidence: number;
  emailType: string | null;
  emailFlags: string[] | string | null;
}): SendDecision {
  const hasValidEmail = hasValidPipelineEmail({
    email: input.email,
    emailConfidence: input.emailConfidence,
    emailType: input.emailType,
    emailFlags: input.emailFlags,
  });

  const requiredFieldsPresent = Boolean(
    input.facts.identity.businessName &&
      input.assessment.outreachAngle &&
      input.draft.subject &&
      input.draft.observation &&
      input.draft.cta,
  );

  let hallucinationRisk: "low" | "medium" | "high" = "low";
  if (input.draft.selectedEvidenceRefs.length === 0 || input.assessment.painSignals.some((pain) => pain.evidenceRefs.length === 0)) {
    hallucinationRisk = "high";
  } else if (
    input.facts.extractionConfidence < 0.78 ||
    input.assessment.assessmentConfidence < 0.7 ||
    input.facts.discovery.geoConfidence !== "high" ||
    input.facts.discovery.verticalConfidence !== "high"
  ) {
    hallucinationRisk = "medium";
  }

  const reasons: string[] = [];
  let decision: SendDecision["decision"] = "auto-send";

  if (!requiredFieldsPresent) {
    decision = "blocked";
    reasons.push("Missing required facts, assessment, or draft fields.");
  }

  if (!hasValidEmail) {
    decision = "blocked";
    reasons.push("No validated outreach-safe email is available.");
  }

  if (input.facts.discovery.geoConfidence === "low") {
    decision = "blocked";
    reasons.push("Target geography confidence is too weak.");
  } else if (input.facts.discovery.geoConfidence === "medium" && decision !== "blocked") {
    decision = "review-recommended";
    reasons.push("Geography confidence is only moderate.");
  }

  if (input.facts.discovery.verticalConfidence === "low") {
    decision = "blocked";
    reasons.push("Business category fit is too weak.");
  } else if (input.facts.discovery.verticalConfidence === "medium" && decision !== "blocked") {
    decision = "review-recommended";
    reasons.push("Business category fit is only moderate.");
  }

  if (input.facts.website.siteType === "directory" || input.facts.website.siteType === "placeholder") {
    decision = decision === "blocked" ? "blocked" : "review-recommended";
    reasons.push("Website quality is thin or indirect.");
  }

  if (input.facts.extractionConfidence < 0.58) {
    decision = "blocked";
    reasons.push("Deterministic extraction confidence is too low.");
  } else if (input.facts.extractionConfidence < 0.76 && decision !== "blocked") {
    decision = "review-recommended";
    reasons.push("Extraction confidence is moderate and should be reviewed.");
  }

  if (input.assessment.assessmentConfidence < 0.58 && decision !== "blocked") {
    decision = "blocked";
    reasons.push("Assessment confidence is too low.");
  } else if (input.assessment.assessmentConfidence < 0.72 && decision !== "blocked") {
    decision = "review-recommended";
    reasons.push("Assessment confidence is moderate.");
  }

  if (input.draft.personalizationStrength < 0.35) {
    decision = decision === "blocked" ? "blocked" : "review-recommended";
    reasons.push("Personalization is weak and should not auto-send.");
  }

  if (input.assessment.fitScore < 45) {
    decision = "blocked";
    reasons.push("Lead fit is below the send threshold.");
  } else if (input.assessment.fitScore < 62 && decision !== "blocked") {
    decision = "review-recommended";
    reasons.push("Lead fit is borderline for automation.");
  }

  if (input.facts.website.contactChannelCount === 0 && !input.facts.features.contactFormExists) {
    decision = "blocked";
    reasons.push("No deterministic direct contact path was validated on the website.");
  }

  if (hallucinationRisk === "high") {
    decision = "blocked";
    reasons.push("Evidence coverage is insufficient for a safe send.");
  } else if (hallucinationRisk === "medium" && decision === "auto-send") {
    decision = "review-recommended";
    reasons.push("Evidence quality suggests operator review.");
  }

  if (reasons.length === 0) {
    reasons.push("Facts, assessment, and draft passed all send checks.");
  }

  return sendDecisionSchema.parse({
    decision,
    reasons,
    checks: {
      extractionConfidence: clamp(input.facts.extractionConfidence, 0, 1),
      assessmentConfidence: clamp(input.assessment.assessmentConfidence, 0, 1),
      personalizationStrength: clamp(input.draft.personalizationStrength, 0, 1),
      hasValidEmail,
      fitScore: input.assessment.fitScore,
      hallucinationRisk,
      requiredFieldsPresent,
    },
  });
}
