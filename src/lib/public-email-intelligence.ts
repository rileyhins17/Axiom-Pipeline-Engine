import { validateEmail, type ContactValidation } from "@/lib/contact-validation";

export type EmailPageRole =
    | "homepage"
    | "contact"
    | "about"
    | "team"
    | "legal"
    | "directory"
    | "search"
    | "other";

export interface ResolvedLink {
    href: string;
    text?: string;
}

export interface EmailDiscoveryPage {
    url: string | null;
    role: EmailPageRole;
    sourceLabel: string;
    text: string;
    links: ResolvedLink[];
}

export interface PublicEmailCandidate {
    email: string;
    score: number;
    type: ContactValidation["emailType"];
    confidence: number;
    flags: string[];
    occurrences: Array<{
        pageRole: EmailPageRole;
        sourceLabel: string;
        sourceUrl: string | null;
        via: "text" | "mailto";
        snippet: string;
    }>;
}

export interface PublicEmailResolution {
    email: string;
    confidence: number;
    emailType: ContactValidation["emailType"];
    reason: string;
    candidates: PublicEmailCandidate[];
}

const CONTACT_PAGE_PATTERNS = [
    "contact",
    "contact-us",
    "get-in-touch",
    "reach-us",
    "book",
    "booking",
    "appointment",
    "quote",
    "request-a-quote",
];

const ABOUT_PAGE_PATTERNS = [
    "about",
    "our-story",
    "company",
    "who-we-are",
    "about-us",
];

const TEAM_PAGE_PATTERNS = [
    "team",
    "staff",
    "people",
    "leadership",
    "lawyers",
    "doctors",
    "our-team",
];

const LEGAL_PAGE_PATTERNS = [
    "privacy",
    "terms",
    "legal",
    "imprint",
    "accessibility",
];

const BLOCKED_EMAIL_DOMAINS = new Set([
    "example.com",
    "example.org",
    "example.net",
    "sentry.io",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "gstatic.com",
    "google.com",
    "googleusercontent.com",
]);

const OWNER_CONTEXT_HINTS = [
    "owner",
    "founder",
    "president",
    "ceo",
    "director",
    "principal",
    "broker",
    "doctor",
    "dr.",
];

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function tokenizeName(value: string | null | undefined): string[] {
    return (value || "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((token) => token.length >= 2);
}

function tokenizeBusinessName(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
        .filter((token) => !["inc", "ltd", "llc", "corp", "co", "the"].includes(token));
}

function canonicalizeWebsiteHost(website: string | null | undefined): string | null {
    if (!website) return null;
    try {
        const url = new URL(website.startsWith("http") ? website : `https://${website}`);
        return url.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }
}

function extractRootDomain(hostname: string | null): string | null {
    if (!hostname) return null;
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
}

function canonicalizeEmail(raw: string): string {
    return raw
        .trim()
        .replace(/^mailto:/i, "")
        .replace(/[)>.,;:]+$/g, "")
        .split("?")[0]
        .toLowerCase();
}

function normalizeHrefValue(href: unknown): string {
    if (typeof href === "string") {
        return href.trim();
    }

    if (href == null) {
        return "";
    }

    try {
        return String(href).trim();
    } catch {
        return "";
    }
}

function normalizeObfuscatedEmails(text: string): string {
    return text
        .replace(/\[at\]|\(at\)|\{at\}/gi, "@")
        .replace(/\[dot\]|\(dot\)|\{dot\}/gi, ".")
        .replace(/([a-z0-9._%+-])\s+at\s+([a-z0-9.-])/gi, "$1@$2")
        .replace(/([a-z0-9.-])\s+dot\s+([a-z]{2,})/gi, "$1.$2");
}

function extractEmailsFromText(text: string): string[] {
    const normalized = normalizeObfuscatedEmails(text);
    const matches = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    return Array.from(new Set(matches.map(canonicalizeEmail)));
}

function extractEmailsFromHref(href: unknown): string[] {
    const normalizedHref = normalizeHrefValue(href);
    if (!normalizedHref) return [];
    if (normalizedHref.startsWith("mailto:")) {
        return [canonicalizeEmail(normalizedHref)];
    }

    const decoded = decodeURIComponent(normalizedHref);
    return extractEmailsFromText(decoded);
}

function buildSnippet(text: string, email: string): string {
    if (!text) return "";
    const normalized = normalizeObfuscatedEmails(text).toLowerCase();
    const idx = normalized.indexOf(email.toLowerCase());
    if (idx === -1) return normalizeWhitespace(text).slice(0, 160);
    const start = Math.max(0, idx - 70);
    const end = Math.min(text.length, idx + email.length + 70);
    return normalizeWhitespace(text.slice(start, end));
}

