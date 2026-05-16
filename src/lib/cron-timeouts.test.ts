import { strict as assert } from "node:assert";
import test from "node:test";

import { getCronTimeoutBudgets } from "./cron-timeouts";

test("cron scrape timeout derives from Cloudflare scrape runtime with cleanup buffer", () => {
  const budgets = getCronTimeoutBudgets({ CLOUD_SCRAPE_TIMEOUT_MS: "840000" });

  assert.equal(budgets.scrape, 870_000);
  assert.equal(budgets.intake, 120_000);
  assert.equal(budgets.scheduler, 900_000);
  assert.equal(budgets.digest, 60_000);
});

test("cron scrape timeout falls back to production scrape runtime for invalid env", () => {
  const budgets = getCronTimeoutBudgets({ CLOUD_SCRAPE_TIMEOUT_MS: "not-a-number" });

  assert.equal(budgets.scrape, 870_000);
});
