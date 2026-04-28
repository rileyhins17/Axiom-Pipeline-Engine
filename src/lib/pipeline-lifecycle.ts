import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";

type PipelineLeadLike = {
  axiomScore?: number | null | undefined;
  email?: string | null | undefined;
  emailConfidence?: number | null | undefined;
  emailFlags?: string | null | string[] | undefined;
  emailType?: string | null | undefined;
  enrichedAt?: string | Date | null | undefined;
  enrichmentData?: string | null | undefined;
  isArchived?: boolean | null | undefined;
  outreachStatus?: string | null | undefined;
  source?: string | null | undefined;
  websiteStatus?: string | null | undefined;
};

export type PipelineReadinessState = "NOT_READY" | "ALMOST_READY" | "READY";
export type PipelineLifecycleStage =
  | "INTAKE"
  | "ENRICHMENT"
  | "QUALIFICATION"
  | "INITIAL_OUTREACH"
  | "FOLLOW_UP"
  | "CLOSED";

function hasCapturedEnrichment(lead: PipelineLeadLike) {
  return Boolean(lead.enrichedAt || lead.enrichmentData);
}

export function isReadyForFirstTouchStatus(status: string | null | undefined) {
  return status === READY_FOR_FIRST_TOUCH_STATUS;
}

export function isIntakeLead(lead: PipelineLeadLike) {
  return getCanonicalLifecycleStage(lead) === "INTAKE";
}

export function isQualificationLead(lead: PipelineLeadLike) {
  return getCanonicalLifecycleStage(lead) === "QUALIFICATION";
}

export function isEnrichmentStageLead(lead: PipelineLeadLike) {
  return getCanonicalLifecycleStage(lead) === "ENRICHMENT";
}

export function getCanonicalLifecycleStage(input: PipelineLeadLike & {
  hasActiveSequence?: boolean;
  hasSentAnyStep?: boolean;
}): PipelineLifecycleStage {
  if (input.isArchived) return "CLOSED";
  if (input.hasActiveSequence && input.hasSentAnyStep) return "FOLLOW_UP";
  if (input.hasActiveSequence && !input.hasSentAnyStep) return "INITIAL_OUTREACH";
  if (isContactedOutreachStatus(input.outreachStatus)) return "FOLLOW_UP";
  if (isReadyForFirstTouchStatus(input.outreachStatus)) return "INITIAL_OUTREACH";

  if (!hasCapturedEnrichment(input)) {
    return input.source ? "INTAKE" : "ENRICHMENT";
  }

  return getReadinessState(input) === "NOT_READY" ? "ENRICHMENT" : "QUALIFICATION";
}

export function partitionPreSendLeads<T extends PipelineLeadLike>(leads: T[]) {
  const intake: T[] = [];
  const enrichment: T[] = [];
  const qualification: T[] = [];
  const initial: T[] = [];

  for (const lead of leads) {
    const stage = getCanonicalLifecycleStage(lead);
    if (stage === "INTAKE") intake.push(lead);
    else if (stage === "ENRICHMENT") enrichment.push(lead);
    else if (stage === "QUALIFICATION") qualification.push(lead);
    else if (stage === "INITIAL_OUTREACH") initial.push(lead);
  }

  return { intake, enrichment, qualification, initial };
}

export function getReadinessChecklist(lead: PipelineLeadLike) {
  const websiteAssessed = Boolean(lead.websiteStatus);
  const validContactFound = hasValidPipelineEmail({
    ...lead,
    email: lead.email ?? null,
  });
  const scoreComputed =
    typeof lead.axiomScore === "number" && Number.isFinite(lead.axiomScore);
  const enrichmentCaptured = Boolean(lead.enrichmentData || lead.enrichedAt);
  const outreachEligibilityDetermined = enrichmentCaptured && scoreComputed;
  const fitConfirmed = isLeadOutreachEligible({
    ...lead,
    email: lead.email ?? null,
    axiomScore: lead.axiomScore ?? null,
  });

  return [
    { id: "website", label: "Website assessed", complete: websiteAssessed },
    { id: "contact", label: "Valid contact found", complete: validContactFound },
    { id: "fit", label: "Fit confirmed", complete: fitConfirmed },
    { id: "score", label: "Qualification score computed", complete: scoreComputed },
    {
      id: "eligibility",
      label: "Outreach eligibility determined",
      complete: outreachEligibilityDetermined,
    },
  ];
}

export function getReadinessState(lead: PipelineLeadLike): PipelineReadinessState {
  const checklist = getReadinessChecklist(lead);
  const completed = checklist.filter((item) => item.complete).length;

  if (
    completed === checklist.length &&
    isLeadOutreachEligible({
      ...lead,
      email: lead.email ?? null,
      axiomScore: lead.axiomScore ?? null,
    })
  ) {
    return "READY";
  }

  if (completed >= 2) {
    return "ALMOST_READY";
  }

  return "NOT_READY";
}

export function getReadinessLabel(state: PipelineReadinessState) {
  switch (state) {
    case "READY":
      return "Ready for Qualification";
    case "ALMOST_READY":
      return "Almost Ready";
    default:
      return "Not Ready";
  }
}

export function getReadinessTone(state: PipelineReadinessState) {
  switch (state) {
    case "READY":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    case "ALMOST_READY":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200";
    default:
      return "border-white/10 bg-white/[0.04] text-zinc-300";
  }
}

export function getMissingDataSummary(lead: PipelineLeadLike) {
  const missing: string[] = [];

  if (!lead.enrichedAt && !lead.enrichmentData) {
    missing.push("Enrichment not started");
  }
  if (!lead.websiteStatus) {
    missing.push("Website not assessed");
  }
  if (
    !hasValidPipelineEmail({
      ...lead,
      email: lead.email ?? null,
    })
  ) {
    missing.push("No valid email");
  }
  if (!(typeof lead.axiomScore === "number" && Number.isFinite(lead.axiomScore))) {
    missing.push("Qualification score missing");
  }
  if (
    lead.enrichmentData &&
    !isLeadOutreachEligible({
      ...lead,
      email: lead.email ?? null,
      axiomScore: lead.axiomScore ?? null,
    })
  ) {
    missing.push("Not yet ready for first touch");
  }

  return missing;
}

export function getLifecycleStageLabel(input: {
  enrichedAt?: string | Date | null | undefined;
  enrichmentData?: string | null | undefined;
  hasActiveSequence?: boolean;
  hasSentAnyStep?: boolean;
  isArchived?: boolean | null | undefined;
  outreachStatus?: string | null | undefined;
  source?: string | null | undefined;
  axiomScore?: number | null | undefined;
  email?: string | null | undefined;
  emailConfidence?: number | null | undefined;
  emailFlags?: string | null | string[] | undefined;
  emailType?: string | null | undefined;
  websiteStatus?: string | null | undefined;
}) {
  switch (getCanonicalLifecycleStage(input)) {
    case "INTAKE":
      return "Intake";
    case "ENRICHMENT":
      return "Enrichment";
    case "QUALIFICATION":
      return "Qualification";
    case "INITIAL_OUTREACH":
      return "Initial Outreach";
    case "FOLLOW_UP":
      return "Follow-Up";
    default:
      return "Closed";
  }
}