function domainMatchesWebsite(email: string, website: string | null | undefined): boolean {
    const businessHost = canonicalizeWebsiteHost(website);
    const businessRoot = extractRootDomain(businessHost);
    const emailDomain = email.split("@")[1]?.toLowerCase() || "";
    const emailRoot = extractRootDomain(emailDomain);
    if (!businessRoot || !emailRoot) return false;
    return emailRoot === businessRoot;
}

function classifyPageRoleFromUrl(href: string, linkText?: string): EmailPageRole {
    const text = `${href} ${linkText || ""}`.toLowerCase();
    if (CONTACT_PAGE_PATTERNS.some((token) => text.includes(token))) return "contact";
    if (ABOUT_PAGE_PATTERNS.some((token) => text.includes(token))) return "about";
    if (TEAM_PAGE_PATTERNS.some((token) => text.includes(token))) return "team";
    if (LEGAL_PAGE_PATTERNS.some((token) => text.includes(token))) return "legal";
    return "other";
}

function scoreOccurrenceRole(role: EmailPageRole): number {
    switch (role) {
        case "contact":
            return 18;
        case "team":
            return 15;
        case "about":
            return 12;
        case "homepage":
            return 8;
        case "search":
            return 4;
        case "legal":
            return 3;
        default:
            return 6;
    }
}

function scoreContextSnippet(snippet: string, ownerTokens: string[], businessTokens: string[]): number {
    const lower = snippet.toLowerCase();
    let score = 0;

    if (OWNER_CONTEXT_HINTS.some((token) => lower.includes(token))) score += 10;
    if (lower.includes("email us") || lower.includes("reach us") || lower.includes("contact us")) score += 4;
    if (ownerTokens.some((token) => lower.includes(token))) score += 8;
    if (businessTokens.some((token) => lower.includes(token))) score += 6;

    return score;
}

function isBlockedCandidate(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return true;
    return BLOCKED_EMAIL_DOMAINS.has(domain);
}

