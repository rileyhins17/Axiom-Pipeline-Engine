import { strict as assert } from "node:assert";
import test from "node:test";

import { shouldUseExistingLeadForScrapeDedupe } from "./cloud-scrape-worker";

test("archived empty scrape ghosts do not block a future quality scrape", () => {
  assert.equal(
    shouldUseExistingLeadForScrapeDedupe({
      axiomScore: 34,
      axiomTier: "D",
      email: "",
      isArchived: true,
      websiteDomain: null,
      websiteUrl: null,
    }),
    false,
  );
});

test("usable existing leads still participate in scrape dedupe", () => {
  assert.equal(
    shouldUseExistingLeadForScrapeDedupe({
      email: "owner@example.com",
      isArchived: true,
    }),
    true,
  );

  assert.equal(
    shouldUseExistingLeadForScrapeDedupe({
      isArchived: false,
      websiteUrl: null,
    }),
    true,
  );
});
