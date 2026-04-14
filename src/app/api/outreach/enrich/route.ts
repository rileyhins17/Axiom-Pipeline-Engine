import { NextResponse } from "next/server";

import { prepareLeadOutreachPackage } from "@/lib/lead-pipeline/orchestrator";
import { queueLeadsForAutomation } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import type { LeadRecord } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const body = (await request.json()) as { leadIds?: number[] };
    const leadIds = body.leadIds;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds array is required" }, { status: 400 });
    }

    if (leadIds.length > 50) {
      return NextResponse.json({ error: "Maximum 50 leads per enrichment batch" }, { status: 400 });
    }

    const prisma = getPrisma();

    // Fetch full lead data for each ID
    const leads: LeadRecord[] = [];
    for (const id of leadIds) {
      const lead = await prisma.lead.findUnique({ where: { id } });
      if (lead) {
        leads.push(lead);
      }
    }

    if (leads.length === 0) {
      return NextResponse.json({ error: "No valid leads found" }, { status: 404 });
    }

    const eligible = leads.filter((lead) => !lead.isArchived);

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "None of the selected leads are eligible for enrichment" },
        { status: 400 },
      );
    }

    let enrichedCount = 0;
    let queuedCount = 0;
    const autoQueueLeadIds: number[] = [];
    const enrichedLeads: Array<{ id: number; businessName: string; enrichmentData: string }> = [];

    for (const lead of eligible) {
      const prepared = await prepareLeadOutreachPackage({
        lead,
        senderName: authResult.session.user.name || "Riley",
        forceRefresh: true,
      });

      const enrichmentJson = JSON.stringify(prepared.legacyCompatibility.enrichment);
      const shouldQueue = prepared.decisionRecord?.decision.decision === "auto-send";
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          enrichedAt: new Date(),
          enrichmentData: enrichmentJson,
          tacticalNote: prepared.legacyCompatibility.tacticalNote,
          painSignals: JSON.stringify(prepared.legacyCompatibility.painSignals),
          axiomWebsiteAssessment: JSON.stringify(prepared.legacyCompatibility.websiteAssessment),
          email: prepared.bestEmail.email || lead.email,
          emailConfidence: prepared.bestEmail.confidence || lead.emailConfidence,
          emailType: prepared.bestEmail.emailType || lead.emailType,
          emailFlags: JSON.stringify(prepared.bestEmail.flags),
          phone: prepared.legacyCompatibility.phone || lead.phone,
          socialLink: prepared.legacyCompatibility.socialLink || lead.socialLink,
          websiteStatus: prepared.legacyCompatibility.websiteStatus,
          websiteUrl: prepared.legacyCompatibility.websiteUrl,
          websiteDomain: prepared.legacyCompatibility.websiteDomain,
          followUpQuestion: prepared.legacyCompatibility.followUpQuestion,
          outreachStatus:
            shouldQueue
              ? "ENRICHED"
              : lead.outreachStatus === "NOT_CONTACTED" || !lead.outreachStatus
                ? "ENRICHED"
                : lead.outreachStatus,
        },
      });

      if (shouldQueue) {
        autoQueueLeadIds.push(lead.id);
      }

      enrichedCount++;

      enrichedLeads.push({
        id: lead.id,
        businessName: lead.businessName,
        enrichmentData: enrichmentJson,
      });
    }

    if (autoQueueLeadIds.length > 0) {
      const queueResult = await queueLeadsForAutomation({
        leadIds: autoQueueLeadIds,
        queuedByUserId: authResult.session.user.id,
      });
      queuedCount += queueResult.queued.length;
    }

    return NextResponse.json({
      enriched: enrichedCount,
      queued: queuedCount,
      skipped: leads.length - enrichedCount,
      total: leads.length,
      leads: enrichedLeads,
    });
  } catch (error: unknown) {
    console.error("Enrichment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enrich leads" },
      { status: 500 },
    );
  }
}
