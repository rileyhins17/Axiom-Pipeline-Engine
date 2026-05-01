import { strict as assert } from "node:assert";
import test from "node:test";

import { computeAxiomScore } from "./axiom-scoring";
import { AXIOM_OUTREACH_MIN_SCORE } from "./lead-qualification";

test("Axiom scoring treats a resolved owner email as valid pipeline reachability", () => {
  const result = computeAxiomScore({
    assessment: null,
    category: "Roofing contractor",
    city: "Kitchener",
    contact: {
      email: "owner@example-roofing.ca",
      emailConfidence: 0.88,
      emailFlags: ["business_domain", "owner_name_match"],
      emailType: "owner",
      phoneConfidence: 0.9,
      phoneFlags: ["valid_ontario_area_code"],
    },
    hasContactForm: false,
    hasSocialMessaging: false,
    niche: "Roofers",
    painSignals: [
      {
        evidence: "No website found for the business.",
        severity: 4,
        source: "maps_data",
        type: "NO_WEBSITE",
      },
    ],
    rating: 4.6,
    reviewContent: "",
    reviewCount: 64,
    websiteContent: "",
    websiteStatus: "MISSING",
  });

  assert.equal(result.hasValidEmail, true);
  assert.equal(result.emailGateApplied, false);
  assert(result.axiomScore > AXIOM_OUTREACH_MIN_SCORE);
});

test("Axiom scoring does not treat email type alone as a valid email", () => {
  const result = computeAxiomScore({
    assessment: null,
    category: "Roofing contractor",
    city: "Kitchener",
    contact: {
      email: "",
      emailConfidence: 0.88,
      emailFlags: [],
      emailType: "owner",
      phoneConfidence: 0.9,
      phoneFlags: ["valid_ontario_area_code"],
    },
    hasContactForm: false,
    hasSocialMessaging: false,
    niche: "Roofers",
    painSignals: [],
    rating: 4.6,
    reviewContent: "",
    reviewCount: 64,
    websiteContent: "",
    websiteStatus: "MISSING",
  });

  assert.equal(result.hasValidEmail, false);
  assert(result.axiomScore <= AXIOM_OUTREACH_MIN_SCORE);
});
