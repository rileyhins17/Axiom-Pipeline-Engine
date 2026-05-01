import { strict as assert } from "node:assert";
import test from "node:test";

import { resolvePublicBusinessEmail, type EmailDiscoveryPage } from "./public-email-intelligence";

function page(text: string, links: EmailDiscoveryPage["links"] = []): EmailDiscoveryPage {
  return {
    url: "https://example-roofing.ca/contact",
    role: "contact",
    sourceLabel: "contact page",
    text,
    links,
  };
}

test("resolvePublicBusinessEmail does not select generic or sales-style role inboxes", () => {
  const result = resolvePublicBusinessEmail({
    businessName: "Example Roofing",
    businessWebsite: "https://example-roofing.ca",
    pages: [
      page("Email us at info@example-roofing.ca or sales@example-roofing.ca for quotes.", [
        { href: "mailto:marketing@example-roofing.ca", text: "Marketing" },
      ]),
    ],
  });

  assert.equal(result.email, "");
  assert.equal(result.emailType, "unknown");
  assert.match(result.reason, /generic|role/i);
  assert.equal(result.candidates.length, 3);
});

test("resolvePublicBusinessEmail prefers a person inbox over generic candidates", () => {
  const result = resolvePublicBusinessEmail({
    businessName: "Example Roofing",
    businessWebsite: "https://example-roofing.ca",
    ownerName: "Sarah Lee",
    pages: [
      page("For estimates email info@example-roofing.ca. Owner Sarah Lee handles projects directly.", [
        { href: "mailto:sarah.lee@example-roofing.ca", text: "Email Sarah Lee" },
      ]),
    ],
  });

  assert.equal(result.email, "sarah.lee@example-roofing.ca");
  assert.equal(result.emailType, "owner");
});
