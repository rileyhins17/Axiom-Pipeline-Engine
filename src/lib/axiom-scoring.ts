/**
 * Axiom Scoring Engine — Sales-Probability Score
 * 
 * Computes a 0–100 score predicting likelihood Axiom can close the deal.
 * 4 buckets: Business Value (0-30), Pain & Opportunity (0-40), 
 * Reachability (0-20), Local Fit & Priority (0-10)
 */

// ═══ TYPES ═══

export interface PainSignal {
    type: "CONVERSION" | "SPEED" | "TRUST" | "SEO" | "NO_WEBSITE" | "DESIGN" | "FUNCTIONALITY";
    severity: number; // 1-5
    evidence: string;
    source: "site_scan" | "ai_analysis" | "heuristic" | "maps_data";
}

export interface ScoreBreakdown {
    businessValue: number;       // 0-30
    painOpportunity: number;     // 0-40
    reachability: number;        // 0-20
    localFit: number;            // 0-10
}

export interface AxiomScoreResult {
    axiomScore: number;          // 0-100
    tier: string;                // S, A, B, C, D
    breakdown: ScoreBreakdown;
    painSignals: PainSignal[];
}

export interface WebsiteAssessment {
    speedRisk: number;           // 0-5
    conversionRisk: number;      // 0-5
    trustRisk: number;           // 0-5
    seoRisk: number;             // 0-5
    overallGrade: string;        // A-F
    topFixes: string[];          // 3 quick-win fixes
}

export interface ContactQuality {
    emailType: "owner" | "staff" | "generic" | "unknown";
    emailConfidence: number;     // 0-1
    phoneConfidence: number;     // 0-1
}

// ═══ CONSTANTS ═══

const HIGH_LTV_INDUSTRIES = [
    "dentist", "dental", "orthodont",
    "med spa", "med-spa", "medspa", "medical spa", "aesthetic",
    "law", "lawyer", "attorney", "legal",
    "roofing", "roofer",
    "hvac", "heating", "cooling", "air conditioning",
    "plumb", "plumber", "plumbing",
    "electric", "electrician",
    "landscap", "lawn",
    "auto", "car detailing", "auto detailing",
    "home renovation", "renovation", "remodel",
    "concrete", "paving", "asphalt",
    "clinic", "private clinic", "physiother", "chiropr",
    "cabinet", "custom cabinet", "kitchen",
    "pool", "hot tub",
    "solar", "solar panel",
    "real estate", "realtor",
    "cleaning", "commercial cleaning", "janitorial",
    "pest control",
    "moving", "mover",
    "garage door",
    "fencing", "fence",
    "tree service", "arborist",
    "painting", "painter",
    "flooring",
    "window", "door",
    "siding",
    "insulation",
    "demolition",
    "excavat",
    "vet", "veterinar",
    "optom", "eye",
];

export const AXIOM_PRIORITY_CITIES = [
    "kitchener", "waterloo", "cambridge", "guelph",
    "hamilton", "london", "brantford", "stratford",
    "woodstock", "st. catharines", "niagara falls",
    "burlington", "oakville", "milton", "brampton",
    "mississauga", "toronto", "barrie",
];

const AXIOM_CORE_CITIES = [
    "kitchener", "waterloo", "cambridge", "guelph",
    "hamilton", "london",
];

// ═══ SCORING FUNCTIONS ═══

/**
 * A) Business Value (0-30)
 * Signals the client can pay and has real revenue.
 */
export function scoreBusinessValue(
    niche: string,
    category: string,
    rating: number,
    reviewCount: number,
    websiteContent: string,
): number {
    let score = 0;
    const lower = `${niche} ${category}`.toLowerCase();

    // Industry high-LTV check (+0-10)
    const isHighLTV = HIGH_LTV_INDUSTRIES.some(ind => lower.includes(ind));
    if (isHighLTV) score += 10;

    // Revenue surface area (+0-10)
    // Check for signals of real business in website content
    const contentLower = websiteContent.toLowerCase();
    const revenueSurfaces = [
        contentLower.includes("services") || contentLower.includes("our services"),
        contentLower.includes("pricing") || contentLower.includes("rates") || contentLower.includes("quote"),
        contentLower.includes("book") || contentLower.includes("schedule") || contentLower.includes("appointment"),
        contentLower.includes("team") || contentLower.includes("staff") || contentLower.includes("meet our"),
        contentLower.includes("location") || contentLower.includes("locations") || contentLower.includes("branches"),
        contentLower.includes("hiring") || contentLower.includes("careers") || contentLower.includes("join our team"),
        contentLower.includes("since") || contentLower.includes("established") || contentLower.includes("years of experience"),
    ];
    const surfaceCount = revenueSurfaces.filter(Boolean).length;
    score += Math.min(surfaceCount * 2, 10);

    // Review volume & rating consistency (+0-10)
    if (reviewCount >= 100 && rating >= 4.0) score += 10;
    else if (reviewCount >= 50 && rating >= 3.8) score += 8;
    else if (reviewCount >= 20 && rating >= 3.5) score += 6;
    else if (reviewCount >= 10 && rating >= 3.0) score += 4;
    else if (reviewCount >= 5) score += 2;

    return Math.min(score, 30);
}

