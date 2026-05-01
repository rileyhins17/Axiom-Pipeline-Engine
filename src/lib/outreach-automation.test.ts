import { strict as assert } from "node:assert";
import test from "node:test";

import { selectAutomationReadyLeads } from "./outreach-automation";
import type { LeadRecord } from "./prisma";

function makeLead(overrides: Partial<LeadRecord> & Pick<LeadRecord, "id">): LeadRecord {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const { id, ...rest } = overrides;

  return {
    id,
    businessName: `Lead ${id} Roofing`,
    niche: "Roofers",
    city: "Kitchener",
    category: "Roofing",
    address: null,
    phone: null,
    email: `owner${id}@lead${id}.ca`,
    socialLink: null,
    websiteUrl: `https://lead${id}.ca`,
    websiteDomain: `lead${id}.ca`,
    rating: 4.7,
    reviewCount: 80,
    websiteStatus: "ACTIVE",
    contactName: null,
    tacticalNote: null,
    leadScore: null,
    websiteGrade: "D",
    axiomScore: 65,
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
    outreachStatus: "READY_FOR_FIRST_TOUCH",
    outreachChannel: null,
    firstContactedAt: null,
    lastContactedAt: null,
    nextFollowUpDue: null,
    outreachNotes: null,
    enrichedAt: now,
    enrichmentData: "{}",
    source: "test",
    isArchived: false,
    createdAt: now,
    lastUpdated: now,
    ...rest,
  };
}

test("first-touch selection filters ineligible leads before the queue batch limit", () => {
  const ineligibleTopFifty = Array.from({ length: 50 }, (_, index) =>
    makeLead({
      id: index + 1,
      axiomScore: 99,
      email: `info${index + 1}@blocked${index + 1}.ca`,
      emailType: "generic",
    }),
  );
  const viableBelowLimit = Array.from({ length: 5 }, (_, index) =>
    makeLead({
      id: 51 + index,
      axiomScore: 60,
      email: `owner${index + 1}@viable${index + 1}.ca`,
      emailType: "owner",
    }),
  );

  const result = selectAutomationReadyLeads({
    leads: [...ineligibleTopFifty, ...viableBelowLimit],
  });

  assert.deepEqual(
    result.leads.map((lead) => lead.id).sort((a, b) => a - b),
    viableBelowLimit.map((lead) => lead.id),
  );
  assert.equal(result.diagnostics.eligibleFirstTouchCount, viableBelowLimit.length);
  assert.equal(result.diagnostics.skippedGenericEmailCount, ineligibleTopFifty.length);
});

test("first-touch selection blocks contacted, sent, and open first-touch recipients", () => {
  const contactedAt = new Date("2026-01-02T12:00:00.000Z");
  const alreadyContacted = makeLead({ id: 1, firstContactedAt: contactedAt });
  const alreadySent = makeLead({ id: 2, email: "owner@already-sent.ca" });
  const openByLead = makeLead({ id: 3, email: "owner@open-lead.ca" });
  const openByEmail = makeLead({ id: 4, email: "owner@open-email.ca" });
  const viable = makeLead({ id: 5, email: "owner@viable.ca" });

  const result = selectAutomationReadyLeads({
    leads: [alreadyContacted, alreadySent, openByLead, openByEmail, viable],
    sentRecipientEmails: new Set(["owner@already-sent.ca"]),
    openFirstTouchLeadIds: new Set([openByLead.id]),
    openFirstTouchRecipientEmails: new Set(["owner@open-email.ca"]),
  });

  assert.deepEqual(result.leads.map((lead) => lead.id), [viable.id]);
  assert.equal(result.diagnostics.skippedAlreadyContactedCount, 2);
  assert.equal(result.diagnostics.skippedExistingOpenStepCount, 2);
});
