import { NextResponse } from "next/server";

import { enrichLeadsBatch } from "@/lib/outreach-enrichment";
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

    // Filter to ICP: needs valid email
    const eligible = leads.filter((lead) => {
      if (!lead.email || lead.email.trim() === "") return false;
      return true;
    });

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "None of the selected leads have valid email addresses" },
        { status: 400 },
      );
    }

    // Run DeepSeek enrichment
    const results = await enrichLeadsBatch(eligible);

    // Store enrichment data on each lead
    let enrichedCount = 0;
    const enrichedLeads: Array<{ id: number; businessName: string; enrichmentData: string }> = [];

    for (const [leadId, enrichment] of results.entries()) {
      const enrichmentJson = JSON.stringify(enrichment);
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          enrichedAt: new Date(),
          enrichmentData: enrichmentJson,
        },
      });
      enrichedCount++;

      const lead = eligible.find((l) => l.id === leadId);
      enrichedLeads.push({
        id: leadId,
        businessName: lead?.businessName || "",
        enrichmentData: enrichmentJson,
      });
    }

    return NextResponse.json({
      enriched: enrichedCount,
      skipped: eligible.length - enrichedCount,
      total: leads.length,
      leads: enrichedLeads,
    });
  } catch (error: any) {
    console.error("Enrichment error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enrich leads" },
      { status: 500 },
    );
  }
}
