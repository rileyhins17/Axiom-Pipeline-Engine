import { extractDomain } from "@/lib/dedupe";
import { validateAgentLeadPayload } from "@/lib/agent-protocol";
import { countAdequateLeadsToday, getAutonomousDailyLeadCap } from "@/lib/autonomous-intake";
import { isAdequateAutonomousLead } from "@/lib/automation-policy";
import { getPrisma, type LeadRecord } from "@/lib/prisma";
import {
  appendScrapeJobEvent,
  getScrapeJob,
  type ScrapeLeadWriteInput,
} from "@/lib/scrape-jobs";

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

export async function persistScrapeJobLead(input: {
  jobId: string;
  lead: ScrapeLeadWriteInput;
}): Promise<LeadRecord | null> {
  const currentJob = await getScrapeJob(input.jobId);
  if (!currentJob) {
    throw new Error("Job not found");
  }

  if (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "canceled") {
    throw new Error("Job already finished");
  }

  const leadPayload: Record<string, unknown> & {
    businessName?: unknown;
    websiteStatus?: unknown;
  } = { ...input.lead };
  const normalizedLead = normalizeLeadPayload(leadPayload);
  const coverage = {
    category: Boolean(normalizedLead.category),
    emailFlags: Boolean(normalizedLead.emailFlags),
    phoneFlags: Boolean(normalizedLead.phoneFlags),
    websiteDomain: Boolean(normalizedLead.websiteDomain),
    websiteUrl: Boolean(normalizedLead.websiteUrl),
  };

  console.log(
    `[scrape.results] coverage job=${input.jobId} websiteUrl=${coverage.websiteUrl ? "1" : "0"} websiteDomain=${coverage.websiteDomain ? "1" : "0"} category=${coverage.category ? "1" : "0"} emailFlags=${coverage.emailFlags ? "1" : "0"} phoneFlags=${coverage.phoneFlags ? "1" : "0"} status=${String(leadPayload.websiteStatus || "")}`,
  );

  if (leadPayload.websiteStatus === "ACTIVE" && !coverage.websiteUrl) {
    await appendScrapeJobEvent(input.jobId, "log", {
      jobId: input.jobId,
      jobStatus: currentJob.status,
      message: `[LEAD] Active website status but URL was blank after normalization for ${String(leadPayload.businessName || "unknown")}.`,
    });
  }

  const validation = validateAgentLeadPayload(normalizedLead);
  if (!validation.success) {
    console.warn(`[scrape.results] Lead validation failed for job ${input.jobId}: ${validation.error}`);
    await appendScrapeJobEvent(input.jobId, "error", {
      jobId: input.jobId,
      jobStatus: currentJob.status,
      message: `[LEAD] Validation failed: ${validation.error}`,
    });
    throw new Error(validation.error);
  }

  if (currentJob.actorUserId === "system") {
    if (!isAdequateAutonomousLead(validation.lead)) {
      await appendScrapeJobEvent(input.jobId, "log", {
        jobId: input.jobId,
        jobStatus: currentJob.status,
        message: `[LEAD] Skipped non-adequate autonomous lead: ${validation.lead.businessName} (${validation.lead.axiomScore ?? "n/a"}/100).`,
      });
      return null;
    }

    const cap = getAutonomousDailyLeadCap();
    const adequateToday = await countAdequateLeadsToday();
    if (adequateToday >= cap) {
      await appendScrapeJobEvent(input.jobId, "log", {
        jobId: input.jobId,
        jobStatus: currentJob.status,
        message: `[LEAD] Skipped autonomous lead because the rolling 24h adequate-lead cap is reached (${adequateToday}/${cap}).`,
      });
      return null;
    }
  }

  const prisma = getPrisma();
  const createdLead = await prisma.lead.create({
    data: {
      ...validation.lead,
      isArchived: validation.lead.isArchived ? true : false,
    },
  });

  await appendScrapeJobEvent(input.jobId, "result", {
    jobId: input.jobId,
    jobStatus: "running",
    leadId: createdLead.id,
    businessName: createdLead.businessName,
    city: createdLead.city,
    message: `[LEAD] Saved ${createdLead.businessName} - ${createdLead.city}`,
  });

  return createdLead;
}
