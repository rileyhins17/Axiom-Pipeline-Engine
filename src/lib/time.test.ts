import { strict as assert } from "node:assert";
import test from "node:test";

import { fmtWindow } from "@/components/automation/helpers";
import type { AutomationSettings } from "@/components/automation/types";
import { formatAppClock } from "./time";

const baseSettings: AutomationSettings = {
  enabled: true,
  globalPaused: false,
  weekdaysOnly: false,
  sendWindowStartHour: 0,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 23,
  sendWindowEndMinute: 59,
  initialDelayMinMinutes: 1,
  initialDelayMaxMinutes: 5,
  followUp1BusinessDays: 2,
  followUp2BusinessDays: 3,
  schedulerClaimBatch: 25,
  replySyncStaleMinutes: 15,
};

test("formatAppClock treats hour/minute as a local clock, not UTC", () => {
  assert.equal(formatAppClock(0, 0), "12:00 a.m.");
  assert.equal(formatAppClock(12, 0), "12:00 p.m.");
  assert.equal(formatAppClock(23, 59), "11:59 p.m.");
});

test("24/7 send window displays as midnight through 11:59 p.m. Eastern", () => {
  assert.equal(fmtWindow(baseSettings), "12:00 a.m.–11:59 p.m. Eastern Time");
});
