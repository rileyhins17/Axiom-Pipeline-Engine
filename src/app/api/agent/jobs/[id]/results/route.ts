import { NextResponse } from "next/server";

import { isValidJobId, normalizeAgentName, validateAgentLeadPayload } from "@/lib/agent-protocol";
import { appendScrapeJobEvent } from "@/lib/scrape-jobs";
import { requireAgentAuth } from "@/lib/agent-auth";
import { getPrisma } from "@/lib/prisma";
import { getScrapeJob } from "@/lib/scrape-jobs";

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return value === null || value === undefined ? null : String(value).trim() || null;
  }

  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

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
  const bodyAgentName = body.agentName ? normalizeAgentName(body.agentName) : null;
  if (body.agentName && !bodyAgentName) {
    return NextResponse.json({ error: "Invalid agent name" }, { status: 400 });
  }

  if (bodyAgentName && bodyAgentName !== authResult.agentName) {
    return NextResponse.json({ error: "Agent identity mismatch" }, { status: 400 });
  }

  const lead = body.lead;
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
    return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
  }

  const normalizedLead = {
    ...(lead as Record<string, unknown>),
    address: cleanText((lead as Record<string, unknown>).address),
    category: cleanText((lead as Record<string, unknown>).category),
    contactName: cleanText((lead as Record<string, unknown>).contactName),
    callOpener: cleanText((lead as Record<string, unknown>).callOpener),
    disqualifiers: cleanText((lead as Record<string, unknown>).disqualifiers),
    disqualifyReason: cleanText((lead as Record<string, unknown>).disqualifyReason),
    email: cleanText((lead as Record<string, unknown>).email) || "",
    emailFlags: cleanText((lead as Record<string, unknown>).emailFlags),
    followUpQuestion: cleanText((lead as Record<string, unknown>).followUpQuestion),
    painSignals: cleanText((lead as Record<string, unknown>).painSignals) || "[]",
    phone: cleanText((lead as Record<string, unknown>).phone) || "",
    phoneFlags: cleanText((lead as Record<string, unknown>).phoneFlags),
    scoreBreakdown: cleanText((lead as Record<string, unknown>).scoreBreakdown) || "{}",
    socialLink: cleanText((lead as Record<string, unknown>).socialLink),
    source: cleanText((lead as Record<string, unknown>).source),
    tacticalNote: cleanText((lead as Record<string, unknown>).tacticalNote) || "",
    websiteDomain: cleanText((lead as Record<string, unknown>).websiteDomain),
    websiteUrl: cleanText((lead as Record<string, unknown>).websiteUrl),
  };

  const validation = validateAgentLeadPayload(normalizedLead);

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const prisma = getPrisma();
  const createdLead = await prisma.lead.create({
    data: {
      ...validation.lead,
      isArchived: validation.lead.isArchived ? true : false,
    },
  });

  await appendScrapeJobEvent(jobId, "result", {
    jobId,
    jobStatus: "running",
    leadId: createdLead.id,
    businessName: createdLead.businessName,
    city: createdLead.city,
    message: `[LEAD] Saved ${createdLead.businessName} — ${createdLead.city}`,
  });

  return NextResponse.json({ ok: true, leadId: createdLead.id });
}
