/**
 * Disqualifier Engine
 *
 * Identifies leads that are not worth pursuing and auto-archives them.
 * Returns a list of disqualification reasons.
 */

import type { PainSignal, WebsiteAssessment } from "./axiom-scoring";

export interface DisqualifyResult {
    disqualified: boolean;
    reasons: string[];
    primaryReason: string | null;
}

// Industries with low ROI for Axiom at the current price point.
const LOW_ROI_INDUSTRIES = [
    "food truck", "lemonade", "babysit",
    "garage sale", "flea market", "thrift",
    "tutoring", "freelanc",
    "nonprofit", "non-profit", "charity",
    "church", "worship",
];

/**
 * Check if a lead should be disqualified.
 */
export function checkDisqualifiers(input: {
    businessName: string;
    niche: string;
    category: string;
    city: string;
    rating: number;
    reviewCount: number;
    websiteStatus: string;
    websiteContent: string;
    assessment: WebsiteAssessment | null;
    painSignals: PainSignal[];
    axiomScore: number;
    tier: string;
}): DisqualifyResult {
    const reasons: string[] = [];
    const lower = `${input.niche} ${input.category} ${input.businessName}`.toLowerCase();
    // 1. Business appears closed / no activity.
    if (input.reviewCount === 0 && input.websiteStatus === "MISSING") {
        reasons.push("Business appears inactive - zero reviews and no web presence");
    }

    // 2. Industry low ROI.
    const isLowROI = LOW_ROI_INDUSTRIES.some((ind) => lower.includes(ind));
    if (isLowROI) {
        reasons.push(`Industry low ROI for Axiom at current price point (${input.niche})`);
    }

    // 3. Website already modern/high-performing.
    if (input.assessment && input.websiteStatus === "ACTIVE") {
        const totalRisk =
            input.assessment.speedRisk +
            input.assessment.conversionRisk +
            input.assessment.trustRisk +
            input.assessment.seoRisk;
        if (totalRisk <= 4 && input.assessment.overallGrade === "A") {
            reasons.push("Website already modern/high-performing with strong funnel - no pain to solve");
        }
    }

    // 4. Very low rating - business has bigger problems than a website.
    if (input.rating > 0 && input.rating < 2.0 && input.reviewCount >= 10) {
        reasons.push(`Very low rating (${input.rating}/5 from ${input.reviewCount} reviews) - business has fundamental service issues`);
    }

    // 5. Tier D auto-archive.
    if (input.tier === "D") {
        reasons.push(`Axiom score too low (${input.axiomScore}/100 = Tier D) - not worth call time`);
    }

    const disqualified = reasons.length > 0;

    return {
        disqualified,
        reasons,
        primaryReason: reasons.length > 0 ? reasons[0] : null,
    };
}

/**
 * Simplified disqualifier check for backfill (uses limited DB data).
 */
export function checkDisqualifiersFromDb(lead: {
    businessName: string;
    niche: string;
    category: string | null;
    city: string;
    rating: number | null;
    reviewCount: number | null;
    websiteStatus: string | null;
    axiomScore: number;
    tier: string;
    tacticalNote: string | null;
}): DisqualifyResult {
    return checkDisqualifiers({
        businessName: lead.businessName,
        niche: lead.niche,
        category: lead.category || "",
        city: lead.city,
        rating: lead.rating || 0,
        reviewCount: lead.reviewCount || 0,
        websiteStatus: lead.websiteStatus || "MISSING",
        websiteContent: lead.tacticalNote || "",
        assessment: null,
        painSignals: [],
        axiomScore: lead.axiomScore,
        tier: lead.tier,
    });
}
