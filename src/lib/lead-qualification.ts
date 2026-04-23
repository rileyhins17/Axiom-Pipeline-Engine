export const AXIOM_OUTREACH_MIN_SCORE = 35;

export type EmailQualificationInput = {
  email: string | null | undefined;
  emailConfidence?: number | null | undefined;
  emailType?: string | null | undefined;
  emailFlags?: string | null | string[] | undefined;
};

export type LeadQualificationInput = EmailQualificationInput & {
  axiomScore: number | null | undefined;
};

const INVALID_EMAIL_FLAGS = new Set([
  "no_email",
  "invalid_format",
  "disposable_domain",
  "noreply",
]);

function normalizeFlags(value: string | null | string[] | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) {
    return value.map((flag) => String(flag).trim()).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((flag) => String(flag).trim()).filter(Boolean);
    }
  } catch {
    return value
      .split(",")
      .map((flag) => flag.trim())
      .filter(Boolean);
  }

  return [];
}

export function hasValidPipelineEmail(input: EmailQualificationInput) {
  if (!input.email || !input.email.trim()) return false;

  const flags = normalizeFlags(input.emailFlags);
  if (flags.some((flag) => INVALID_EMAIL_FLAGS.has(flag))) {
    return false;
  }

  const emailType = (input.emailType || "unknown").toLowerCase();
  const confidence = Number(input.emailConfidence || 0);

  if (emailType === "owner") {
    return confidence >= 0.58;
  }

  if (emailType === "staff") {
    return confidence >= 0.62;
  }

  if (emailType === "generic") {
    // Role/department inboxes (info@, contact@, hello@, sales@) are a
    // waste of sender reputation — they rarely reach a decision-maker,
    // they get marked as spam at a higher rate, and they inflate open
    // counts without producing replies. Treat them as NOT pipeline-valid
    // so neither auto-queue nor the manual outreach UI will dispatch
    // to them. If a user really wants to contact info@ they should
    // edit the lead's email to a personal address first.
    return false;
  }

  return false;
}

export function isLeadOutreachEligible(input: LeadQualificationInput) {
  return (
    typeof input.axiomScore === "number" &&
    Number.isFinite(input.axiomScore) &&
    input.axiomScore > AXIOM_OUTREACH_MIN_SCORE &&
    hasValidPipelineEmail(input)
  );
}

export function getScoreBand(score: number | null | undefined, outreachEligible = false) {
  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : 0;

  if (outreachEligible && safeScore >= 70) {
    return {
      label: "Pipeline Ready",
      ringClass: "from-emerald-400 via-cyan-300 to-emerald-300",
      glowClass: "shadow-[0_0_55px_rgba(34,197,94,0.22)]",
      textClass: "text-emerald-300",
      accentClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    };
  }

  if (safeScore >= 60) {
    return {
      label: "Strong",
      ringClass: "from-cyan-400 via-sky-300 to-blue-400",
      glowClass: "shadow-[0_0_55px_rgba(56,189,248,0.18)]",
      textClass: "text-cyan-300",
      accentClass: "border-cyan-500/20 bg-cyan-500/10 text-cyan-200",
    };
  }

  if (safeScore >= AXIOM_OUTREACH_MIN_SCORE) {
    return {
      label: "Promising",
      ringClass: "from-amber-400 via-orange-300 to-yellow-300",
      glowClass: "shadow-[0_0_50px_rgba(251,191,36,0.18)]",
      textClass: "text-amber-300",
      accentClass: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    label: "Weak",
    ringClass: "from-rose-400 via-pink-400 to-red-400",
    glowClass: "shadow-[0_0_45px_rgba(251,113,133,0.16)]",
    textClass: "text-rose-300",
    accentClass: "border-rose-500/20 bg-rose-500/10 text-rose-200",
  };
}

export function getWebsiteQualityLabel(
  websiteStatus: string | null | undefined,
  websiteGrade?: string | null,
  websiteRiskScore?: number | null,
) {
  if (websiteStatus === "MISSING") {
    return "No Website";
  }

  const grade = (websiteGrade || "").toUpperCase();
  if (grade === "A" || grade === "B") {
    return "Strong Website";
  }

  if (typeof websiteRiskScore === "number" && websiteRiskScore <= 5) {
    return "Strong Website";
  }

  return "Weak Website";
}
