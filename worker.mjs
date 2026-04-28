import openNextWorkerModule, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";

import { runAutomationScheduler } from "./src/lib/outreach-automation";
import { runCloudScrapeWorker } from "./src/lib/cloud-scrape-worker";
import { runAutonomousIntake } from "./src/lib/autonomous-intake";
import { setCloudflareBindings } from "./src/lib/cloudflare";

const worker = openNextWorkerModule;

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

export default {
  async fetch(request, env, ctx) {
    setCloudflareBindings(env);
    return worker.fetch(request, env, ctx);
  },
  async scheduled(_controller, env, ctx) {
    setCloudflareBindings(env);
    ctx.waitUntil(
      Promise.allSettled([
        runAutonomousIntake(),
        runCloudScrapeWorker(),
        runAutomationScheduler(),
      ]).then((results) => {
        const labels = ["intake", "scrape", "scheduler"];
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
