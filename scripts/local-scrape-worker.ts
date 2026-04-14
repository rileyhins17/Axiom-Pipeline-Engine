import os from "node:os";

import { buildSignedAgentHeaders } from "../src/lib/agent-protocol";
import { executeScrapeJob } from "../src/lib/scrape-engine-worker";
import type { ScrapeLeadWriteInput } from "../src/lib/scrape-jobs";

type ClaimResponse = {
  existingDedupeKeys?: string[];
  job?: {
    city: string;
    id: string;
    maxDepth: number;
    niche: string;
    radius: string;
    status: string;
  } | null;
  retryAfterMs?: number;
};

const CONTROL_PLANE_URL = process.env.APP_BASE_URL || process.env.CONTROL_PLANE_URL;
const AGENT_SHARED_SECRET = process.env.AGENT_SHARED_SECRET || "";
const WORKER_NAME = process.env.WORKER_NAME || process.env.AGENT_NAME || os.hostname() || "local-worker";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SCRAPE_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 1800000);
const CLAIM_POLL_INTERVAL_MS = Number(process.env.CLAIM_POLL_INTERVAL_MS || 5000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 15000);
const ONCE = process.argv.includes("--once");
let stopRequested = false;

class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

class JobFinishedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFinishedError";
  }
}

if (!CONTROL_PLANE_URL) {
  throw new Error("APP_BASE_URL is required.");
}

if (!AGENT_SHARED_SECRET) {
  throw new Error("AGENT_SHARED_SECRET is required.");
}

function requestStop() {
  if (!stopRequested) {
    console.log("[worker] stop requested");
  }
  stopRequested = true;
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path: string, init: RequestInit = {}, bodyText = "") {
  const headers = new Headers(init.headers);
  headers.set("x-agent-name", WORKER_NAME);
  for (const [key, value] of Object.entries(
    buildSignedAgentHeaders({
      agentName: WORKER_NAME,
      bodyText,
      method: init.method || "GET",
      path,
      secret: AGENT_SHARED_SECRET,
    }),
  )) {
    headers.set(key, value);
  }
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(new URL(path, CONTROL_PLANE_URL), {
    ...init,
    headers,
  });

  return response;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const bodyText = JSON.stringify(body);
  const response = await apiFetch(path, {
    method: "POST",
    body: bodyText,
  }, bodyText);

  const text = await response.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }
  if (!response.ok) {
    throw new ApiRequestError(response.status, (parsed && parsed.error) || `Request failed with ${response.status}`);
  }

  return parsed as T;
}

function isJobFinishedApiError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409 && /Job already finished/i.test(error.message);
}

async function claimJob(): Promise<ClaimResponse> {
  return postJson<ClaimResponse>("/api/agent/jobs/claim", {
    agentName: WORKER_NAME,
  });
}

async function heartbeat(jobId: string): Promise<{ shouldAbort?: boolean }> {
  return postJson<{ shouldAbort?: boolean }>(`/api/agent/jobs/${jobId}/heartbeat`, {
    agentName: WORKER_NAME,
  });
}

async function sendLog(jobId: string, payload: Record<string, unknown>) {
  const eventType =
    payload._done === true
      ? "done"
      : payload.error
        ? "error"
        : typeof payload.progress === "number"
          ? "progress"
          : "log";

  try {
    await postJson(`/api/agent/jobs/${jobId}/logs`, {
      eventType,
      payload,
    });
  } catch (error) {
    if (isJobFinishedApiError(error)) {
      throw new JobFinishedError(error instanceof Error ? error.message : "Job already finished");
    }
    console.warn(`[worker] log delivery failed for ${jobId}:`, error);
  }
}

async function sendLead(jobId: string, lead: ScrapeLeadWriteInput) {
  try {
    return await postJson(`/api/agent/jobs/${jobId}/results`, {
      lead,
    });
  } catch (error) {
    if (isJobFinishedApiError(error)) {
      throw new JobFinishedError(error instanceof Error ? error.message : "Job already finished");
    }
    throw error;
  }
}