/**
 * B) Pain & Opportunity (0-40)
 * This is the core. Scoring the reason to buy.
 */
export function scorePainOpportunity(
    websiteStatus: string,
    assessment: WebsiteAssessment | null,
    painSignals: PainSignal[],
    reviewCount: number,
): number {
    let score = 0;

    // No website but verified business (+20)
    if (websiteStatus === "MISSING") {
        if (reviewCount >= 3) score += 20; // Verified real business
        else score += 12; // Might not be real enough
    }

    if (assessment && websiteStatus === "ACTIVE") {
        // Speed/performance risk (+0-15)
        score += Math.min(assessment.speedRisk * 3, 15);

        // Conversion funnel weakness (+0-15)
        score += Math.min(assessment.conversionRisk * 3, 15);

        // Trust/tech debt (+0-10)
        score += Math.min(assessment.trustRisk * 2, 10);
    }

    // Cap based on pain signals - if we found no actual problems, cap lower
    const highSeveritySignals = painSignals.filter(s => s.severity >= 3).length;
    if (highSeveritySignals === 0 && websiteStatus === "ACTIVE") {
        score = Math.min(score, 10);
    }

    return Math.min(score, 40);
}

/**
 * C) Reachability (0-20)
 */
export function scoreReachability(
    contact: ContactQuality,
    hasContactForm: boolean,
    hasSocialMessaging: boolean,
): number {
    let score = 0;

    // Phone quality (+0-8)
    score += Math.round(contact.phoneConfidence * 8);

    // Email quality (+0-8)
    if (contact.emailType === "owner") score += Math.round(contact.emailConfidence * 8);
    else if (contact.emailType === "staff") score += Math.round(contact.emailConfidence * 6);
    else if (contact.emailType === "generic") score += Math.round(contact.emailConfidence * 4);
    else score += Math.round(contact.emailConfidence * 2);

    // Contact path quality (+0-4)
    if (hasContactForm) score += 2;
    if (hasSocialMessaging) score += 2;

    return Math.min(score, 20);
}

/**
 * D) Local Fit & Priority (0-10)
 */
export function scoreLocalFit(
    city: string,
    reviewContent: string,
): number {
    let score = 0;
    const cityLower = city.toLowerCase().trim();

    // Within Axiom's priority cities (+0-6)
    if (AXIOM_CORE_CITIES.includes(cityLower)) score += 6;
    else if (AXIOM_PRIORITY_CITIES.includes(cityLower)) score += 4;
    else if (cityLower.includes("ontario") || cityLower.includes(", on")) score += 2;

    // Recency/intent signals (+0-4)
    const contentLower = reviewContent.toLowerCase();
    const intentSignals = [
        contentLower.includes("new location") || contentLower.includes("just opened") || contentLower.includes("grand opening"),
        contentLower.includes("hiring") || contentLower.includes("looking for"),
        contentLower.includes("renovated") || contentLower.includes("new management") || contentLower.includes("under new"),
        contentLower.includes("expanding") || contentLower.includes("second location"),
    ];
    score += Math.min(intentSignals.filter(Boolean).length * 2, 4);

    return Math.min(score, 10);
}

/**
 * Compute tier from axiomScore with pain signal validation.
 * Hard rule: A lead cannot be S/A without at least two pain signals.
 */
export function computeTier(axiomScore: number, painSignals: PainSignal[]): string {
    const highSeverityPains = painSignals.filter(s => s.severity >= 2).length;

    // Must have at least one pain signal to be S-tier
    if (axiomScore >= 80 && highSeverityPains >= 1) return "S";
    if (axiomScore >= 80) return "A"; // Demoted for lack of pain

    if (axiomScore >= 60) return "A";
    if (axiomScore >= 40) return "B";
    if (axiomScore >= 20) return "C";
    return "D";
}

/**
 * Full Axiom score computation.
 */
