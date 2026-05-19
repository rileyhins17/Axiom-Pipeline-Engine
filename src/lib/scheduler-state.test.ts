import { strict as assert } from "node:assert";
import test from "node:test";

import {
  isOperatorActionableBlockerReason,
  isRecoverableSchedulerBlockerReason,
  isSchedulerRecoveryRunError,
} from "./scheduler-state";

test("scheduler capacity blockers are recoverable autonomous waits", () => {
  for (const reason of [
    "mailbox_cooldown",
    "hourly_cap_reached",
    "daily_cap_reached",
    "follow_up_daily_cap_reached",
    "global_daily_cap_reached",
    "outside_send_window",
    "domain_cooldown_active",
    "awaiting_follow_up_window",
  ] as const) {
    assert.equal(isRecoverableSchedulerBlockerReason(reason), true, reason);
    assert.equal(isOperatorActionableBlockerReason(reason), false, reason);
  }
});

test("scheduler only asks for operator attention on true manual blockers", () => {
  for (const reason of [
    "manual_pause",
    "global_pause",
    "emergency_stop",
    "mailbox_disconnected",
    "mailbox_disabled",
  ] as const) {
    assert.equal(isRecoverableSchedulerBlockerReason(reason), false, reason);
    assert.equal(isOperatorActionableBlockerReason(reason), true, reason);
  }
});

test("scheduler recovery run logs are not actionable failures", () => {
  assert.equal(isSchedulerRecoveryRunError("stale running run recovered before scheduler start"), true);
  assert.equal(isSchedulerRecoveryRunError("cleared by manual repair"), true);
  assert.equal(isSchedulerRecoveryRunError("scheduler exited before closing outreach run"), false);
  assert.equal(isSchedulerRecoveryRunError("mailbox_sync timed out after 20000ms"), false);
});
