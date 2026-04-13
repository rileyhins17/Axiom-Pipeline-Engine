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
    businessStatus?: string | null;
    geoConfidence?: "high" | "medium" | "low";
    verticalConfidence?: "high" | "medium" | "low";
    siteType?: "business" | "directory" | "placeholder" | "parked" | "social" | "unknown";
    directoryShellDetected?: boolean;
    placeholderDetected?: boolean;
    contactChannelCount?: number;
    extractionConfidence?: number;
}): DisqualifyResult {
    const reasons: string[] = [];
    const lower = `${input.niche} ${input.category} ${input.businessName}`.toLowerCase();
    // 1. Business appears closed / no activity.
    if (input.reviewCount === 0 && input.websiteStatus === "MISSING") {
        reasons.push("Business appears inactive - zero reviews and no web presence");
    }

    if (input.businessStatus && /closed/i.test(input.businessStatus)) {
        reasons.push(`Provider marked the business as ${input.businessStatus}`);
    }

    // 2. Industry low ROI.
    const isLowROI = LOW_ROI_INDUSTRIES.some((ind) => lower.includes(ind));
    if (isLowROI) {
        reasons.push(`Industry low ROI for Axiom at current price point (${input.niche})`);
    }

    if (input.verticalConfidence === "low") {
        reasons.push("Discovery category drifted too far from Axiom's target service profile");
    }

    if (input.geoConfidence === "low") {
        reasons.push("Discovery geography did not confidently match the requested target city");
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

    if ((input.siteType === "directory" || input.directoryShellDetected) && (input.contactChannelCount || 0) === 0) {
        reasons.push("Web presence is a directory shell without a usable direct contact path");
    }

    if ((input.siteType === "placeholder" || input.placeholderDetected) && (input.reviewCount || 0) < 5) {
        reasons.push("Website is placeholder-grade and the business does not show enough traction yet");
    }

    // 4. Very low rating - business has bigger problems than a website.
    if (input.rating > 0 && input.rating < 2.0 && input.reviewCount >= 10) {
        reasons.push(`Very low rating (${input.rating}/5 from ${input.reviewCount} reviews) - business has fundamental service issues`);
    }

    if (typeof input.extractionConfidence === "number" && input.extractionConfidence < 0.3) {
        reasons.push("Deterministic evidence quality is too weak to treat this as a safe lead");
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
        businessStatus: null,
        geoConfidence: "medium",
        verticalConfidence: "medium",
        siteType: lead.websiteStatus === "ACTIVE" ? "business" : "unknown",
        directoryShellDetected: false,
        placeholderDetected: false,
        contactChannelCount: 0,
        extractionConfidence: 0.5,
    });
}
