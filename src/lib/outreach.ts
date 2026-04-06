export const READY_FOR_FIRST_TOUCH_STATUS = "READY_FOR_FIRST_TOUCH";

export const OUTREACH_STATUS_OPTIONS = [
  { value: "NOT_CONTACTED", label: "Not Contacted", shortLabel: "Idle", classes: "border-white/10 bg-white/5 text-zinc-300" },
  { value: READY_FOR_FIRST_TOUCH_STATUS, label: "Ready to Pitch", shortLabel: "Ready", classes: "border-purple-500/20 bg-purple-500/10 text-purple-300" },
  { value: "OUTREACHED", label: "Outreached", shortLabel: "Sent", classes: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" },
  { value: "FOLLOW_UP_DUE", label: "Follow-Up Due", shortLabel: "Due", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
  { value: "REPLIED", label: "Replied", shortLabel: "Replied", classes: "border-blue-500/20 bg-blue-500/10 text-blue-300" },
  { value: "INTERESTED", label: "Interested", shortLabel: "Hot", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
  { value: "CLOSED", label: "Closed", shortLabel: "Closed", classes: "border-purple-500/20 bg-purple-500/10 text-purple-300" },
  { value: "NOT_INTERESTED", label: "Not Interested", shortLabel: "Not fit", classes: "border-red-500/20 bg-red-500/10 text-red-300" },
] as const;

export const OUTREACH_CHANNEL_OPTIONS = [
  { value: "EMAIL", label: "Email" },
  { value: "TEXT", label: "Text" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "CALL", label: "Call" },
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUS_OPTIONS)[number]["value"];
export type OutreachChannel = (typeof OUTREACH_CHANNEL_OPTIONS)[number]["value"];

export type OutreachLeadFields = {
  outreachStatus: string | null;
  outreachChannel: string | null;
  firstContactedAt: string | Date | null;
  lastContactedAt: string | Date | null;
  nextFollowUpDue: string | Date | null;
  outreachNotes: string | null;
};

const outreachStatusSet = new Set<string>(OUTREACH_STATUS_OPTIONS.map((option) => option.value));
const outreachChannelSet = new Set<string>(OUTREACH_CHANNEL_OPTIONS.map((option) => option.value));

export function isOutreachStatus(value: unknown): value is OutreachStatus {
  return typeof value === "string" && outreachStatusSet.has(value);
}

export function isOutreachChannel(value: unknown): value is OutreachChannel {
  return typeof value === "string" && outreachChannelSet.has(value);
}

export function getOutreachStatusMeta(status: string | null | undefined) {
  return (
    OUTREACH_STATUS_OPTIONS.find((option) => option.value === status) ??
    OUTREACH_STATUS_OPTIONS[0]
  );
}

export function getOutreachChannelLabel(channel: string | null | undefined) {
  return OUTREACH_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "-";
}

export function isContactedOutreachStatus(status: string | null | undefined) {
  return !!status && status !== "NOT_CONTACTED";
}

export const OUTREACH_AUTO_INCLUDE_MIN_SCORE = 35;

export function isLeadAutoIncludedInOutreachHub(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) && score > OUTREACH_AUTO_INCLUDE_MIN_SCORE;
}

export function getOutreachPipelineLeadWhere() {
  return {
    AND: [
      { axiomScore: { gt: OUTREACH_AUTO_INCLUDE_MIN_SCORE } },
      { email: { not: null } },
      {
        OR: [{ outreachStatus: "NOT_CONTACTED" }, { outreachStatus: null }],
      },
    ],
  };
}

export function getContactedOutreachLeadWhere() {
  return {
    outreachStatus: { not: "NOT_CONTACTED" },
  };
}

export function formatOutreachDate(value: string | Date | null | undefined, includeTime = false) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  if (includeTime) {
    return parsed.toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return parsed.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toDateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
