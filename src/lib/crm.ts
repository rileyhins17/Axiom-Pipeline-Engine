export const DEAL_STAGE_OPTIONS = [
  { value: "NEW_LEAD", label: "New Lead", shortLabel: "New", classes: "border-zinc-500/20 bg-zinc-500/10 text-zinc-300" },
  { value: "CONTACTED", label: "Contacted", shortLabel: "Contacted", classes: "border-sky-500/20 bg-sky-500/10 text-sky-300" },
  { value: "INTERESTED", label: "Interested", shortLabel: "Interested", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  { value: "DISCOVERY_BOOKED", label: "Discovery Booked", shortLabel: "Booked", classes: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" },
  { value: "DISCOVERY_COMPLETED", label: "Discovery Completed", shortLabel: "Discovery", classes: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  { value: "PROPOSAL_SENT", label: "Proposal Sent", shortLabel: "Proposal", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
  { value: "NEGOTIATING", label: "Negotiating", shortLabel: "Negotiating", classes: "border-orange-500/20 bg-orange-500/10 text-orange-300" },
  { value: "SIGNED", label: "Signed", shortLabel: "Signed", classes: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" },
  { value: "ACTIVE", label: "Active Project", shortLabel: "Active", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  { value: "DELIVERED", label: "Delivered", shortLabel: "Delivered", classes: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  { value: "RETAINED", label: "Retainer / Ongoing", shortLabel: "Retainer", classes: "border-purple-500/20 bg-purple-500/10 text-purple-300" },
  { value: "LOST", label: "Lost", shortLabel: "Lost", classes: "border-red-500/20 bg-red-500/10 text-red-300" },
] as const;

export const ENGAGEMENT_TYPE_OPTIONS = [
  { value: "WEBSITE_REBUILD", label: "Website Rebuild", shortLabel: "Rebuild" },
  { value: "NEW_WEBSITE", label: "New Website", shortLabel: "New Site" },
  { value: "INFRASTRUCTURE_MANAGEMENT", label: "Infrastructure Management", shortLabel: "Infrastructure" },
  { value: "RETAINER", label: "Retainer", shortLabel: "Retainer" },
  { value: "BOOKING_MENU_LEAD_SYSTEM", label: "Booking/Menu/Lead Capture System", shortLabel: "Conversion System" },
  { value: "CUSTOM_SYSTEM_WORK", label: "Custom System Work", shortLabel: "Custom System" },
  { value: "OWNERSHIP", label: "New Website", shortLabel: "New Site" },
  { value: "REBUILD", label: "Website Rebuild", shortLabel: "Rebuild" },
] as const;

export const CLIENT_PRIORITY_OPTIONS = [
  { value: "HIGH", label: "High", classes: "border-red-500/20 bg-red-500/10 text-red-300" },
  { value: "MEDIUM", label: "Medium", classes: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
  { value: "LOW", label: "Low", classes: "border-zinc-600/20 bg-zinc-600/5 text-zinc-500" },
] as const;

export const CRM_ACTIVITY_TYPE_OPTIONS = [
  { value: "NOTE", label: "Note" },
  { value: "EMAIL", label: "Email" },
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "STAGE_CHANGE", label: "Stage Change" },
  { value: "PROPOSAL_SENT", label: "Proposal Sent" },
  { value: "SIGNED", label: "Signed" },
  { value: "LOST", label: "Lost" },
  { value: "RENEWAL", label: "Renewal" },
  { value: "SYSTEM", label: "System" },
] as const;

export type DealStage = (typeof DEAL_STAGE_OPTIONS)[number]["value"];
export type EngagementType = (typeof ENGAGEMENT_TYPE_OPTIONS)[number]["value"];
export type ClientPriority = (typeof CLIENT_PRIORITY_OPTIONS)[number]["value"];
export type DealHealth = "HOT" | "WARM" | "STALE" | "RISKY" | "WON" | "LOST";
export type CrmActivityType = (typeof CRM_ACTIVITY_TYPE_OPTIONS)[number]["value"];

const dealStageSet = new Set<string>(DEAL_STAGE_OPTIONS.map((o) => o.value));
const engagementTypeSet = new Set<string>(ENGAGEMENT_TYPE_OPTIONS.map((o) => o.value));
const clientPrioritySet = new Set<string>(CLIENT_PRIORITY_OPTIONS.map((o) => o.value));
const crmActivityTypeSet = new Set<string>(CRM_ACTIVITY_TYPE_OPTIONS.map((o) => o.value));

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && dealStageSet.has(value);
}

export function isEngagementType(value: unknown): value is EngagementType {
  return typeof value === "string" && engagementTypeSet.has(value);
}

export function isClientPriority(value: unknown): value is ClientPriority {
  return typeof value === "string" && clientPrioritySet.has(value);
}

export function isCrmActivityType(value: unknown): value is CrmActivityType {
  return typeof value === "string" && crmActivityTypeSet.has(value);
}

export function getDealStageMeta(stage: string | null | undefined) {
  return DEAL_STAGE_OPTIONS.find((o) => o.value === stage) ?? null;
}

export function getDealStageLabel(stage: string | null | undefined) {
  return DEAL_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? "Inbox";
}

export function getEngagementTypeLabel(type: string | null | undefined) {
  return ENGAGEMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "—";
}

export function getCrmActivityTypeLabel(type: string | null | undefined) {
  return CRM_ACTIVITY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "Activity";
}

export function getClientPriorityMeta(priority: string | null | undefined) {
  return CLIENT_PRIORITY_OPTIONS.find((o) => o.value === priority) ?? null;
}

export function isActiveClientStage(stage: string | null | undefined) {
  return stage === "ACTIVE" || stage === "DELIVERED" || stage === "RETAINED";
}

export function isWonDeal(stage: string | null | undefined) {
  return stage === "SIGNED" || isActiveClientStage(stage);
}

export function formatMonthlyValue(cents: number | null | undefined) {
  if (!cents) return "—";
  return `$${cents.toLocaleString()}/mo`;
}

export const DEAL_KANBAN_COLUMNS: { stage: DealStage; label: string; description: string }[] = [
  { stage: "NEW_LEAD", label: "New Lead", description: "Needs review" },
  { stage: "CONTACTED", label: "Contacted", description: "Waiting on reply" },
  { stage: "INTERESTED", label: "Interested", description: "Needs call booked" },
  { stage: "DISCOVERY_BOOKED", label: "Discovery Booked", description: "Call scheduled" },
  { stage: "DISCOVERY_COMPLETED", label: "Discovery Done", description: "Scope known" },
  { stage: "PROPOSAL_SENT", label: "Proposal Sent", description: "Waiting on decision" },
  { stage: "NEGOTIATING", label: "Negotiating", description: "In discussion" },
  { stage: "SIGNED", label: "Signed", description: "Ready to kick off" },
  { stage: "ACTIVE", label: "Active Project", description: "Build in progress" },
  { stage: "DELIVERED", label: "Delivered", description: "Site live" },
  { stage: "RETAINED", label: "Retainer", description: "Ongoing work" },
  { stage: "LOST", label: "Lost", description: "Closed out" },
];

export const DEAL_HEALTH_META: Record<DealHealth, { label: string; dotClass: string; pillClasses: string }> = {
  HOT:   { label: "Hot",   dotClass: "bg-orange-400",  pillClasses: "border-orange-500/20 bg-orange-500/10 text-orange-300" },
  WARM:  { label: "Warm",  dotClass: "bg-amber-400",   pillClasses: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
  STALE: { label: "Stale", dotClass: "bg-zinc-600",    pillClasses: "border-zinc-600/20 bg-zinc-600/5 text-zinc-500" },
  RISKY: { label: "Risky", dotClass: "bg-red-500",     pillClasses: "border-red-500/20 bg-red-500/10 text-red-300" },
  WON:   { label: "Won",   dotClass: "bg-emerald-400", pillClasses: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  LOST:  { label: "Lost",  dotClass: "bg-zinc-700",    pillClasses: "border-zinc-700/20 bg-zinc-700/10 text-zinc-600" },
};

/**
 * Compute deal health from available date/stage signals.
 * This is always calculated — the stored dealHealth field is reserved for manual overrides (future).
 *
 * Rules:
 *   LOST  — stage is LOST or no stage
 *   WON   — stage is SIGNED / ACTIVE / DELIVERED / RETAINED
 *   RISKY — PROPOSAL_SENT for 21+ days without signing
 *   HOT   — last inbound/outbound activity within 7 days (open deal)
 *   WARM  — last activity within 14 days (open deal)
 *   STALE — no activity for 14+ days (open deal)
 */
export function computeDealHealth(lead: {
  dealStage: string | null;
  proposalSentAt: Date | string | null;
  lastReplyAt: Date | string | null;
  lastContactedAt: Date | string | null;
}): DealHealth {
  const stage = lead.dealStage;

  if (!stage || stage === "LOST") return "LOST";
  if (isWonDeal(stage)) return "WON";

  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Risky: proposal open 21+ days
  if (stage === "PROPOSAL_SENT" && lead.proposalSentAt) {
    const sent = new Date(lead.proposalSentAt as string);
    if (!isNaN(sent.getTime()) && (now - sent.getTime()) / MS_PER_DAY >= 21) {
      return "RISKY";
    }
  }

  // Last meaningful contact (most recent of reply or outbound)
  const candidates = [lead.lastReplyAt, lead.lastContactedAt]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((t) => !isNaN(t));

  if (candidates.length === 0) return "STALE";

  const daysSince = (now - Math.max(...candidates)) / MS_PER_DAY;
  if (daysSince <= 7) return "HOT";
  if (daysSince <= 14) return "WARM";
  return "STALE";
}

export function isActionOverdue(dueAt: Date | string | null | undefined): boolean {
  if (!dueAt) return false;
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

export function getDaysUntilRenewal(renewalDate: Date | string | null | undefined): number | null {
  if (!renewalDate) return null;
  const d = renewalDate instanceof Date ? renewalDate : new Date(renewalDate);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
