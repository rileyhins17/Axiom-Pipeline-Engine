import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const authResult = await requireApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const prisma = getPrisma();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // All counts run in parallel — these power the sidebar badges and stats
    // bar, so they need to be cheap. Previously the four count queries plus
    // the today-leads `findMany` ran in 3 sequential awaits; one Promise.all
    // collapses that into a single round-trip wave.
    const [total, readyForTouch, followUp, replied, todayLeads, allTodayLeads] = await Promise.all([
      prisma.lead.count({ where: { isArchived: false } }),
      prisma.lead.count({ where: { isArchived: false, outreachStatus: "READY_FOR_FIRST_TOUCH" } }),
      prisma.lead.count({ where: { isArchived: false, outreachStatus: "FOLLOW_UP_DUE" } }),
      prisma.lead.count({ where: { isArchived: false, outreachStatus: "REPLIED" } }),
      prisma.lead.count({ where: { isArchived: false, createdAt: { gte: today } } }),
      prisma.lead.findMany({
        where: { createdAt: { gte: today } },
        select: {
          email: true,
          axiomTier: true,
          isArchived: true,
          phoneConfidence: true,
          emailConfidence: true,
          socialLink: true,
        },
      }),
    ]);

    const todayEmails = allTodayLeads.filter((lead) => lead.email && lead.email.length > 0 && !lead.isArchived).length;
    const todayCallable = allTodayLeads.filter((lead) => {
      const goodTier = ["S", "A", "B"].includes(lead.axiomTier || "");
      const goodPhone = (lead.phoneConfidence || 0) > 0.6;
      const goodContact = (lead.emailConfidence || 0) > 0.4 || (lead.socialLink && lead.socialLink.length > 0);
      return goodTier && goodPhone && goodContact && !lead.isArchived;
    }).length;
    const todayTierSA = allTodayLeads.filter((lead) => ["S", "A"].includes(lead.axiomTier || "") && !lead.isArchived).length;
    const todayDisqualified = allTodayLeads.filter((lead) => lead.isArchived).length;

    return NextResponse.json({
      total,
      todayLeads,
      todayEmails,
      todayCallable,
      todayTierSA,
      todayDisqualified,
      readyForTouch,
      followUp,
      replied,
    });
  } catch {
    return NextResponse.json({
      total: 0,
      todayLeads: 0,
      todayEmails: 0,
      todayCallable: 0,
      todayTierSA: 0,
      todayDisqualified: 0,
      readyForTouch: 0,
      followUp: 0,
      replied: 0,
    });
  }
}
