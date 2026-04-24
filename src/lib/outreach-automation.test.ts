import { strict as assert } from "node:assert";
import test from "node:test";

import { AUTOMATION_SETTINGS_DEFAULTS } from "./automation-policy";
import { setCloudflareBindings, type D1DatabaseLike, type D1PreparedStatementLike } from "./cloudflare";
import { __automationTestUtils } from "./outreach-automation";
import type { OutreachAutomationSettingRecord, OutreachMailboxRecord } from "./prisma";

const now = new Date("2026-01-01T00:00:00.000Z");

const currentSettings: OutreachAutomationSettingRecord = {
  id: "global",
  ...AUTOMATION_SETTINGS_DEFAULTS,
  createdAt: now,
  updatedAt: now,
};

const currentMailbox: OutreachMailboxRecord = {
  id: "mailbox-1",
  userId: "user-1",
  gmailConnectionId: "connection-1",
  gmailAddress: "sender@example.com",
  label: "Sender",
  status: "ACTIVE",
  timezone: "America/Toronto",
  dailyLimit: 40,
  hourlyLimit: 12,
  minDelaySeconds: 120,
  maxDelaySeconds: 420,
  warmupLevel: 0,
  lastSentAt: null,
  lastReplyCheckAt: null,
  createdAt: now,
  updatedAt: now,
};

function createLeaseDb() {
  let row: { holder: string | null; expiresAt: string } | null = null;

  const db: D1DatabaseLike = {
    prepare(query: string): D1PreparedStatementLike {
      let params: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async first<T>() {
          return null as T | null;
        },
        async run() {
          if (query.startsWith("INSERT OR IGNORE INTO \"SchedulerLease\"")) {
            if (!row) {
              row = { holder: null, expiresAt: "1970-01-01T00:00:00.000Z" };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          if (query.startsWith("UPDATE \"SchedulerLease\"") && query.includes("WHERE \"id\" = ?")) {
            const [holder, leaseExpiresAt, , , , expiredAt, sameHolder] = params as string[];
            const canAcquire =
              row && (row.holder === null || row.expiresAt <= expiredAt || row.holder === sameHolder);
            if (canAcquire && row) {
              row = { holder, expiresAt: leaseExpiresAt };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          if (query.startsWith("UPDATE \"SchedulerLease\"")) {
            const [expiresAt, , , holder] = params as string[];
            if (row?.holder === holder) {
              row = { holder: null, expiresAt };
              return { meta: { changes: 1 } };
            }
          }

          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  };

  return db;
}

test("automation settings sanitizer clamps hostile or malformed payloads", () => {
  const patch = __automationTestUtils.sanitizeAutomationSettingsPatch(
    {
      enabled: "yes" as unknown as boolean,
      globalPaused: "false" as unknown as boolean,
      sendWindowStartHour: 99,
      sendWindowStartMinute: -20,
      sendWindowEndHour: "bad" as unknown as number,
      sendWindowEndMinute: 999,
      initialDelayMinMinutes: 300,
      initialDelayMaxMinutes: 2,
      followUp1BusinessDays: 0,
      followUp2BusinessDays: 99,
      schedulerClaimBatch: 500,
      replySyncStaleMinutes: -1,
    },
    currentSettings,
  );

  assert.equal(patch.enabled, true);
  assert.equal(patch.globalPaused, false);
  assert.equal(patch.sendWindowStartHour, 23);
  assert.equal(patch.sendWindowStartMinute, 0);
  assert.equal(patch.sendWindowEndHour, currentSettings.sendWindowEndHour);
  assert.equal(patch.sendWindowEndMinute, 59);
  assert.equal(patch.initialDelayMinMinutes, 240);
  assert.equal(patch.initialDelayMaxMinutes, 240);
  assert.equal(patch.followUp1BusinessDays, 1);
  assert.equal(patch.followUp2BusinessDays, 30);
  assert.equal(patch.schedulerClaimBatch, 100);
  assert.equal(patch.replySyncStaleMinutes, 1);
});

test("mailbox sanitizer rejects immutable fields and clamps unsafe values", () => {
  const patch = __automationTestUtils.sanitizeMailboxPatch(
    {
      userId: "attacker",
      status: "deleted",
      timezone: "not-a-zone",
      dailyLimit: 999,
      hourlyLimit: 999,
      minDelaySeconds: 500,
      maxDelaySeconds: 10,
      warmupLevel: 100,
    } as unknown as Partial<OutreachMailboxRecord>,
    currentMailbox,
  );

  assert.equal("userId" in patch, false);
  assert.equal("timezone" in patch, false);
  assert.equal("status" in patch, false);
  assert.equal(patch.dailyLimit, 500);
  assert.equal(patch.hourlyLimit, 100);
  assert.equal(patch.minDelaySeconds, 500);
  assert.equal(patch.maxDelaySeconds, 500);
  assert.equal(patch.warmupLevel, 10);
});

test("scheduler lease prevents overlap and recovers expired locks", async () => {
  setCloudflareBindings({ DB: createLeaseDb() });

  const acquired = await __automationTestUtils.tryAcquireSchedulerLease(
    "run-1",
    new Date("2026-01-01T00:00:00.000Z"),
  );
  const blocked = await __automationTestUtils.tryAcquireSchedulerLease(
    "run-2",
    new Date("2026-01-01T00:01:00.000Z"),
  );
  const recovered = await __automationTestUtils.tryAcquireSchedulerLease(
    "run-2",
    new Date("2026-01-01T00:11:00.000Z"),
  );

  assert.equal(acquired, true);
  assert.equal(blocked, false);
  assert.equal(recovered, true);
});
