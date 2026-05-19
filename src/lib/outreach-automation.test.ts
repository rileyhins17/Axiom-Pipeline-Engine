import { strict as assert } from "node:assert";
import test from "node:test";

import {
  buildBounceNotificationSearchQueries,
  buildScheduledTimeline,
  extractBounceFailureDetails,
  getAutomationSuppressionDomainsForLead,
  getStepType,
  isExpectedReplySender,
  isBounceNotificationMessage,
  orderDueStepsForClaiming,
  runSchedulerRecordedPhase,
  selectAutomationReadyLeads,
  withSchedulerTimeout,
} from "./outreach-automation";
import {
  AUTONOMOUS_DAILY_LEAD_INTAKE_CAP,
  AUTONOMOUS_FOLLOW_UP_DAILY_SEND_CAP,
  MAILBOX_DAILY_SEND_TARGET,
} from "./automation-policy";
import type { LeadRecord, OutreachSequenceStepRecord } from "./prisma";

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
    lastReplyAt: null,
    dealHealth: null,
    dealLostReason: null,
    proposalSentAt: null,
    signedAt: null,
    clientPriority: null,
    ...rest,
  };
}

function makeStep(overrides: Partial<OutreachSequenceStepRecord> & Pick<OutreachSequenceStepRecord, "id">) {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const { id, ...rest } = overrides;

  return {
    id,
    sequenceId: "sequence-1",
    stepNumber: 1,
    stepType: "INITIAL",
    status: "SCHEDULED",
    scheduledFor: now,
    claimedAt: null,
    claimedByRunId: null,
    sentAt: null,
    gmailMessageId: null,
    gmailThreadId: null,
    subject: null,
    bodyHtml: null,
    bodyPlain: null,
    generationModel: null,
    errorMessage: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    ...rest,
  } satisfies OutreachSequenceStepRecord;
}

test("reply sender matching requires exact normalized mailbox and lead addresses", () => {
  assert.equal(isExpectedReplySender("Owner <owner@example.com>", "sender@example.com", "owner@example.com"), true);
  assert.equal(isExpectedReplySender("sender@example.com", "sender@example.com", "owner@example.com"), false);
  assert.equal(isExpectedReplySender("bob@example.com", "ob@example.com", "owner@example.com"), false);
  assert.equal(isExpectedReplySender("xxowner@example.com", "sender@example.com", "owner@example.com"), false);
  assert.equal(isExpectedReplySender("billing@example.com", "sender@example.com", null), true);
});

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

test("first-touch selection canonicalizes wrapped recipient emails", () => {
  const genericWrapped = makeLead({
    id: 6,
    email: "mailto:%20info@wrapped.ca?subject=Hello",
    emailType: "unknown",
  });
  const viableWrapped = makeLead({
    id: 7,
    email: "mailto:%20owner@wrapped.ca?subject=Hello",
    emailType: "owner",
  });

  const result = selectAutomationReadyLeads({
    leads: [genericWrapped, viableWrapped],
  });

  assert.deepEqual(result.leads.map((lead) => lead.id), [viableWrapped.id]);
  assert.equal(result.diagnostics.skippedGenericEmailCount, 1);
});

test("first-touch selection matches sent recipients after canonicalization", () => {
  const wrapped = makeLead({ id: 8, email: "mailto:%20owner@already-sent.ca" });

  const result = selectAutomationReadyLeads({
    leads: [wrapped],
    sentRecipientEmails: new Set(["owner@already-sent.ca"]),
  });

  assert.deepEqual(result.leads, []);
  assert.equal(result.diagnostics.skippedAlreadyContactedCount, 1);
});

test("scheduler claim ordering keeps initial outreach ahead of overdue follow-ups", () => {
  const ordered = orderDueStepsForClaiming([
    makeStep({
      id: "follow-up-oldest",
      stepNumber: 3,
      stepType: "FOLLOW_UP_2",
      scheduledFor: new Date("2026-01-01T08:00:00.000Z"),
    }),
    makeStep({
      id: "initial-newer",
      stepNumber: 1,
      stepType: "INITIAL",
      scheduledFor: new Date("2026-01-01T11:00:00.000Z"),
    }),
    makeStep({
      id: "follow-up-newer",
      stepNumber: 2,
      stepType: "FOLLOW_UP_1",
      scheduledFor: new Date("2026-01-01T10:00:00.000Z"),
    }),
  ]);

  assert.deepEqual(ordered.map((step) => step.id), [
    "initial-newer",
    "follow-up-oldest",
    "follow-up-newer",
  ]);
});

test("automation capacity policy reserves daily sends for initial outreach", () => {
  const totalDailyCapacity = MAILBOX_DAILY_SEND_TARGET * 2;
  const reservedInitialCapacity = totalDailyCapacity - AUTONOMOUS_FOLLOW_UP_DAILY_SEND_CAP;

  assert.equal(totalDailyCapacity, 80);
  assert(AUTONOMOUS_FOLLOW_UP_DAILY_SEND_CAP <= totalDailyCapacity * 0.25);
  assert(AUTONOMOUS_DAILY_LEAD_INTAKE_CAP <= reservedInitialCapacity);
});

