import type { LeadRecord as Lead } from "../prisma";
import { extractDomain } from "../dedupe";

export interface CsvColumnDef {
    key: string;
    header: string;
    resolve: (lead: Lead) => unknown;
}

export interface CsvPreset {
    name: string;
    columns: CsvColumnDef[];
}

export interface CsvDialectOptions {
    delimiter?: string;
    quote?: "minimal" | "always";
    bom?: boolean;
    eol?: "crlf" | "lf";
    nulls?: "blank" | "na";
    headerStyle?: "pretty" | "snake";
}

export function sortLeadsDeterministic(leads: Lead[]) {
    const tierWeights: Record<string, number> = { "S": 5, "A": 4, "B": 3, "C": 2, "D": 1 };
    return leads.sort((a, b) => {
        const twA = tierWeights[a.axiomTier || ""] || 0;
        const twB = tierWeights[b.axiomTier || ""] || 0;
        if (twA !== twB) return twB - twA; // Descending

        const scoreA = a.axiomScore || 0;
        const scoreB = b.axiomScore || 0;
        if (scoreA !== scoreB) return scoreB - scoreA; // Descending

        const compA = a.businessName || "";
        const compB = b.businessName || "";
        return compA.localeCompare(compB); // Ascending
    });
}

/**
 * Escapes a CSV value correctly based on dialect options.
 */
export function escapeCsv(val: unknown, options?: CsvDialectOptions): string {
    const nulls = options?.nulls || "blank";
    if (val === null || val === undefined || val === "") {
        return nulls === "na" ? "N/A" : "";
    }

    let str = String(val);

    // Normalize whitespace: trim and collapse repeated spaces
    str = str.trim().replace(/ {2,}/g, " ");

    // Replace newlines with a symbol to keep CSV flat
    str = str.replace(/[\r\n]+/g, " ⏎ ");

    const delimiter = options?.delimiter || ",";
    const quotePolicy = options?.quote || "minimal";

    const needsQuotes = quotePolicy === "always" ||
        str.includes(delimiter) ||
        str.includes('"') ||
        str.includes(" ⏎ ");

    if (needsQuotes) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

export function toSnakeCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/(^_|_$)/g, "");
}

/**
 * Normalizes phone numbers to digits only.
 * E.g. "(519) 555-1234" -> "5195551234"
 */
export function formatPhoneDigits(phone: string | null | undefined): string {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    return digits;
}

/**
 * Formats a phone number for export in a spreadsheet-safe, human-readable form.
 * Falls back to the trimmed original value when normalization is not possible.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
    if (!phone) return "";

    const original = phone.trim();
    const digits = original.replace(/\D/g, "");

    if (digits.length === 11 && digits.startsWith("1")) {
        const main = digits.slice(1);
        return `+1 (${main.slice(0, 3)}) ${main.slice(3, 6)}-${main.slice(6)}`;
    }

    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    return original.replace(/ {2,}/g, " ");
}

export function formatWebsiteUrl(value: string | null | undefined): string {
    if (!value) return "";
    const clean = value.trim();
    if (!clean) return "";
    if (/^https?:\/\//i.test(clean)) return clean;
    return `https://${clean.replace(/^\/+/, "")}`;
}

export function formatWebsiteDomain(value: string | null | undefined): string {
    return extractDomain(value) || "";
}

export function formatJsonFlags(value: string | null | undefined): string {
    if (!value) return "";
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return "";
        }
        const flags = parsed.filter(Boolean).map((flag) => String(flag).trim()).filter(Boolean);
        return flags.length > 0 ? flags.join("; ") : "clean";
    } catch {
        return "";
    }
}

function formatContactPart(
    label: string,
    confidence: number | null | undefined,
    flags: string | null | undefined,
): string {
    const confidenceText = confidence !== null && confidence !== undefined ? confidence.toFixed(2) : "n/a";
    const flagText = formatJsonFlags(flags);
    return flagText && flagText !== "clean"
        ? `${label} ${confidenceText} [${flagText}]`
        : `${label} ${confidenceText}`;
}

export function formatContactQuality(lead: Pick<Lead, "emailConfidence" | "emailFlags" | "emailType" | "phoneConfidence" | "phoneFlags"> & { email?: string | null; phone?: string | null }): string {
    const emailLabel = lead.email ? `Email ${lead.emailType || "unknown"}` : "Email none";
    const phoneLabel = lead.phone ? "Phone" : "Phone none";
    const emailPart = formatContactPart(emailLabel, lead.emailConfidence, lead.emailFlags);
    const phonePart = formatContactPart(phoneLabel, lead.phoneConfidence, lead.phoneFlags);
    return `${emailPart} | ${phonePart}`;
}

/**
 * Formats a date to ISO 8601 UTC (YYYY-MM-DD HH:mm).
 */
export function formatDate(date: Date | string | null | undefined): string {
    if (!date) return "";
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 16).replace("T", " ");
    } catch {
        return "";
    }
}

/**
 * Base exporter utility that takes a dataset and a preset definition,
 * and produces a professional, configured CSV.
 */
export function generateCsv(
    leads: Lead[],
    preset: CsvPreset,
    columnsToInclude?: CsvColumnDef[],
    options?: CsvDialectOptions
): string {
    const cols = columnsToInclude || preset.columns;
    const delimiter = options?.delimiter || ",";
    const eol = options?.eol === "lf" ? "\n" : "\r\n";
    const headerStyle = options?.headerStyle || "pretty";
    const useBom = options?.bom !== false; // Default true

    const headers = cols.map(c => {
        const h = headerStyle === "snake" ? toSnakeCase(c.header) : c.header;
        return escapeCsv(h, options);
    }).join(delimiter);

    const rows = leads.map(lead => {
        return cols.map(col => {
            try {
                const val = col.resolve(lead);
                return escapeCsv(val, options);
            } catch {
                return escapeCsv("", options); // Fallback on error to ensure no broken columns
            }
        }).join(delimiter);
    });

    const BOM = "\uFEFF";
    const content = [headers, ...rows].join(eol);
    return useBom ? BOM + content : content;
}

