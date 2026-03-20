import type { LeadRecord as Lead } from "../prisma";
import {
    CsvPreset,
    CsvColumnDef,
    buildPainSummary,
    formatContactQuality,
    formatDate,
    formatJsonFlags,
    formatPainReadable,
    formatPhoneDisplay,
    formatWebsiteDomain,
    formatWebsiteUrl,
    truncateString
} from "./csv";

function parseJsonSafe(jsonStr: string | null, fallback: any = null) {
    if (!jsonStr) return fallback;
    try {
        return JSON.parse(jsonStr);
    } catch {
        return fallback;
    }
}

function extractProvince(cityStr: string | null): string {
    if (!cityStr) return "";
    const parts = cityStr.split(",");
    if (parts.length > 1) {
        return parts[parts.length - 1].trim();
    }
    return "";
}

function extractCityName(cityStr: string | null): string {
    if (!cityStr) return "";
    const parts = cityStr.split(",");
    return parts[0].trim();
}

const callSheetColumns: CsvColumnDef[] = [
    { key: "tier", header: "Tier", resolve: (l: Lead) => l.axiomTier || "" },
    { key: "score", header: "Axiom Score", resolve: (l: Lead) => l.axiomScore ?? "" },
    { key: "company", header: "Company", resolve: (l: Lead) => l.businessName || "" },
    { key: "niche", header: "Niche", resolve: (l: Lead) => l.niche || "" },
    { key: "category", header: "Category", resolve: (l: Lead) => l.category || "" },
    { key: "city", header: "City", resolve: (l: Lead) => extractCityName(l.city) },
    { key: "contact_name", header: "Contact Name", resolve: (l: Lead) => l.contactName || "" },
    { key: "phone", header: "Phone", resolve: (l: Lead) => formatPhoneDisplay(l.phone) },
    { key: "email", header: "Email", resolve: (l: Lead) => l.email || "" },
    {
        key: "contact_quality",
        header: "Contact Quality",
        resolve: (l: Lead) => formatContactQuality(l)
    },
    { key: "email_type", header: "Email Type", resolve: (l: Lead) => l.emailType || "unknown" },
    { key: "email_confidence", header: "Email Confidence", resolve: (l: Lead) => l.emailConfidence ?? "" },
    { key: "email_flags", header: "Email Flags", resolve: (l: Lead) => formatJsonFlags(l.emailFlags) },
    { key: "phone_confidence", header: "Phone Confidence", resolve: (l: Lead) => l.phoneConfidence ?? "" },
    { key: "phone_flags", header: "Phone Flags", resolve: (l: Lead) => formatJsonFlags(l.phoneFlags) },
    { key: "website_status", header: "Website Status", resolve: (l: Lead) => l.websiteStatus || "" },
    { key: "website_url", header: "Website URL", resolve: (l: Lead) => formatWebsiteUrl(l.websiteUrl) },
    { key: "website_domain", header: "Website Domain", resolve: (l: Lead) => l.websiteDomain || formatWebsiteDomain(l.websiteUrl) },
    { key: "social_link", header: "Social Link", resolve: (l: Lead) => l.socialLink || "" },
    { key: "pain_summary", header: "Pain Summary", resolve: (l: Lead) => buildPainSummary(l) },
    { key: "pain1", header: "Pain 1", resolve: (l: Lead) => formatPainReadable(l.painSignals)[0] || "" },
    { key: "pain2", header: "Pain 2", resolve: (l: Lead) => formatPainReadable(l.painSignals)[1] || "" },
    { key: "pain3", header: "Pain 3", resolve: (l: Lead) => formatPainReadable(l.painSignals)[2] || "" },
    { key: "opener_short", header: "Call Opener (Short)", resolve: (l: Lead) => truncateString(l.callOpener, 180) },
    { key: "followup_short", header: "Follow-Up (Short)", resolve: (l: Lead) => truncateString(l.followUpQuestion, 120) },
    { key: "website_grade", header: "Website Grade", resolve: (l: Lead) => l.websiteGrade || "" },
    {
        key: "top_fix_1",
        header: "Top Fix 1",
        resolve: (l: Lead) => {
            const assessment = parseJsonSafe(l.axiomWebsiteAssessment, {});
            return assessment?.topFixes?.[0] || "";
        }
    },
    {
        key: "top_fix_2",
        header: "Top Fix 2",
        resolve: (l: Lead) => {
            const assessment = parseJsonSafe(l.axiomWebsiteAssessment, {});
            return assessment?.topFixes?.[1] || "";
        }
    },
    {
        key: "top_fix_3",
        header: "Top Fix 3",
        resolve: (l: Lead) => {
            const assessment = parseJsonSafe(l.axiomWebsiteAssessment, {});
            return assessment?.topFixes?.[2] || "";
        }
    },
    { key: "opener_full", header: "Call Opener (Full)", resolve: (l: Lead) => l.callOpener || "" },
    { key: "followup_full", header: "Follow-Up (Full)", resolve: (l: Lead) => l.followUpQuestion || "" },
    { key: "source", header: "Source", resolve: (l: Lead) => l.source || "" },
    { key: "last_updated", header: "Last Updated", resolve: (l: Lead) => formatDate(l.lastUpdated || l.createdAt) },
    { key: "lead_id", header: "Lead ID", resolve: (l: Lead) => l.id }
];

