import { strict as assert } from "node:assert";
import test from "node:test";

import { buildFollowUpContextForTesting } from "./outreach-email-generator";
import type { EnrichmentResult } from "./outreach-enrichment";
import type { LeadRecord } from "./prisma";

function makeLead(): LeadRecord {
  const now = new Date("2026-01-01T12:00:00.000Z");
  return {
    id: 101,
    businessName: "Village Dallas",
    niche: "Masonry",
    city: "Nashville",
    category: "Masonry",
    address: null,
    phone: null,
    email: "owner@villagedallas.ca",
    socialLink: null,
    websiteUrl: "https://villagedallas.ca",
    websiteDomain: "villagedallas.ca",
    rating: 4.9,
    reviewCount: 37,
    websiteStatus: "ACTIVE",
    contactName: null,
    tacticalNote: "Lead with the missing service-area proof and unclear quote path.",
    leadScore: null,
    websiteGrade: "C",
    axiomScore: 72,
    axiomTier: "B",
    scoreBreakdown: null,
    painSignals: JSON.stringify([
      {
        type: "conversion",
        severity: 7,
        source: "website",
        evidence: "The contact path is buried below project photos.",
      },
    ]),
    callOpener: null,
    followUpQuestion: null,
    axiomWebsiteAssessment: JSON.stringify({
      overallGrade: "C",
      speedRisk: 3,
      conversionRisk: 7,
      trustRisk: 4,
      seoRisk: 5,
      topFixes: ["Move quote CTA above the fold", "Add service-area proof"],
    }),
    dedupeKey: null,
    dedupeMatchedBy: null,
    emailType: "owner",
    emailConfidence: 0.95,
    emailFlags: null,
    phoneConfidence: null,
    phoneFlags: null,
    disqualifiers: null,
    disqualifyReason: null,
    outreachStatus: "OUTREACHED",
    outreachChannel: "EMAIL",
    firstContactedAt: now,
    lastContactedAt: now,
    nextFollowUpDue: null,
    outreachNotes: null,
    enrichedAt: now,
    enrichmentData: "{}",
    source: "test",
    isArchived: false,
    createdAt: now,
    lastUpdated: now,
    dealStage: null,
    engagementType: null,
    monthlyValue: null,
    projectStartDate: null,
    renewalDate: null,
    projectNotes: null,
    nextAction: null,
    nextActionDueAt: null,
    lastReplyAt: null,
    dealHealth: null,
    dealLostReason: null,
    proposalSentAt: null,
    signedAt: null,
    clientPriority: null,
  };
}

const enrichment: EnrichmentResult = {
  valueProposition: "Turn more site visits into quote requests.",
  pitchAngle: "Small conversion cleanup tied to the current masonry site.",
  keyPainPoint: "the quote path is hard to find from the homepage",
  competitiveEdge: "clearer local proof and fewer clicks to contact",
  personalizedHook: "The site shows project work, but the path to ask for a quote is easy to miss.",
  recommendedCTA: "Ask whether sending two specific fixes would be useful.",
  emailTone: "casual",
  anticipatedObjections: ["Already has a site", "Too busy to review a redesign"],
  enrichmentSummary: "Current site needs a clearer quote path and local proof.",
};

test("follow-up context uses current lead intelligence instead of repeating stale sent copy", () => {
  const context = buildFollowUpContextForTesting(
    makeLead(),
    enrichment,
    "Riley Hinsperger",
    {
      subject: "Old generic subject",
      bodyPlain: "Your 5-star reviews are a strong asset and should be higher on the homepage.",
      sentAt: "2026-01-01T12:00:00.000Z",
    },
    "FOLLOW_UP_1",
  );

  assert(context.includes("Move quote CTA above the fold"));
  assert(context.includes("The contact path is buried below project photos."));
  assert(!context.includes("Your 5-star reviews are a strong asset"));
  assert(!context.includes("PREVIOUS EMAIL BODY"));
});
