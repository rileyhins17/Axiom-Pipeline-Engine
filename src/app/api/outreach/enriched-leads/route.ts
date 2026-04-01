import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/session";

export async function GET(request: Request) {
  const authResult = await requireApiSession(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  try {
    const prisma = getPrisma();
    const leads = await prisma.lead.findMany({
      where: {
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
        email: true,
        contactName: true,
        axiomScore: true,
        axiomTier: true,
        websiteStatus: true,
        enrichedAt: true,
        enrichmentData: true,
        outreachStatus: true,
      },
    });

    return NextResponse.json({ leads });
  } catch (error: any) {
    console.error("Enriched leads fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch enriched leads" },
      { status: 500 },
    );
  }
}
