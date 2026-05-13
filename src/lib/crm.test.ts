import { strict as assert } from "node:assert";
import test from "node:test";

import {
  computeDealHealth,
  getEngagementTypeLabel,
  isActiveClientStage,
  isDealStage,
  isEngagementType,
  isWonDeal,
} from "./crm";
import { getDefaultNextActionForStage } from "./crm-activity";

test("CRM stage set covers Axiom sales process without dropping existing won stages", () => {
  for (const stage of [
    "NEW_LEAD",
    "CONTACTED",
    "INTERESTED",
    "DISCOVERY_BOOKED",
    "DISCOVERY_COMPLETED",
    "PROPOSAL_SENT",
    "NEGOTIATING",
    "SIGNED",
    "ACTIVE",
    "DELIVERED",
    "RETAINED",
    "LOST",
  ]) {
    assert.equal(isDealStage(stage), true, `${stage} should be a valid deal stage`);
  }

  assert.equal(isWonDeal("SIGNED"), true);
  assert.equal(isActiveClientStage("ACTIVE"), true);
  assert.equal(isActiveClientStage("RETAINED"), true);
});

test("CRM engagement types cover Axiom project types and legacy values", () => {
  for (const type of [
    "WEBSITE_REBUILD",
    "NEW_WEBSITE",
    "INFRASTRUCTURE_MANAGEMENT",
    "RETAINER",
    "BOOKING_MENU_LEAD_SYSTEM",
    "CUSTOM_SYSTEM_WORK",
    "OWNERSHIP",
    "REBUILD",
  ]) {
    assert.equal(isEngagementType(type), true, `${type} should be accepted`);
  }

  assert.equal(getEngagementTypeLabel("WEBSITE_REBUILD"), "Website Rebuild");
  assert.equal(getEngagementTypeLabel("BOOKING_MENU_LEAD_SYSTEM"), "Booking/Menu/Lead Capture System");
  assert.equal(getEngagementTypeLabel("REBUILD"), "Website Rebuild");
});

test("CRM early sales stages create practical next actions", () => {
  const now = new Date("2026-01-05T10:00:00.000Z");

  assert.equal(getDefaultNextActionForStage("NEW_LEAD", now)?.nextAction, "Review fit and choose contact path");
  assert.equal(getDefaultNextActionForStage("INTERESTED", now)?.nextAction, "Book discovery call");
  assert.equal(getDefaultNextActionForStage("DISCOVERY_BOOKED", now)?.nextAction, "Prepare discovery notes");
  assert.equal(getDefaultNextActionForStage("DISCOVERY_COMPLETED", now)?.nextAction, "Draft proposal scope");
});

test("CRM open early sales stages compute health instead of defaulting to lost", () => {
  const health = computeDealHealth({
    dealStage: "INTERESTED",
    proposalSentAt: null,
    lastReplyAt: new Date(),
    lastContactedAt: null,
  });

  assert.equal(health, "HOT");
});
