import { NextResponse } from "next/server";

import { computeAxiomScoreFromDbLead } from "@/lib/axiom-scoring";
import { writeAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/cloudflare";
import { validateContact } from "@/lib/contact-validation";
import { generateDedupeKey } from "@/lib/dedupe";
import { generatePersonalization } from "@/lib/lead-personalization";
import { getPrisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { requireAdminApiSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminApiSession(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const originFailure = assertTrustedRequestOrigin(request);
    if (originFailure) {
      return originFailure;
    }

    const prisma = getPrisma();
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "asc" },
    });

    let processed = 0;
    let disqualified = 0;
    let archived = 0;
    const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    const seenDedupeKeys = new Set<string>();
    let dupesFound = 0;

    for (const lead of leads) {
      const scoreResult = computeAxiomScoreFromDbLead({
        niche: lead.niche,
        category: lead.category,
        city: lead.city,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        websiteStatus: lead.websiteStatus,
        email: lead.email,
        phone: lead.phone,
        socialLink: lead.socialLink,
        contactName: lead.contactName,
        tacticalNote: lead.tacticalNote,
      });

      const contactValidation = validateContact(lead.email, lead.phone);
      const dedupe = generateDedupeKey(lead.businessName, lead.city, lead.phone, null, lead.address);

      let isDuplicate = false;
      if (seenDedupeKeys.has(dedupe.key)) {
        isDuplicate = true;
        dupesFound++;
      }
      seenDedupeKeys.add(dedupe.key);

      const personalization = generatePersonalization({
        businessName: lead.businessName,
        niche: lead.niche,
        city: lead.city,
        websiteStatus: lead.websiteStatus || "MISSING",
        painSignals: scoreResult.painSignals,
        assessment: null,
        contactName: lead.contactName || null,
      });

      const shouldArchive = isDuplicate;
      if (shouldArchive) archived++;

      tierCounts[scoreResult.tier] = (tierCounts[scoreResult.tier] || 0) + 1;

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          axiomScore: scoreResult.axiomScore,
          axiomTier: scoreResult.tier,
          scoreBreakdown: JSON.stringify(scoreResult.breakdown),
          painSignals: JSON.stringify(scoreResult.painSignals),
          callOpener: personalization.callOpener,
          followUpQuestion: personalization.followUpQuestion,
          dedupeKey: dedupe.key,
          dedupeMatchedBy: dedupe.matchedBy,
          emailType: contactValidation.emailType,
          emailConfidence: contactValidation.emailConfidence,
          phoneConfidence: contactValidation.phoneConfidence,
          isArchived: shouldArchive,
          leadScore: scoreResult.axiomScore,
          lastUpdated: new Date(),
        },
      });

      processed++;
    }

    await writeAuditEvent({
      action: "lead.backfill",
      actorUserId: authResult.session.user.id,
      ipAddress: getClientIp(request),
      metadata: {
        archived,
        dupesFound,
        processed,
      },
    });

    return NextResponse.json({
      success: true,
      processed,
      disqualified,
      archived,
      dupesFound,
      tierDistribution: tierCounts,
      message: `Backfilled ${processed} leads. ${disqualified} disqualified, ${dupesFound} dupes found, ${archived} archived.`,
    });
  } catch (error: any) {
    console.error("Backfill error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