const crmBasicColumns: CsvColumnDef[] = [
    { key: "company", header: "Company", resolve: (l: Lead) => l.businessName || "" },
    { key: "category", header: "Category", resolve: (l: Lead) => l.category || "" },
    { key: "website_url", header: "Website URL", resolve: (l: Lead) => formatWebsiteUrl(l.websiteUrl) },
    { key: "website_domain", header: "Website Domain", resolve: (l: Lead) => l.websiteDomain || formatWebsiteDomain(l.websiteUrl) },
    { key: "social_link", header: "Social Link", resolve: (l: Lead) => l.socialLink || "" },
    { key: "phone", header: "Phone", resolve: (l: Lead) => formatPhoneDisplay(l.phone) },
    { key: "email", header: "Email", resolve: (l: Lead) => l.email || "" },
    { key: "contact_name", header: "Contact Name", resolve: (l: Lead) => l.contactName || "" },
    { key: "address", header: "Address", resolve: (l: Lead) => l.address || "" },
    { key: "city", header: "City", resolve: (l: Lead) => extractCityName(l.city) },
    { key: "province", header: "Province/Region", resolve: (l: Lead) => extractProvince(l.city) },
    { key: "source", header: "Lead Source", resolve: (l: Lead) => l.source || "Axiom Engine" },
    {
        key: "notes",
        header: "Notes",
        resolve: (l: Lead) => {
            const tier = l.axiomTier || "N/A";
            const score = l.axiomScore ?? "N/A";
            const painSummary = buildPainSummary(l);
            const notes = `Tier ${tier}, Score ${score}. ${painSummary}`;
            return truncateString(notes, 220);
        }
    },
    { key: "lead_id", header: "Lead ID", resolve: (l: Lead) => l.id }
];

const fullColumns: CsvColumnDef[] = [
    ...callSheetColumns.filter(c => !["pain1", "pain2", "pain3", "top_fix_1", "top_fix_2", "top_fix_3", "opener_short", "followup_short"].includes(c.key)),
    {
        key: "pain1_type",
        header: "Pain 1 Type",
        resolve: (l: Lead) => parseJsonSafe(l.painSignals, [])[0]?.type || ""
    },
    {
        key: "pain1_evi",
        header: "Pain 1 Evidence",
        resolve: (l: Lead) => parseJsonSafe(l.painSignals, [])[0]?.evidence || ""
    },
    {
        key: "pain2_type",
        header: "Pain 2 Type",
        resolve: (l: Lead) => parseJsonSafe(l.painSignals, [])[1]?.type || ""
    },
    {
        key: "pain2_evi",
        header: "Pain 2 Evidence",
        resolve: (l: Lead) => parseJsonSafe(l.painSignals, [])[1]?.evidence || ""
    },
    { key: "score_bv", header: "Score Business Value", resolve: (l: Lead) => parseJsonSafe(l.scoreBreakdown, {})?.businessValue ?? "" },
    { key: "score_pain", header: "Score Pain Opportunity", resolve: (l: Lead) => parseJsonSafe(l.scoreBreakdown, {})?.painOpportunity ?? "" },
    { key: "score_reach", header: "Score Reachability", resolve: (l: Lead) => parseJsonSafe(l.scoreBreakdown, {})?.reachability ?? "" },
    { key: "score_local", header: "Score Local Fit", resolve: (l: Lead) => parseJsonSafe(l.scoreBreakdown, {})?.localFit ?? "" },
    { key: "top_fixes", header: "Top Fixes", resolve: (l: Lead) => (parseJsonSafe(l.axiomWebsiteAssessment, {})?.topFixes || []).join("; ") },
    { key: "disqualifiers", header: "Disqualifiers", resolve: (l: Lead) => (parseJsonSafe(l.disqualifiers, []) || []).join("; ") },
    { key: "disqualify_reason", header: "Disqualify Reason", resolve: (l: Lead) => l.disqualifyReason || "" },
    { key: "archived", header: "Archived", resolve: (l: Lead) => l.isArchived ? "Yes" : "No" }
];

export const exportPresets: Record<string, CsvPreset> = {
    call_sheet: { name: "call_sheet", columns: callSheetColumns },
    crm_basic: { name: "crm_basic", columns: crmBasicColumns },
    full: { name: "full", columns: fullColumns }
};
