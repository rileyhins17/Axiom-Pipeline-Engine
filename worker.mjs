import openNextWorkerModule, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";

import { runAutomationScheduler } from "./src/lib/outreach-automation";
import { runCloudScrapeWorker } from "./src/lib/cloud-scrape-worker";
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
        runAutomationScheduler(),
        runCloudScrapeWorker(),
      ]).then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            console.error("Scheduled task failed:", result.reason);
          }
        }
      }),
    );
  },
};
