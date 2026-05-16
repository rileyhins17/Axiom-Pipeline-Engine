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

const worker = openNextWorkerModule;

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export default {
  async fetch(request, env, ctx) {
    setCloudflareBindings(env);
    return worker.fetch(request, env, ctx);
  },
  async scheduled(_controller, env, ctx) {
    setCloudflareBindings(env);
    ctx.waitUntil(
      Promise.allSettled([
        withTimeout(runAutonomousIntake(), 120_000, "intake"),
        withTimeout(runCloudScrapeWorker(), 120_000, "scrape"),
        withTimeout(runAutomationScheduler(), 270_000, "scheduler"),
        withTimeout(maybeRunDailyDigest(), 60_000, "digest"),
      ]).then((results) => {
        const labels = ["intake", "scrape", "scheduler", "digest"];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected") {
            console.error(`[cron:${labels[i]}] failed:`, result.reason);
          } else {
            console.log(`[cron:${labels[i]}] ok`, result.value);
          }
        }
      }),
    );
  },
};
