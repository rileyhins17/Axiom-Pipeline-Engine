import { NextResponse } from "next/server";

import { isValidJobId, normalizeAgentName, validateAgentLeadPayload } from "@/lib/agent-protocol";
import { appendScrapeJobEvent } from "@/lib/scrape-jobs";
import { requireAgentAuth } from "@/lib/agent-auth";
import { extractDomain } from "@/lib/dedupe";
import { hasValidPipelineEmail } from "@/lib/lead-qualification";
import { enrichLead } from "@/lib/outreach-enrichment";
import { getPrisma, type LeadRecord } from "@/lib/prisma";
import { getScrapeJob } from "@/lib/scrape-jobs";

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return value === null || value === undefined ? null : String(value).trim() || null;
  }

  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function cleanJsonText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return cleanText(value);
  }

  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return cleanText(String(value));
}

function normalizeLeadPayload(lead: Record<string, unknown>) {
  const category = cleanText(lead.category);
  const rawWebsiteUrl = cleanText(lead.websiteUrl);
  const websiteUrl =
    rawWebsiteUrl &&
    rawWebsiteUrl.length <= 2048 &&
    !/google\.[^/]*\/maps|maps\.google\./i.test(rawWebsiteUrl)
      ? rawWebsiteUrl
      : null;
  const websiteDomain =
    cleanText(lead.websiteDomain) ||
    (websiteUrl ? extractDomain(websiteUrl) : null);
  const resolvedWebsiteUrl = websiteUrl || (websiteDomain ? `https://${websiteDomain}` : null);

  return {
    ...lead,
    address: cleanText(lead.address),
    category,
    contactName: cleanText(lead.contactName),
    callOpener: cleanText(lead.callOpener),
    disqualifiers: cleanText(lead.disqualifiers),
    disqualifyReason: cleanText(lead.disqualifyReason),
    email: cleanText(lead.email) || "",
    emailFlags: cleanJsonText(lead.emailFlags),
    enrichedAt: lead.enrichedAt || null,
    enrichmentData: cleanJsonText(lead.enrichmentData),
    followUpQuestion: cleanText(lead.followUpQuestion),
    painSignals: cleanJsonText(lead.painSignals) || "[]",
    phone: cleanText(lead.phone) || "",
    phoneFlags: cleanJsonText(lead.phoneFlags),
    scoreBreakdown: cleanJsonText(lead.scoreBreakdown) || "{}",
    socialLink: cleanText(lead.socialLink),
    source: cleanText(lead.source),
    tacticalNote: cleanText(lead.tacticalNote) || "",
    websiteDomain: websiteDomain && websiteDomain.length <= 255 ? websiteDomain : null,
    websiteUrl: resolvedWebsiteUrl,
  };
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

  const leadPayload = lead as Record<string, unknown> & {
    businessName?: unknown;
    websiteStatus?: unknown;
  };

  const normalizedLead = normalizeLeadPayload(leadPayload);
  const coverage = {
    category: Boolean(normalizedLead.category),
    emailFlags: Boolean(normalizedLead.emailFlags),
    phoneFlags: Boolean(normalizedLead.phoneFlags),
    websiteDomain: Boolean(normalizedLead.websiteDomain),
    websiteUrl: Boolean(normalizedLead.websiteUrl),
  };
  console.log(
    `[agent.results] coverage job=${jobId} websiteUrl=${coverage.websiteUrl ? "1" : "0"} websiteDomain=${coverage.websiteDomain ? "1" : "0"} category=${coverage.category ? "1" : "0"} emailFlags=${coverage.emailFlags ? "1" : "0"} phoneFlags=${coverage.phoneFlags ? "1" : "0"} status=${String(leadPayload.websiteStatus || "")}`,
  );

  if (leadPayload.websiteStatus === "ACTIVE" && !coverage.websiteUrl) {
    await appendScrapeJobEvent(jobId, "log", {
      jobId,
      jobStatus: currentJob.status,
      message: `[LEAD] Active website status but URL was blank after normalization for ${String(leadPayload.businessName || "unknown")}.`,
    });
  }

  const validation = validateAgentLeadPayload(normalizedLead);

  if (!validation.success) {
    console.warn(`[agent.results] Lead validation failed for job ${jobId}: ${validation.error}`);
    await appendScrapeJobEvent(jobId, "error", {
      jobId,
      jobStatus: currentJob.status,
      message: `[LEAD] Validation failed: ${validation.error}`,
    });
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const prisma = getPrisma();
  const now = new Date();
  const createData = {
    ...validation.lead,
    isArchived: validation.lead.isArchived ? true : false,
  };

  if (
    !createData.enrichmentData &&
    createData.email &&
    typeof createData.axiomScore === "number" &&
    !createData.isArchived &&
    hasValidPipelineEmail(createData)
  ) {
    try {
      const enrichment = await enrichLead({
        ...createData,
        id: 0,
        category: createData.category || null,
        address: createData.address || null,
        phone: createData.phone || null,
        email: createData.email || null,
        socialLink: createData.socialLink || null,
        websiteUrl: createData.websiteUrl || null,
        websiteDomain: createData.websiteDomain || null,
        contactName: createData.contactName || null,
        tacticalNote: createData.tacticalNote || null,
        websiteGrade: createData.websiteGrade || null,
        axiomTier: createData.axiomTier || null,
        scoreBreakdown: createData.scoreBreakdown || null,
        painSignals: createData.painSignals || null,
        callOpener: createData.callOpener || null,
        followUpQuestion: createData.followUpQuestion || null,
        axiomWebsiteAssessment: createData.axiomWebsiteAssessment || null,
        dedupeKey: createData.dedupeKey || null,
        dedupeMatchedBy: createData.dedupeMatchedBy || null,
        emailType: createData.emailType || null,
        emailFlags: createData.emailFlags || null,
        phoneFlags: createData.phoneFlags || null,
        disqualifiers: createData.disqualifiers || null,
        disqualifyReason: createData.disqualifyReason || null,
        outreachStatus: null,
        outreachChannel: null,
        firstContactedAt: null,
        lastContactedAt: null,
        nextFollowUpDue: null,
        outreachNotes: null,
        enrichedAt: null,
        enrichmentData: null,
        source: createData.source || null,
        isArchived: createData.isArchived,
        createdAt: now,
        lastUpdated: now,
        dealStage: null,
        engagementType: null,
        monthlyValue: null,
        projectStartDate: null,
        renewalDate: null,
        projectNotes: null,
        nextAction: null,
        nextActionDueAt: null,
        lastReplyAt: null,
        dealHealth: null,
        dealLostReason: null,
        proposalSentAt: null,
        signedAt: null,
        clientPriority: null,
      } satisfies LeadRecord);
      createData.enrichedAt = now;
      createData.enrichmentData = JSON.stringify(enrichment);
      createData.outreachStatus = "ENRICHED";
    } catch (error) {
      console.error(`[agent.results] Pre-vault enrichment failed for job ${jobId}:`, error);
    }
  }

  const createdLead = await prisma.lead.create({
    data: createData,
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
