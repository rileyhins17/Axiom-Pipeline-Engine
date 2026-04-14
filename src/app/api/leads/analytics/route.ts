import { NextResponse } from "next/server";

import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { countPipelineArtifacts, getTopAssessmentDimensions } from "@/lib/lead-pipeline/repository";
import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const authResult = await requireApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const prisma = getPrisma();
    const leads = await prisma.lead.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" },
    });

    const total = leads.length;
    const withEmail = leads.filter((lead) => hasValidPipelineEmail(lead)).length;
    const withPhone = leads.filter((lead) => lead.phone && lead.phone.length > 0).length;
    const missingWebsite = leads.filter((lead) => lead.websiteStatus === "MISSING").length;
    const activeWebsite = leads.filter((lead) => lead.websiteStatus === "ACTIVE").length;
    const withSocial = leads.filter((lead) => lead.socialLink && lead.socialLink.length > 0).length;
    const withContact = leads.filter((lead) => lead.contactName && lead.contactName.length > 0).length;

    const rated = leads.filter((lead) => lead.rating && lead.rating > 0);
    const avgRating =
      rated.length > 0
        ? parseFloat((rated.reduce((sum, lead) => sum + (lead.rating || 0), 0) / rated.length).toFixed(1))
        : 0;

    const scored = leads.filter((lead) => lead.axiomScore !== null && lead.axiomScore !== undefined);
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, lead) => sum + (lead.axiomScore || 0), 0) / scored.length)
        : 0;

    const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    leads.forEach((lead) => {
      if (lead.axiomTier && tierCounts[lead.axiomTier] !== undefined) {
        tierCounts[lead.axiomTier]++;
      }
    });

    const tierByNiche: Record<string, Record<string, number>> = {};
    leads.forEach((lead) => {
      const niche = lead.niche || "Unknown";
      if (!tierByNiche[niche]) tierByNiche[niche] = { S: 0, A: 0, B: 0, C: 0, D: 0 };
      if (lead.axiomTier) tierByNiche[niche][lead.axiomTier]++;
    });

    const tierByCity: Record<string, Record<string, number>> = {};
    leads.forEach((lead) => {
      const city = lead.city || "Unknown";
      if (!tierByCity[city]) tierByCity[city] = { S: 0, A: 0, B: 0, C: 0, D: 0 };
      if (lead.axiomTier) tierByCity[city][lead.axiomTier]++;
    });

    const scoreByNiche: Record<string, { total: number; count: number }> = {};
    leads.forEach((lead) => {
      const niche = lead.niche || "Unknown";
      if (!scoreByNiche[niche]) scoreByNiche[niche] = { total: 0, count: 0 };
      if (lead.axiomScore !== null) {
        scoreByNiche[niche].total += lead.axiomScore || 0;
        scoreByNiche[niche].count++;
      }
    });
    const avgScoreByNiche = Object.entries(scoreByNiche)
      .map(([name, { total, count }]) => ({
        name,
        avgScore: count > 0 ? Math.round(total / count) : 0,
        count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const scoreByCity: Record<string, { total: number; count: number }> = {};
    leads.forEach((lead) => {
      const city = lead.city || "Unknown";
      if (!scoreByCity[city]) scoreByCity[city] = { total: 0, count: 0 };
      if (lead.axiomScore !== null) {
        scoreByCity[city].total += lead.axiomScore || 0;
        scoreByCity[city].count++;
      }
    });
    const avgScoreByCity = Object.entries(scoreByCity)
      .map(([name, { total, count }]) => ({
        name,
        avgScore: count > 0 ? Math.round(total / count) : 0,
        count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const painFreq: Record<string, number> = {};
    leads.forEach((lead) => {
      try {
        const pains = JSON.parse(lead.painSignals || "[]");
        for (const pain of pains) {
          const key = pain.type || "UNKNOWN";
          painFreq[key] = (painFreq[key] || 0) + 1;
        }
      } catch {}
    });
    const topPainSignals = Object.entries(painFreq)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const callableLeads = leads.filter((lead) => isLeadOutreachEligible(lead)).length;

    const nicheMap: Record<string, number> = {};
    leads.forEach((lead) => {
      nicheMap[lead.niche || "Unknown"] = (nicheMap[lead.niche || "Unknown"] || 0) + 1;
    });
    const nicheBreakdown = Object.entries(nicheMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const cityMap: Record<string, number> = {};
    leads.forEach((lead) => {
      cityMap[lead.city || "Unknown"] = (cityMap[lead.city || "Unknown"] || 0) + 1;
    });
    const cityDistribution = Object.entries(cityMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const timeMap: Record<string, number> = {};
    const now = new Date();
    for (let index = 29; index >= 0; index--) {
      const day = new Date(now);
      day.setDate(day.getDate() - index);
      timeMap[day.toISOString().split("T")[0]] = 0;
    }
    leads.forEach((lead) => {
      const key = new Date(lead.createdAt).toISOString().split("T")[0];
      if (key in timeMap) timeMap[key]++;
    });
    const leadsOverTime = Object.entries(timeMap).map(([date, count]) => ({ date, count }));

    const scoreDistribution = {
      elite: tierCounts.S,
      high: tierCounts.A,
      medium: tierCounts.B,
      low: tierCounts.C + tierCounts.D,
    };

    const gradeMap: Record<string, number> = {};
    leads.forEach((lead) => {
      if (lead.websiteGrade) gradeMap[lead.websiteGrade] = (gradeMap[lead.websiteGrade] || 0) + 1;
    });
    const gradeDistribution = Object.entries(gradeMap)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => a.grade.localeCompare(b.grade));

    const topLeads = [...leads]
      .filter((lead) => lead.axiomScore !== null)
      .sort((a, b) => (b.axiomScore || 0) - (a.axiomScore || 0))
      .slice(0, 8)
      .map((lead) => ({
        id: lead.id,
        businessName: lead.businessName,
        niche: lead.niche,
        city: lead.city,
        leadScore: lead.axiomScore,
        axiomScore: lead.axiomScore,
        axiomTier: lead.axiomTier,
        websiteStatus: lead.websiteStatus,
        email: Boolean(lead.email),
        callOpener: lead.callOpener,
      }));

    const recentActivity = leads.slice(0, 10).map((lead) => ({
      id: lead.id,
      businessName: lead.businessName,
      niche: lead.niche,
      city: lead.city,
      leadScore: lead.axiomScore,
      axiomScore: lead.axiomScore,
      axiomTier: lead.axiomTier,
      websiteStatus: lead.websiteStatus,
      email: Boolean(lead.email),
      createdAt: lead.createdAt,
    }));

    const emailRate = total > 0 ? Math.round((withEmail / total) * 100) : 0;
    const funnel = {
      raw: total,
      enriched: leads.filter((lead) => lead.tacticalNote && lead.tacticalNote !== "No intelligence generated.").length,
      scored: scored.length,
      contactable: leads.filter((lead) => hasValidPipelineEmail(lead)).length,
    };

    const totalArchived = await prisma.lead.count({ where: { isArchived: true } });
    const pipelineArtifacts = await countPipelineArtifacts();
    const assessmentDimensions = await getTopAssessmentDimensions();

    return NextResponse.json({
      total,
      withEmail,
      withPhone,
      missingWebsite,
      activeWebsite,
      withSocial,
      withContact,
      avgRating,
      avgScore,
      emailRate,
      scoreDistribution,
      nicheBreakdown,
      cityDistribution,
      leadsOverTime,
      gradeDistribution,
      topLeads,
      recentActivity,
      funnel,
      tierCounts,
      tierByNiche,
      tierByCity,
      avgScoreByNiche,
      avgScoreByCity,
      topPainSignals,
      callableLeads,
      totalArchived,
      pipelineArtifacts,
      assessmentDimensions,
    });
  } catch (error: unknown) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analytics API error" }, { status: 500 });
  }
}