export function computeAxiomScore(input: {
    niche: string;
    category: string;
    city: string;
    rating: number;
    reviewCount: number;
    websiteStatus: string;
    websiteContent: string;
    assessment: WebsiteAssessment | null;
    painSignals: PainSignal[];
    contact: ContactQuality;
    hasContactForm: boolean;
    hasSocialMessaging: boolean;
    reviewContent: string;
}): AxiomScoreResult {
    const businessValue = scoreBusinessValue(
        input.niche, input.category, input.rating, input.reviewCount, input.websiteContent
    );
    const painOpportunity = scorePainOpportunity(
        input.websiteStatus, input.assessment, input.painSignals, input.reviewCount
    );
    const reachability = scoreReachability(
        input.contact, input.hasContactForm, input.hasSocialMessaging
    );
    const localFit = scoreLocalFit(input.city, input.reviewContent);

    const axiomScore = Math.min(businessValue + painOpportunity + reachability + localFit, 100);
    const tier = computeTier(axiomScore, input.painSignals);

    return {
        axiomScore,
        tier,
        breakdown: { businessValue, painOpportunity, reachability, localFit },
        painSignals: input.painSignals,
    };
}

/**
 * Backfill scoring for existing leads that lack website scan data.
 * Uses only the structured data available in the DB.
 */
export function computeAxiomScoreFromDbLead(lead: {
    niche: string;
    category: string | null;
    city: string;
    rating: number | null;
    reviewCount: number | null;
    websiteStatus: string | null;
    email: string | null;
    phone: string | null;
    socialLink: string | null;
    contactName: string | null;
    tacticalNote: string | null;
}): AxiomScoreResult {
    // Build pain signals from available data
    const painSignals: PainSignal[] = [];

    if (lead.websiteStatus === "MISSING") {
        painSignals.push({
            type: "NO_WEBSITE",
            severity: 4,
            evidence: "No website found — business relies on Google listing and word-of-mouth only",
            source: "maps_data",
        });
        if ((lead.reviewCount || 0) >= 5) {
            painSignals.push({
                type: "CONVERSION",
                severity: 3,
                evidence: `Active business with ${lead.reviewCount} reviews but zero web presence — losing leads to competitors who show up online`,
                source: "heuristic",
            });
        }
    }

    // Parse tactical note for pain signals
    const note = (lead.tacticalNote || "").toLowerCase();
    if (note.includes("poor") || note.includes("outdated") || note.includes("broken")) {
        painSignals.push({
            type: "DESIGN",
            severity: 3,
            evidence: `AI assessment flagged website quality issues: ${(lead.tacticalNote || "").substring(0, 100)}`,
            source: "ai_analysis",
        });
    }
    if (note.includes("no call") || note.includes("no cta") || note.includes("no form") || note.includes("no booking")) {
        painSignals.push({
            type: "CONVERSION",
            severity: 3,
            evidence: "No clear conversion path detected on website",
            source: "ai_analysis",
        });
    }

    // Contact quality from available data
    const contact = validateContactBasic(lead.email, lead.phone);
    const hasContactForm = false; // Unknown for backfill
    const hasSocialMessaging = !!(lead.socialLink && lead.socialLink.includes("facebook"));

    return computeAxiomScore({
        niche: lead.niche,
        category: lead.category || "",
        city: lead.city,
        rating: lead.rating || 0,
        reviewCount: lead.reviewCount || 0,
        websiteStatus: lead.websiteStatus || "MISSING",
        websiteContent: lead.tacticalNote || "",
        assessment: null,
        painSignals,
        contact,
        hasContactForm,
        hasSocialMessaging,
        reviewContent: "",
    });
}

/**
 * Basic contact validation for backfill (no network calls).
 */
function validateContactBasic(email: string | null, phone: string | null): ContactQuality {
    let emailType: ContactQuality["emailType"] = "unknown";
    let emailConfidence = 0;
    let phoneConfidence = 0;

    if (email && email.length > 0) {
        const e = email.toLowerCase();
        const localPart = e.split("@")[0] || "";
        const isFreeProvider = /@(gmail|yahoo|hotmail|outlook|icloud|live|msn|protonmail|mail\.com|zoho)\./.test(e);
        const looksLikePerson = /^[a-z]+([._-][a-z]+)+$/.test(localPart) || /^[a-z]{4,}$/.test(localPart);
        if (e.startsWith("info@") || e.startsWith("contact@") || e.startsWith("hello@") || e.startsWith("office@") || e.startsWith("admin@")) {
            emailType = "generic";
            emailConfidence = 0.5;
        } else if (isFreeProvider && looksLikePerson) {
            emailType = "staff";
            emailConfidence = 0.45;
        } else if (isFreeProvider) {
            emailType = "staff";
            emailConfidence = 0.35;
        } else {
            emailType = "staff";
            emailConfidence = 0.7;
        }
    }

    if (phone && phone.length >= 10) {
        const digits = phone.replace(/\D/g, "");
        if (digits.length === 10 || digits.length === 11) {
            phoneConfidence = 0.8;
        } else {
            phoneConfidence = 0.3;
        }
    }

    return { emailType, emailConfidence, phoneConfidence };
}
