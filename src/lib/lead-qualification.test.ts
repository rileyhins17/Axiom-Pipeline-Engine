import { strict as assert } from "node:assert";
import test from "node:test";

import { hasValidPipelineEmail, normalizePipelineEmail } from "./lead-qualification";

test("pipeline email normalization strips mailto wrappers and encoded whitespace", () => {
  assert.equal(
    normalizePipelineEmail("mailto:%20Owner.Name%40Example-Roofing.ca?subject=Hello"),
    "owner.name@example-roofing.ca",
  );
  assert.equal(normalizePipelineEmail(" <TEAM@Example.ca>, "), "team@example.ca");
});

test("pipeline email validation rejects wrapper text that does not contain an address", () => {
  assert.equal(hasValidPipelineEmail({ email: "mailto:not-an-email", emailType: "owner", emailConfidence: 1 }), false);
});
