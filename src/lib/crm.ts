export const DEAL_STAGE_OPTIONS = [
  { value: "PROPOSAL_SENT", label: "Proposal Sent", shortLabel: "Proposal", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
  { value: "NEGOTIATING", label: "Negotiating", shortLabel: "Negotiating", classes: "border-orange-500/20 bg-orange-500/10 text-orange-300" },
  { value: "SIGNED", label: "Signed", shortLabel: "Signed", classes: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" },
  { value: "ACTIVE", label: "Active", shortLabel: "Active", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  { value: "DELIVERED", label: "Delivered", shortLabel: "Delivered", classes: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  { value: "RETAINED", label: "Retained", shortLabel: "Retained", classes: "border-purple-500/20 bg-purple-500/10 text-purple-300" },
  { value: "LOST", label: "Lost", shortLabel: "Lost", classes: "border-red-500/20 bg-red-500/10 text-red-300" },
] as const;

export const ENGAGEMENT_TYPE_OPTIONS = [
  { value: "RETAINER", label: "Growth Retainer", shortLabel: "Retainer" },
  { value: "OWNERSHIP", label: "Ownership Build", shortLabel: "Ownership" },
  { value: "REBUILD", label: "Rebuild & Migrate", shortLabel: "Rebuild" },
] as const;

export type DealStage = (typeof DEAL_STAGE_OPTIONS)[number]["value"];
export type EngagementType = (typeof ENGAGEMENT_TYPE_OPTIONS)[number]["value"];

const dealStageSet = new Set<string>(DEAL_STAGE_OPTIONS.map((o) => o.value));
const engagementTypeSet = new Set<string>(ENGAGEMENT_TYPE_OPTIONS.map((o) => o.value));

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && dealStageSet.has(value);
}

export function isEngagementType(value: unknown): value is EngagementType {
  return typeof value === "string" && engagementTypeSet.has(value);
}

export function getDealStageMeta(stage: string | null | undefined) {
  return DEAL_STAGE_OPTIONS.find((o) => o.value === stage) ?? null;
}

export function getEngagementTypeLabel(type: string | null | undefined) {
  return ENGAGEMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "—";
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
  { stage: "PROPOSAL_SENT", label: "Proposal Sent", description: "Waiting on decision" },
  { stage: "NEGOTIATING", label: "Negotiating", description: "In discussion" },
  { stage: "SIGNED", label: "Signed", description: "Ready to kick off" },
  { stage: "ACTIVE", label: "Active", description: "Build in progress" },
  { stage: "DELIVERED", label: "Delivered", description: "Site live" },
  { stage: "RETAINED", label: "Retained", description: "Ongoing retainer" },
];

export function getDaysUntilRenewal(renewalDate: Date | string | null | undefined): number | null {
  if (!renewalDate) return null;
  const d = renewalDate instanceof Date ? renewalDate : new Date(renewalDate);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