export function truncateString(str: string | null | undefined, maxLen: number): string {
    if (!str) return "";
    const cleanStr = str.trim().replace(/[\r\n]+/g, " | ").replace(/ {2,}/g, " ");
    if (cleanStr.length <= maxLen) return cleanStr;
    return cleanStr.slice(0, maxLen - 1) + "…";
}

type JsonRecord = Record<string, unknown>;

function parseJsonSafe<T>(jsonStr: string | null, fallback: T): T {
    if (!jsonStr) return fallback;
    try {
        return JSON.parse(jsonStr) as T;
    } catch {
        return fallback;
    }
}

export function buildPainSummary(lead: Lead): string {
    const pains = parseJsonSafe<JsonRecord[]>(lead.painSignals, []);
    const isMissingWebsite = lead.websiteStatus === "MISSING";
    const reviews = lead.reviewCount || 0;

    if (!Array.isArray(pains) || pains.length === 0) {
        if (isMissingWebsite) {
            return "No website found — customers can’t easily verify or contact you online.";
        }
        return "No structured issues captured — run a fresh extraction for deeper site signals.";
    }

    const typePriority: Record<string, number> = {
        "NO_WEBSITE": 1,
        "CONVERSION": 2,
        "SPEED": 3,
        "TRUST": 4,
        "SEO": 5,
        "TRACKING": 6
    };

    let topPain = pains[0];
    let bestPriority = 999;

    for (const p of pains) {
        const pType = String(p.type || "").toUpperCase();
        let currentPriority = 999;

        for (const [key, val] of Object.entries(typePriority)) {
            if (pType.includes(key) || pType === key) {
                currentPriority = val;
                break;
            }
        }

        if (currentPriority < bestPriority) {
            bestPriority = currentPriority;
            topPain = p;
        }
    }

    let summary = "";

    if (isMissingWebsite || bestPriority === 1) {
        if (reviews >= 20) {
            summary = "Strong reviews but no website — you’re invisible in organic search beyond Maps.";
        } else {
            summary = "No website found — customers can’t easily verify or contact you online.";
        }
    } else if (bestPriority === 2) {
        summary = "Website lacks a clear booking/quote path — visitors have no fast next step.";
    } else if (bestPriority === 3) {
        summary = "Mobile load appears heavy — slower pages typically lose ready-to-buy visitors.";
    } else if (bestPriority === 4) {
        summary = "Trust gaps detected (SSL/outdated pages) — can reduce conversions.";
    } else if (bestPriority === 5) {
        summary = "Local SEO signals look weak — harder to rank outside Maps.";
    } else if (bestPriority === 6) {
        summary = "No tracking detected — lead flow is hard to measure and improve.";
    } else {
        const types = pains.map(p => p.type).filter(Boolean).join(", ");
        summary = `Detected ${pains.length} pain points including: ${types}.`;
    }

    return truncateString(summary, 140);
}

export function formatPainReadable(painSignalsString: string | null): string[] {
    const pains = parseJsonSafe<JsonRecord[]>(painSignalsString, []);
    if (!Array.isArray(pains) || pains.length === 0) return [];

    const typePriority: Record<string, number> = {
        "NO_WEBSITE": 1,
        "CONVERSION": 2,
        "SPEED": 3,
        "TRUST": 4,
        "SEO": 5,
        "TRACKING": 6
    };

    const evidencePriority: Record<string, number> = {
        "measured": 1,
        "observed": 2,
        "inferred": 3
    };

    const sortedPains = [...pains].sort((a, b) => {
        const sevAStr = String(a.severity || "").toLowerCase();
        const sevBStr = String(b.severity || "").toLowerCase();

        const sevMap: Record<string, number> = { "critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1 };

        let sevA = parseInt(sevAStr);
        if (isNaN(sevA)) sevA = sevMap[sevAStr] || 0;

        let sevB = parseInt(sevBStr);
        if (isNaN(sevB)) sevB = sevMap[sevBStr] || 0;

        if (sevA !== sevB) return sevB - sevA; // desc

        const pTypeA = String(a.type || "").toUpperCase();
        let prioA = 999;
        for (const [key, val] of Object.entries(typePriority)) {
            if (pTypeA.includes(key)) prioA = val;
        }

        const pTypeB = String(b.type || "").toUpperCase();
        let prioB = 999;
        for (const [key, val] of Object.entries(typePriority)) {
            if (pTypeB.includes(key)) prioB = val;
        }

        if (prioA !== prioB) return prioA - prioB; // asc

        const evTypeA = String(a.evidenceType || "").toLowerCase();
        const evTypeB = String(b.evidenceType || "").toLowerCase();
        const evPrioA = evidencePriority[evTypeA] || 99;
        const evPrioB = evidencePriority[evTypeB] || 99;

        return evPrioA - evPrioB; // asc
    });

    return sortedPains.slice(0, 3).map(p => {
        const t = p.type || "UNKNOWN";
        const s = p.severity || "0";
        const ev = String(p.evidence || "");
        const cleanEv = ev.trim().replace(/[\r\n\t]+/g, " | ").replace(/ {2,}/g, " ");

        return truncateString(`${t} s${s}: ${cleanEv}`, 120);
    });
}
