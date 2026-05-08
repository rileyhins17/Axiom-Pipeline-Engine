import { strict as assert } from "node:assert";
import test from "node:test";

import { evaluateScrapeExtractionQuality } from "./scrape-quality";

test("scrape quality stays healthy when field coverage is normal", () => {
  const result = evaluateScrapeExtractionQuality({
    targetsFound: 40,
    targetsWithCategory: 32,
    targetsWithPhone: 36,
    targetsWithRatingReviews: 38,
    targetsWithWebsite: 24,
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.shouldFailJob, false);
  assert.equal(result.shouldPauseIntake, false);
  assert.equal(result.metrics.websiteCoverage, 0.6);
});

test("scrape quality warns on category selector drift without failing the job", () => {
  const result = evaluateScrapeExtractionQuality({
    targetsFound: 47,
    targetsWithCategory: 0,
    targetsWithPhone: 47,
    targetsWithRatingReviews: 47,
    targetsWithWebsite: 42,
  });

  assert.equal(result.status, "warning");
  assert.equal(result.shouldFailJob, false);
  assert.equal(result.issues.some((issue) => issue.code === "category_coverage_zero"), true);
});

test("scrape quality fails and pauses intake when websites collapse while phones still load", () => {
  const result = evaluateScrapeExtractionQuality({
    targetsFound: 47,
    targetsWithCategory: 0,
    targetsWithPhone: 47,
    targetsWithRatingReviews: 47,
    targetsWithWebsite: 0,
  });

  assert.equal(result.status, "critical");
  assert.equal(result.shouldFailJob, true);
  assert.equal(result.shouldPauseIntake, true);
  assert.equal(result.issues.some((issue) => issue.code === "website_coverage_collapse"), true);
});