function dedupeLinks(links: ResolvedLink[]): ResolvedLink[] {
    const seen = new Set<string>();
    const deduped: ResolvedLink[] = [];

    for (const link of links) {
        const key = `${normalizeHrefValue(link.href)}|${link.text || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ ...link, href: normalizeHrefValue(link.href) });
    }

    return deduped;
}

export function pickRelevantContactLinks(
    website: string,
    links: ResolvedLink[],
    maxLinks = 4,
): Array<{ url: string; role: EmailPageRole; label: string }> {
    const host = canonicalizeWebsiteHost(website);
    if (!host) return [];

    const scored = (dedupeLinks(links)
        .map((link) => {
            try {
                const href = normalizeHrefValue(link.href);
                if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
                    return null;
                }

                const resolved = new URL(href, website);
                const resolvedHost = resolved.hostname.replace(/^www\./, "").toLowerCase();
                if (resolvedHost !== host) return null;

                const role = classifyPageRoleFromUrl(resolved.pathname, link.text);
                if (role === "other") return null;

                return {
                    url: resolved.toString(),
                    role,
                    label: link.text?.trim() || resolved.pathname,
                    score: scoreOccurrenceRole(role),
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean) as Array<{ url: string; role: Exclude<EmailPageRole, "other">; label: string; score: number }>)
        .sort((a, b) => b.score - a.score);

    const uniqueUrls = new Set<string>();
    const selected: Array<{ url: string; role: EmailPageRole; label: string }> = [];

    for (const item of scored) {
        if (uniqueUrls.has(item.url)) continue;
        uniqueUrls.add(item.url);
        selected.push({ url: item.url, role: item.role, label: item.label });
        if (selected.length >= maxLinks) break;
    }

    return selected;
}

function collectOccurrences(pages: EmailDiscoveryPage[]): Map<string, PublicEmailCandidate["occurrences"]> {
    const byEmail = new Map<string, PublicEmailCandidate["occurrences"]>();

    for (const page of pages) {
        const textEmails = extractEmailsFromText(page.text);
        for (const email of textEmails) {
            if (isBlockedCandidate(email)) continue;
            const occurrences = byEmail.get(email) || [];
            occurrences.push({
                pageRole: page.role,
                sourceLabel: page.sourceLabel,
                sourceUrl: page.url,
                via: "text",
                snippet: buildSnippet(page.text, email),
            });
            byEmail.set(email, occurrences);
        }

        for (const link of page.links) {
            const href = normalizeHrefValue(link.href);
            for (const email of extractEmailsFromHref(href)) {
                if (isBlockedCandidate(email)) continue;
                const occurrences = byEmail.get(email) || [];
                occurrences.push({
                    pageRole: page.role,
                    sourceLabel: page.sourceLabel,
                    sourceUrl: page.url,
                    via: href.startsWith("mailto:") ? "mailto" : "text",
                    snippet: normalizeWhitespace(link.text || buildSnippet(page.text, email)),
                });
                byEmail.set(email, occurrences);
            }
        }
    }

    return byEmail;
}

export function formatEmailCandidatesForPrompt(candidates: PublicEmailCandidate[], limit = 8): string {
    if (candidates.length === 0) {
        return "No vetted public email candidates were found.";
    }

    return candidates
        .slice(0, limit)
        .map((candidate, index) => {
            const topOccurrence = candidate.occurrences[0];
            return `${index + 1}. ${candidate.email} | type=${candidate.type} | confidence=${candidate.confidence.toFixed(2)} | score=${candidate.score} | source=${topOccurrence?.sourceLabel || "unknown"} | via=${topOccurrence?.via || "text"} | flags=${candidate.flags.join(",") || "none"}`;
        })
        .join("\n");
}

export function resolvePublicBusinessEmail(input: {
    businessName: string;
    businessWebsite?: string | null;
    ownerName?: string | null;
    pages: EmailDiscoveryPage[];
    aiPreferredEmail?: string | null;
}): PublicEmailResolution {
    const ownerTokens = tokenizeName(input.ownerName);
    const businessTokens = tokenizeBusinessName(input.businessName);
    const occurrencesByEmail = collectOccurrences(input.pages);
    const candidates: PublicEmailCandidate[] = [];

    for (const [email, occurrences] of occurrencesByEmail.entries()) {
        const validation = validateEmail(email, {
            ownerName: input.ownerName,
            businessWebsite: input.businessWebsite,
        });

        if (validation.confidence <= 0.1) continue;

        let score = Math.round(validation.confidence * 100);
        score += validation.type === "owner" ? 18 : validation.type === "staff" ? 10 : validation.type === "generic" ? 2 : 0;

        if (domainMatchesWebsite(email, input.businessWebsite)) {
            score += 16;
        } else if (input.businessWebsite && !validation.flags.includes("free_provider")) {
            score -= 16;
        }

        const localPart = email.split("@")[0] || "";
        if (ownerTokens.some((token) => localPart.includes(token))) {
            score += 14;
        }
        if (businessTokens.some((token) => localPart.includes(token) || email.includes(`${token}.`))) {
            score += 8;
        }

        if (/\d{4,}/.test(localPart)) {
            score -= 8;
        }

        if (validation.flags.includes("generic_prefix")) {
            score -= 8;
        }

        if (validation.flags.includes("free_provider")) {
            score -= 4;
        }

        if (input.aiPreferredEmail && canonicalizeEmail(input.aiPreferredEmail) === email) {
            score += 10;
        }

        const seenSourceLabels = new Set<string>();
        let searchOnly = true;
        let hasBusinessContext = false;
        for (const occurrence of occurrences) {
            score += scoreOccurrenceRole(occurrence.pageRole);
            if (occurrence.via === "mailto") score += 12;
            score += scoreContextSnippet(occurrence.snippet, ownerTokens, businessTokens);
            if (businessTokens.some((token) => occurrence.snippet.toLowerCase().includes(token))) {
                hasBusinessContext = true;
            }
            if (occurrence.pageRole !== "search") {
                searchOnly = false;
            }

            if (!seenSourceLabels.has(occurrence.sourceLabel)) {
                seenSourceLabels.add(occurrence.sourceLabel);
            }
        }

        score += Math.min((seenSourceLabels.size - 1) * 8, 16);
        if (searchOnly && !hasBusinessContext) {
            score -= 20;
        }

        candidates.push({
            email,
            score,
            type: validation.type,
            confidence: Math.max(0, Math.min(1, score / 120)),
            flags: validation.flags,
            occurrences: occurrences.sort((a, b) => {
                const roleDiff = scoreOccurrenceRole(b.pageRole) - scoreOccurrenceRole(a.pageRole);
                if (roleDiff !== 0) return roleDiff;
                if (a.via === b.via) return 0;
                return a.via === "mailto" ? -1 : 1;
            }),
        });
    }

    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.confidence - a.confidence;
    });

    const winner = candidates[0];

    return {
        email: winner?.email || "",
        confidence: winner?.confidence || 0,
        emailType: winner?.type || "unknown",
        reason: winner
            ? `${winner.type} email chosen from ${winner.occurrences[0]?.sourceLabel || "public source"}`
            : "No vetted public email found",
        candidates,
    };
}
