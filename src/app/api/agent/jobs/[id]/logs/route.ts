import { NextResponse } from "next/server";

import {
  isValidAgentEventType,
  isValidJobId,
  normalizeAgentName,
  validateAgentStatusPayload,
} from "@/lib/agent-protocol";
import { appendScrapeJobEvent, getScrapeJob } from "@/lib/scrape-jobs";
import { requireAgentAuth } from "@/lib/agent-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireAgentAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { id: jobId } = await context.params;
  if (!isValidJobId(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const currentJob = await getScrapeJob(jobId);
  if (!currentJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (currentJob.claimedBy !== authResult.agentName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
    return NextResponse.json({ error: "Job already finished" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const eventType = String(body.eventType || "log");
  if (!isValidAgentEventType(eventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const bodyAgentName = body.agentName ? normalizeAgentName(body.agentName) : null;
  if (body.agentName && !bodyAgentName) {
    return NextResponse.json({ error: "Invalid agent name" }, { status: 400 });
  }

  if (bodyAgentName && bodyAgentName !== authResult.agentName) {
    return NextResponse.json({ error: "Agent identity mismatch" }, { status: 400 });
  }

  const payload = (body.payload && typeof body.payload === "object" ? body.payload : body) as Record<string, unknown>;
  const eventPayload: Record<string, unknown> = { jobId };

  if (typeof payload.message === "string" && payload.message.trim()) {
    eventPayload.message = payload.message.trim();
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    eventPayload.error = payload.error.trim().slice(0, 4000);
  }

  if (payload.jobStatus !== undefined) {
    eventPayload.jobStatus = payload.jobStatus;
  }

  if (typeof payload.progress === "number" && Number.isFinite(payload.progress)) {
    eventPayload.progress = Math.max(0, Math.floor(payload.progress));
  }

  if (typeof payload.total === "number" && Number.isFinite(payload.total) && payload.total > 0) {
    eventPayload.total = Math.floor(payload.total);
  }

  if (payload.stats && typeof payload.stats === "object" && !Array.isArray(payload.stats)) {
    eventPayload.stats = payload.stats;
  }

  if (payload._done === true) {
    eventPayload._done = true;
  }

  if (eventType === "status") {
    const validation = validateAgentStatusPayload(eventPayload);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  await appendScrapeJobEvent(jobId, eventType, eventPayload);
  return NextResponse.json({ ok: true });
}
