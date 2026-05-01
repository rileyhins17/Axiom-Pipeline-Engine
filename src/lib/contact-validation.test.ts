import { strict as assert } from "node:assert";
import test from "node:test";

import { isGenericRoleEmail, validateEmail } from "./contact-validation";

test("sales and marketing style inboxes are treated as generic role addresses", () => {
  for (const email of [
    "info@example.ca",
    "sales@example.ca",
    "marketing@example.ca",
    "quotes@example.ca",
    "estimating@example.ca",
    "booking@example.ca",
    "web@example.ca",
  ]) {
    const validation = validateEmail(email, { businessWebsite: "https://example.ca" });
    assert.equal(validation.type, "generic", email);
    assert.equal(isGenericRoleEmail(email), true, email);
    assert(validation.flags.includes("generic_prefix"), email);
  }
});

test("person-named business inbox remains sendable", () => {
  const validation = validateEmail("sarah.lee@example.ca", {
    businessWebsite: "https://example.ca",
    ownerName: "Sarah Lee",
  });

  assert.equal(validation.type, "owner");
  assert.equal(isGenericRoleEmail("sarah.lee@example.ca"), false);
  assert(validation.confidence >= 0.8);
});
