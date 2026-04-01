import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const prisma = getPrisma();

    const tierParam = searchParams.get("tier") || "S,A,B";
    const tiers = tierParam.split(",").map((tier) => tier.trim()).filter(Boolean);
    const noWebsite = searchParams.get("noWebsite") === "1";
    const hasEmail = searchParams.get("hasEmail") === "1";
    const hasPhone = searchParams.get("hasPhone") === "1";
    const minRating = parseFloat(searchParams.get("minRating") || "0");
    const city = searchParams.get("city") || null;
    const niche = searchParams.get("niche") || null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);
    const sort = searchParams.get("sort") || "score";

    const where: any = {
      isArchived: false,
    };

    if (tiers.length > 0 && !tiers.includes("ALL")) {
      where.OR = [{ axiomTier: { in: tiers } }, { axiomTier: null }];
    }
    if (noWebsite) {
      where.websiteStatus = "MISSING";
    }
    if (hasEmail) {
      where.email = { not: null };
    }
    if (hasPhone) {
      where.phone = { not: null };
    }
    if (minRating > 0) {
      where.rating = { gte: minRating };
    }
    if (city) where.city = city;
    if (niche) where.niche = niche;

    const orderBy =
      sort === "recent"
        ? ({ createdAt: "desc" } as const)
        : ({ axiomScore: "desc" } as const);

    const leads = await prisma.lead.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        businessName: true,
        niche: true,
        city: true,
        address: true,
        websiteStatus: true,
        phone: true,
        email: true,
        contactName: true,
        emailType: true,
        emailConfidence: true,
        phoneConfidence: true,
        axiomScore: true,
        axiomTier: true,
        painSignals: true,
        callOpener: true,
        followUpQuestion: true,
        axiomWebsiteAssessment: true,
        isArchived: true,
        lastUpdated: true,
        source: true,
        rating: true,
        reviewCount: true,
        outreachStatus: true,
        outreachChannel: true,
        firstContactedAt: true,
        lastContactedAt: true,
        nextFollowUpDue: true,
        outreachNotes: true,
      },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Triage fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
