import { strict as assert } from "node:assert";
import test from "node:test";

import { generateDedupeKey } from "./dedupe";

test("generateDedupeKey returns bounded stable keys", () => {
  const longAddress = "123 Long Address Street, Unit 400, Some Very Long Building Name, Kitchener, ON N2G 1A1".repeat(4);

  const a = generateDedupeKey(
    "Sunshine Cosmetic Clinic & Medi Spa",
    "Waterloo",
    "+1 (519) 555-1234",
    "https://sunshinemedspa.com",
    longAddress,
  );
  const b = generateDedupeKey(
    "Sunshine Cosmetic Clinic & Medi Spa",
    "Waterloo",
    "+1 (519) 555-1234",
    "https://sunshinemedspa.com",
    longAddress,
  );

  assert.equal(a.key, b.key);
  assert.equal(a.matchedBy, b.matchedBy);
  assert.ok(a.key.length <= 256);
  assert.match(a.key, /^(phone|domain|addr|name):/);
});

