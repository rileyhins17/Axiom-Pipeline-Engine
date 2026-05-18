import openNextWorkerModule, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";

import { runAutomationScheduler } from "./src/lib/outreach-automation";
import { runCloudScrapeWorker } from "./src/lib/cloud-scrape-worker";
import { runAutonomousIntake } from "./src/lib/autonomous-intake";
import { maybeRunDailyDigest } from "./src/lib/daily-digest";
import { setCloudflareBindings } from "./src/lib/cloudflare";
import { getCronTimeoutBudgets } from "./src/lib/cron-timeouts";

const worker = openNextWorkerModule;

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

function withTimeout(promise, ms, label) {
  const startedAt = Date.now();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
    console.log(`[cron:${label}] durationMs=${Date.now() - startedAt} timeoutMs=${ms}`);
  });
}

export default {
  async fetch(request, env, ctx) {
    setCloudflareBindings(env);
    return worker.fetch(request, env, ctx);
  },
  async scheduled(_controller, env, ctx) {
    setCloudflareBindings(env);
    const timeouts = getCronTimeoutBudgets(env);
    const CRON_WALL_CLOCK_BUDGET_MS = 14 * 60 * 1000;
    // Scrape can legitimately run for ~14 min when claiming a job. If it
    // executes before the scheduler, the wall-clock budget is exhausted and
    // outreach sends are skipped indefinitely. Guarantee scheduler always
    // runs first with a hard minimum reserve, then run intake/scrape/digest
    // with whatever budget remains. Sequential ordering preserves the 128 MB
    // memory limit fix from commit d1ed4ca.
    const SCHEDULER_MIN_RESERVE_MS = 5 * 60 * 1000;
    ctx.waitUntil(
      (async () => {
        const deadline = Date.now() + CRON_WALL_CLOCK_BUDGET_MS;
        const tasks = [
          { fn: runAutomationScheduler, timeout: timeouts.scheduler, label: "scheduler", minReserveMs: SCHEDULER_MIN_RESERVE_MS },
          { fn: runAutonomousIntake, timeout: timeouts.intake, label: "intake" },
          { fn: runCloudScrapeWorker, timeout: timeouts.scrape, label: "scrape" },
          { fn: maybeRunDailyDigest, timeout: timeouts.digest, label: "digest" },
        ];
        for (const task of tasks) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            console.warn(`[cron:${task.label}] skipped — wall-clock budget exhausted`);
            continue;
          }
          if (task.minReserveMs && remaining < task.minReserveMs) {
            console.warn(
              `[cron:${task.label}] only ${remaining}ms remaining (< ${task.minReserveMs}ms reserve); running with reduced budget`,
            );
          }
          const effectiveTimeout = Math.min(task.timeout, remaining);
          try {
            const value = await withTimeout(task.fn(), effectiveTimeout, task.label);
            console.log(`[cron:${task.label}] ok`, value);
          } catch (error) {
            console.error(`[cron:${task.label}] failed:`, error);
          }
        }
      })(),
    );
  },
};
