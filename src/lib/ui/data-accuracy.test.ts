import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateReplyRate,
  getProjectMilestoneChecks,
  isAdequateAutonomousLeadRow,
  isSendableMailbox,
  resolveGlobalDailySendCap,
  sqlDateTime,
  startOfUtcDay,
} from "@/lib/ui/data-accuracy";

test("startOfUtcDay returns UTC midnight for the same UTC calendar date", () => {
  const now = new Date("2026-05-10T23:59:59.000Z");

  assert.equal(startOfUtcDay(now).toISOString(), "2026-05-10T00:00:00.000Z");
  assert.equal(sqlDateTime(startOfUtcDay(now)), "2026-05-10 00:00:00");
});

test("adequate lead row check matches autonomous send policy", () => {
  assert.equal(
    isAdequateAutonomousLeadRow({
      axiomScore: 45,
      axiomTier: "C",
      email: "owner@example.ca",
      emailType: "owner",
      isArchived: false,
    }),
    true,
  );
  assert.equal(
    isAdequateAutonomousLeadRow({
      axiomScore: 80,
      axiomTier: "A",
      email: "info@example.ca",
      emailType: "owner",
      isArchived: false,
    }),
    false,
  );
});

test("calculateReplyRate uses unique replied leads against sent count", () => {
  assert.equal(calculateReplyRate(4, 1), 25);
  assert.equal(calculateReplyRate(0, 2), 0);
});

test("mailbox must be connected and sendable before UI treats it as connected", () => {
  assert.equal(isSendableMailbox({ gmailConnectionId: "gmail_1", status: "ACTIVE" }), true);
  assert.equal(isSendableMailbox({ gmailConnectionId: "gmail_1", status: "WARMING" }), true);
  assert.equal(isSendableMailbox({ gmailConnectionId: null, status: "ACTIVE" }), false);
  assert.equal(isSendableMailbox({ gmailConnectionId: "gmail_1", status: "DISCONNECTED" }), false);
});

test("global send cap prefers runtime cap and otherwise sums mailbox caps", () => {
  assert.equal(resolveGlobalDailySendCap({ envCap: 80, mailboxCaps: [40, 40], fallbackPerMailboxCap: 40 }), 80);
  assert.equal(resolveGlobalDailySendCap({ envCap: 0, mailboxCaps: [30, 50], fallbackPerMailboxCap: 40 }), 80);
  assert.equal(
    resolveGlobalDailySendCap({ envCap: null, mailboxCaps: [], fallbackPerMailboxCap: 40, expectedMailboxCount: 2 }),
    80,
  );
});

test("project milestones only complete from explicit evidence, not implied follow-on stage events", () => {
  assert.deepEqual(
    getProjectMilestoneChecks({
      dealStage: "ACTIVE",
      proposalSentAt: null,
      signedAt: null,
      projectStartDate: "2026-05-01T00:00:00.000Z",
    }),
    {
      proposal: false,
      signed: false,
      kickoff: false,
      started: true,
      review: false,
      delivered: false,
      retained: false,
    },
  );
});