async function completeJob(jobId: string, stats: Record<string, unknown>) {
  try {
    return await postJson(`/api/agent/jobs/${jobId}/complete`, {
      stats,
    });
  } catch (error) {
    if (isJobFinishedApiError(error)) {
      throw new JobFinishedError(error instanceof Error ? error.message : "Job already finished");
    }
    throw error;
  }
}

async function failJob(jobId: string, errorMessage: string) {
  try {
    return await postJson(`/api/agent/jobs/${jobId}/failed`, {
      errorMessage,
    });
  } catch (error) {
    if (isJobFinishedApiError(error)) {
      throw new JobFinishedError(error instanceof Error ? error.message : "Job already finished");
    }
    throw error;
  }
}

async function runOneJob(job: NonNullable<ClaimResponse["job"]>, existingDedupeKeys: string[]) {
  console.log(`[worker] running ${job.niche} in ${job.city} (${job.id})`);
  let cancelRequested = false;
  let timedOut = false;
  let jobFinished = false;

  const heartbeatTimer = setInterval(async () => {
    if (jobFinished || stopRequested) {
      cancelRequested = true;
      return;
    }

    try {
      const result = await heartbeat(job.id);
      if (result.shouldAbort) {
        cancelRequested = true;
      }
    } catch (error) {
      if (jobFinished) {
        return;
      }
      console.warn(`[worker] heartbeat failed for ${job.id}:`, error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    cancelRequested = true;
  }, SCRAPE_TIMEOUT_MS);

  try {
    if (stopRequested) {
      cancelRequested = true;
      return;
    }

    await heartbeat(job.id);
    if (stopRequested) {
      cancelRequested = true;
      return;
    }

    const result = await executeScrapeJob({
      city: job.city,
      existingDedupeKeys,
      geminiApiKey: GEMINI_API_KEY,
      jobId: job.id,
      maxDepth: job.maxDepth,
      niche: job.niche,
      persistLead: (lead: ScrapeLeadWriteInput) => sendLead(job.id, lead).then(() => undefined),
      radius: job.radius,
      sendEvent: (payload: Record<string, unknown>) => sendLog(job.id, payload),
      shouldAbort: () => cancelRequested || stopRequested,
    });

    if (timedOut) {
      throw new Error(`Scrape exceeded ${Math.round(SCRAPE_TIMEOUT_MS / 1000)}s timeout.`);
    }

    if (result.aborted || cancelRequested || stopRequested) {
      console.log(`[worker] job canceled: ${job.id}`);
      return;
    }

    await completeJob(job.id, {
      avgScore: result.avgScore,
      leadsFound: result.leadsFound,
      withEmail: result.withEmail,
    });
    jobFinished = true;
    console.log(`[worker] completed ${job.id}`);
  } catch (error) {
    if (error instanceof JobFinishedError || isJobFinishedApiError(error)) {
      jobFinished = true;
      console.log(`[worker] stopped ${job.id} because the control plane already finished it`);
      return;
    }

    if ((cancelRequested || stopRequested) && !timedOut) {
      console.log(`[worker] canceled while running ${job.id}`);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error(`[worker] failed ${job.id}: ${message}`);
    try {
      await failJob(job.id, message);
    } catch (failError) {
      console.error(`[worker] failed to report failure for ${job.id}:`, failError);
    }
  } finally {
    clearInterval(heartbeatTimer);
    clearTimeout(timeoutTimer);
  }
}

async function main() {
  console.log(`[worker] starting as ${WORKER_NAME}`);
  while (!stopRequested) {
    let claim: ClaimResponse;
    try {
      claim = await claimJob();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown claim error";
      console.warn(`[worker] claim poll failed: ${message}`);
      if (ONCE) {
        break;
      }
      await sleep(CLAIM_POLL_INTERVAL_MS);
      continue;
    }

    if (!claim.job) {
      const retryAfter = claim.retryAfterMs || CLAIM_POLL_INTERVAL_MS;
      if (ONCE) {
        console.log("[worker] no job available, exiting once mode");
        break;
      }

      await sleep(retryAfter);
      continue;
    }

    await runOneJob(claim.job, claim.existingDedupeKeys || []);

    if (ONCE) {
      break;
    }
  }

  console.log("[worker] stopped");
}

main().catch((error) => {
  console.error("[worker] fatal error:", error);
  process.exitCode = 1;
});
