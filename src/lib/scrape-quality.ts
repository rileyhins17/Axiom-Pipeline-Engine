export type ScrapeQualityStatus = "healthy" | "warning" | "critical";

export type ScrapeQualityIssueCode =
  | "no_targets"
  | "website_coverage_low"
  | "website_coverage_collapse"
  | "category_coverage_zero"
  | "category_coverage_low"
  | "phone_coverage_low"
  | "maps_contact_surface_collapse";

export type ScrapeQualityIssue = {
  code: ScrapeQualityIssueCode;
  detail: string;
  severity: ScrapeQualityStatus;
};

export type ScrapeExtractionMetrics = {
  targetsFound: number;
  targetsWithCategory: number;
  targetsWithPhone: number;
  targetsWithRatingReviews: number;
  targetsWithWebsite: number;
};

export type ScrapeQualityEvaluation = {
  issues: ScrapeQualityIssue[];
  metrics: ScrapeExtractionMetrics & {
    categoryCoverage: number;
    phoneCoverage: number;
    ratingReviewCoverage: number;
    websiteCoverage: number;
  };
  shouldPauseIntake: boolean;
  shouldFailJob: boolean;
  status: ScrapeQualityStatus;
};

function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return Number((part / total).toFixed(3));
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clampCount(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

export function evaluateScrapeExtractionQuality(input: ScrapeExtractionMetrics): ScrapeQualityEvaluation {
  const targetsFound = clampCount(input.targetsFound);
  const targetsWithWebsite = clampCount(input.targetsWithWebsite);
  const targetsWithCategory = clampCount(input.targetsWithCategory);
  const targetsWithPhone = clampCount(input.targetsWithPhone);
  const targetsWithRatingReviews = clampCount(input.targetsWithRatingReviews);

  const websiteCoverage = ratio(targetsWithWebsite, targetsFound);
  const categoryCoverage = ratio(targetsWithCategory, targetsFound);
  const phoneCoverage = ratio(targetsWithPhone, targetsFound);
  const ratingReviewCoverage = ratio(targetsWithRatingReviews, targetsFound);
  const issues: ScrapeQualityIssue[] = [];

  if (targetsFound === 0) {
    issues.push({
      code: "no_targets",
      detail: "No usable Google Maps targets were found.",
      severity: "warning",
    });
  }

  if (targetsFound >= 10 && targetsWithWebsite === 0 && phoneCoverage >= 0.7) {
    issues.push({
      code: "website_coverage_collapse",
      detail: `Website extraction collapsed: 0/${targetsFound} targets had a website while ${pct(phoneCoverage)} still had phones.`,
      severity: "critical",
    });
  } else if (targetsFound >= 10 && websiteCoverage < 0.2) {
    issues.push({
      code: "website_coverage_low",
      detail: `Website coverage is unusually low: ${targetsWithWebsite}/${targetsFound} (${pct(websiteCoverage)}).`,
      severity: "warning",
    });
  }

  if (targetsFound >= 10 && targetsWithCategory === 0) {
    issues.push({
      code: "category_coverage_zero",
      detail: `Category extraction returned 0/${targetsFound} targets.`,
      severity: "warning",
    });
  } else if (targetsFound >= 10 && categoryCoverage < 0.15) {
    issues.push({
      code: "category_coverage_low",
      detail: `Category coverage is low: ${targetsWithCategory}/${targetsFound} (${pct(categoryCoverage)}).`,
      severity: "warning",
    });
  }

  if (targetsFound >= 10 && phoneCoverage < 0.5) {
    issues.push({
      code: "phone_coverage_low",
      detail: `Phone coverage is low: ${targetsWithPhone}/${targetsFound} (${pct(phoneCoverage)}).`,
      severity: "warning",
    });
  }

  if (
    targetsFound >= 10 &&
    targetsWithWebsite === 0 &&
    targetsWithPhone === 0 &&
    ratingReviewCoverage >= 0.5
  ) {
    issues.push({
      code: "maps_contact_surface_collapse",
      detail: `Maps loaded ratings/reviews (${pct(ratingReviewCoverage)}) but no phone or website fields; contact selectors likely drifted.`,
      severity: "critical",
    });
  }

  const shouldFailJob = issues.some((issue) => issue.severity === "critical");
  const status: ScrapeQualityStatus = shouldFailJob
    ? "critical"
    : issues.length > 0
      ? "warning"
      : "healthy";

  return {
    issues,
    metrics: {
      targetsFound,
      targetsWithCategory,
      targetsWithPhone,
      targetsWithRatingReviews,
      targetsWithWebsite,
      categoryCoverage,
      phoneCoverage,
      ratingReviewCoverage,
      websiteCoverage,
    },
    shouldPauseIntake: shouldFailJob,
    shouldFailJob,
    status,
  };
}

export class ScrapeQualityGateError extends Error {
  evaluation: ScrapeQualityEvaluation;

  constructor(evaluation: ScrapeQualityEvaluation) {
    const summary = evaluation.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.detail)
      .join(" ");
    super(`Scrape quality gate tripped: ${summary || "critical extraction drift detected"}`);
    this.name = "ScrapeQualityGateError";
    this.evaluation = evaluation;
  }
}