test("automation sequence timeline includes initial plus three periodic follow-ups", () => {
  const timeline = buildScheduledTimeline(new Date("2026-01-01T12:00:00.000Z"), {
    timezone: "America/Toronto",
    weekdaysOnly: false,
    sendWindowStartHour: 0,
    sendWindowStartMinute: 0,
    sendWindowEndHour: 23,
    sendWindowEndMinute: 59,
    initialDelayMinMinutes: 1,
    initialDelayMaxMinutes: 1,
    followUp1BusinessDays: 2,
    followUp2BusinessDays: 3,
    followUp3BusinessDays: 4,
    schedulerClaimBatch: 60,
    replySyncStaleMinutes: 15,
    leadSnapshot: {
      id: 1,
      businessName: "Lead 1 Roofing",
      city: "Kitchener",
      niche: "Roofers",
      email: "owner@lead1.ca",
      contactName: null,
      websiteStatus: "ACTIVE",
      axiomScore: 65,
      axiomTier: "B",
    },
    enrichmentSnapshot: {},
  });

  assert.equal(timeline.length, 4);
  assert.deepEqual([1, 2, 3, 4].map(getStepType), [
    "INITIAL",
    "FOLLOW_UP_1",
    "FOLLOW_UP_2",
    "FOLLOW_UP_3",
  ]);
  assert(timeline[1].getTime() > timeline[0].getTime());
  assert(timeline[2].getTime() > timeline[1].getTime());
  assert(timeline[3].getTime() > timeline[2].getTime());
});

test("automation sequence timeline refuses zero-day follow-up delays", () => {
  const timeline = buildScheduledTimeline(new Date("2026-01-01T12:00:00.000Z"), {
    timezone: "America/Toronto",
    weekdaysOnly: false,
    sendWindowStartHour: 0,
    sendWindowStartMinute: 0,
    sendWindowEndHour: 23,
    sendWindowEndMinute: 59,
    initialDelayMinMinutes: 1,
    initialDelayMaxMinutes: 1,
    followUp1BusinessDays: 0,
    followUp2BusinessDays: 0,
    followUp3BusinessDays: 0,
    schedulerClaimBatch: 60,
    replySyncStaleMinutes: 15,
    leadSnapshot: {
      id: 1,
      businessName: "Lead 1 Roofing",
      city: "Kitchener",
      niche: "Roofers",
      email: "owner@lead1.ca",
      contactName: null,
      websiteStatus: "ACTIVE",
      axiomScore: 65,
      axiomTier: "B",
    },
    enrichmentSnapshot: {},
  });

  const day = 24 * 60 * 60 * 1000;
  assert(timeline[1].getTime() - timeline[0].getTime() >= 2 * day);
  assert(timeline[2].getTime() - timeline[1].getTime() >= 3 * day);
  assert(timeline[3].getTime() - timeline[2].getTime() >= 4 * day);
});

test("scheduler watchdog rejects hung operations", async () => {
  await assert.rejects(
    withSchedulerTimeout(new Promise(() => undefined), 5, "test phase"),
    /test phase timed out after 5ms/,
  );
});

test("scheduler recorded phase marks run failed when pre-run work times out", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    outreachRun: {
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
      },
    },
  };

  await assert.rejects(
    runSchedulerRecordedPhase({
      prisma,
      runId: "run_1",
      phase: "mailbox_sync",
      timeoutMs: 5,
      operation: () => new Promise(() => undefined),
      failRunOnError: true,
    }),
    /mailbox_sync timed out after 5ms/,
  );

  assert.equal(updates.length, 2);
  assert.match(String(updates[0].metadata), /"phase":"mailbox_sync"/);
  assert.equal(updates[1].status, "FAILED");
  assert.match(String(updates[1].metadata), /"phase":"mailbox_sync"/);
  assert.match(String(updates[1].metadata), /timed out/);
});

test("bounce parsing detects Gmail address-not-found snippets without X-Failed-Recipients", () => {
  const details = extractBounceFailureDetails({
    snippet:
      "Address not found Your message wasn't delivered to needhelp@linoor.com because the domain linoor.com couldn't be found.",
    headers: {
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      to: "Riley <riley@example.com>",
      subject: "Address not found",
      xFailedRecipients: "",
    },
  });

  assert.deepEqual(details, {
    failedRecipient: "needhelp@linoor.com",
    failedDomain: "linoor.com",
    reason: "domain_not_found",
  });
});

test("bounce parsing still prefers X-Failed-Recipients when Gmail provides it", () => {
  const details = extractBounceFailureDetails({
    snippet: "Delivery Status Notification",
    headers: {
      from: "mailer-daemon@googlemail.com",
      to: "Riley <riley@example.com>",
      subject: "Delivery Status Notification (Failure)",
      xFailedRecipients: " Owner@Example.ca ",
    },
  });

  assert.equal(details.failedRecipient, "owner@example.ca");
  assert.equal(details.failedDomain, null);
});

test("bounce message recognition covers address-not-found delivery subsystem mail", () => {
  assert.equal(
    isBounceNotificationMessage({
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Address not found",
    }),
    true,
  );
});

test("bounce search queries include address-not-found and generic mailer-daemon scans", () => {
  const queries = buildBounceNotificationSearchQueries();

  assert(queries.some((query) => query.includes("Address not found")));
  assert(queries.some((query) => query.includes("from:mailer-daemon")));
});

test("suppression domains include both website and recipient email domains", () => {
  const domains = getAutomationSuppressionDomainsForLead(makeLead({
    id: 99,
    websiteDomain: "villagedallas.ca",
    email: "needhelp@linoor.com",
  }));

  assert.deepEqual(domains.sort(), ["linoor.com", "villagedallas.ca"]);
});
