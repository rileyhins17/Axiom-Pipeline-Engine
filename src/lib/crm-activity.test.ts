import { strict as assert } from "node:assert";
import test from "node:test";

import {
  buildDealUpdateActivities,
  getDefaultNextActionForStage,
} from "./crm-activity";
import type { LeadRecord } from "./prisma";

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  const now = new Date("2026-01-01T12:00:00.000Z");

  return {
    id: 1,
    businessName: "Axiom Test Lead",
    niche: "Roofers",
    city: "Kitchener",
    category: "Roofing",
    address: null,
    phone: null,
    email: "owner@example.ca",
    socialLink: null,
    websiteUrl: "https://example.ca",
    websiteDomain: "example.ca",
    rating: 4.8,
    reviewCount: 50,
    websiteStatus: "ACTIVE",
    contactName: null,
    tacticalNote: null,
    leadScore: null,
    websiteGrade: "C",
    axiomScore: 70,
    axiomTier: "B",
    scoreBreakdown: null,
    painSignals: null,
    callOpener: null,
    followUpQuestion: null,
    axiomWebsiteAssessment: null,
    dedupeKey: null,
    dedupeMatchedBy: null,
    emailType: "owner",
    emailConfidence: 0.9,
    emailFlags: null,
    phoneConfidence: null,
    phoneFlags: null,
    disqualifiers: null,
    disqualifyReason: null,
    outreachStatus: "REPLIED",
    outreachChannel: "email",
    firstContactedAt: null,
    lastContactedAt: null,
    nextFollowUpDue: null,
    outreachNotes: null,
    enrichedAt: now,
    enrichmentData: null,
    source: "test",
    isArchived: false,
    createdAt: now,
    lastUpdated: now,
    dealStage: null,
    engagementType: null,
    monthlyValue: null,
    proposalValue: null,
    proposalStatus: null,
    packageRecommendation: null,
    projectStartDate: null,
    launchTargetDate: null,
    projectOwner: null,
    renewalDate: null,
    projectNotes: null,
    nextAction: null,
    nextActionDueAt: null,
    lastReplyAt: now,
    dealHealth: null,
    dealLostReason: null,
    proposalSentAt: null,
    signedAt: null,
    clientPriority: null,
    ...overrides,
  };
}

test("CRM stage defaults create an actionable business-day follow-up", () => {
  const friday = new Date("2026-01-02T10:00:00.000Z");
  const action = getDefaultNextActionForStage("NEGOTIATING", friday);

  assert.equal(action?.nextAction, "Confirm scope and next step");
  assert.equal(action?.nextActionDueAt.toISOString().slice(0, 10), "2026-01-05");
});

test("CRM activity records inbox-to-pipeline and proposal milestones", () => {
  const before = makeLead();
  const after = makeLead({
    dealStage: "PROPOSAL_SENT",
    proposalSentAt: new Date("2026-01-06T15:00:00.000Z"),
  });

  const activities = buildDealUpdateActivities(before, after);

  assert.deepEqual(activities.map((activity) => activity.type), ["STAGE_CHANGE", "PROPOSAL_SENT"]);
  assert.equal(activities[0].title, "Qualified into pipeline");
  assert.match(activities[0].body ?? "", /Inbox to Proposal Sent/);
  assert.equal(activities[1].title, "Proposal sent");
});

test("CRM activity records notes and deal value changes", () => {
  const before = makeLead({ dealStage: "NEGOTIATING" });
  const after = makeLead({
    dealStage: "NEGOTIATING",
    monthlyValue: 650,
    projectNotes: "Needs rebuild, booking flow, and Cloudflare launch plan.",
  });

  const activities = buildDealUpdateActivities(before, after);

  assert.deepEqual(activities.map((activity) => activity.type), ["NOTE", "SYSTEM"]);
  assert.equal(activities[0].title, "Project notes updated");
  assert.equal(activities[1].body, "$650/mo");
});
