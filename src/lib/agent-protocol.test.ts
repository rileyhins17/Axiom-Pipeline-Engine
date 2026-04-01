import { strict as assert } from "node:assert";
import test from "node:test";

import { validateAgentLeadPayload } from "./agent-protocol";

function buildValidLead() {
  return {
    address: "123 Main St",
    axiomScore: 72,
    axiomTier: "B",
    axiomWebsiteAssessment: null,
    businessName: "Sunshine Med Spa",
    callOpener: "Hi there, I took a look at your site and saw a couple quick wins.",
    category: null,
    city: "Waterloo",
    contactName: "Jane Doe",
    dedupeKey: "domain:sunshinemedspa.com",
    dedupeMatchedBy: "domain",
    disqualifiers: null,
    disqualifyReason: null,
    email: "hello@sunshinemedspa.com",
    emailConfidence: 0.84,
    emailFlags: JSON.stringify(["business_domain_match"]),
    emailType: "staff",
    followUpQuestion: "Are you mainly looking to increase booked consultations this quarter?",
    isArchived: false,
    lastUpdated: new Date().toISOString(),
    leadScore: 72,
    niche: "Med-Spas",
    painSignals: "[]",
    phone: "+1 (519) 555-1234",
    phoneConfidence: 0.9,
    phoneFlags: JSON.stringify(["valid_ontario_area_code"]),
    rating: 4.6,
    reviewCount: 128,
    scoreBreakdown: JSON.stringify({ businessValue: 22, painOpportunity: 18, reachability: 16, localFit: 8 }),
    socialLink: null,
    source: "Med-Spas|Waterloo|2026-03-21",
    tacticalNote: "The site looks functional but could convert better on mobile.",
    websiteGrade: "B",
    websiteDomain: "sunshinemedspa.com",
    websiteUrl: "https://sunshinemedspa.com",
    websiteStatus: "ACTIVE",
  };
}

test("validateAgentLeadPayload reports the exact failing path", () => {
  const invalid = {
    ...buildValidLead(),
    websiteUrl: "https://" + "a".repeat(2100) + ".com",
  };

  const result = validateAgentLeadPayload(invalid);

  assert.equal(result.success, false);
  assert.match(result.error, /websiteUrl/i);
});

test("validateAgentLeadPayload accepts a normalized worker lead", () => {
  const result = validateAgentLeadPayload(buildValidLead());

  assert.equal(result.success, true);
});
