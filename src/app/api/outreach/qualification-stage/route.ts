import { NextResponse } from "next/server";

import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { getActiveAutomationLeadIds } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const automationLeadIds = new Set(await getActiveAutomationLeadIds());
    const leads = await prisma.lead.findMany({
      where: {
        isArchived: false,
        enrichedAt: { not: null },
      },
      orderBy: {
        enrichedAt: "desc",
      },
      select: {
        id: true,
        businessName: true,
        city: true,
        niche: true,
        phone: true,
        email: true,
        emailConfidence: true,
        emailFlags: true,
        emailType: true,
        contactName: true,
        axiomScore: true,
        axiomTier: true,
        websiteStatus: true,
        enrichedAt: true,
        enrichmentData: true,
        outreachStatus: true,
        source: true,
        createdAt: true,
        lastUpdated: true,
        outreachNotes: true,
      },
    });

    const stageEligibleLeads = leads.filter((lead) => {
      if (automationLeadIds.has(lead.id)) return false;
      if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
      if (isContactedOutreachStatus(lead.outreachStatus)) return false;
      return true;
    });
    const stages = partitionPreSendLeads(stageEligibleLeads);

    return NextResponse.json({
      leads: stages.qualification,
    });
  } catch (error: any) {
    console.error("Qualification stage fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch qualification stage leads" },
      { status: 500 },
    );
  }
}
