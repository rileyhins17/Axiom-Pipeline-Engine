/**
 * Deterministic Deduplication Engine
 *
 * Multi-signal deduplication using normalized name, domain, phone, and address.
 * Priority: phone > domain > address > name+city (last resort)
 */

import { createHash } from "node:crypto";

/**
 * Normalize a business name for comparison.
 * Strips common suffixes, punctuation, whitespace, and lowercases.
 */
export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        // Remove common business suffixes
        .replace(/\b(inc|ltd|llc|corp|co|company|group|services|service|enterprise|enterprises)\b\.?/gi, "")
        // Remove punctuation
        .replace(/[''"".,\-&!@#$%^*()_+=\[\]{}|\\/<>:;?~`]/g, "")
        // Collapse whitespace
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Extract domain from a URL.
 */
export function extractDomain(url: string | null | undefined): string | null {
    if (!url || url.trim().length === 0) return null;
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return u.hostname.replace("www.", "").toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Normalize phone to digits only (remove country code 1).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (!phone || phone.trim().length === 0) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.substring(1);
    if (digits.length === 10) return digits;
    return null;
}

/**
 * Normalize address for comparison (lowercase, strip unit/suite, collapse whitespace).
 */
export function normalizeAddress(address: string | null | undefined): string | null {
    if (!address || address.trim().length === 0) return null;
    return address
        .toLowerCase()
        .replace(/\b(unit|suite|ste|apt|#)\s*\S+/gi, "")
        .replace(/[.,#]/g, "")
        .replace(/\s+/g, " ")
        .trim() || null;
}

/**
 * Generate a deterministic dedupe key from multiple signals.
 * Returns { key, matchedBy } where matchedBy indicates which signal was primary.
 */
export function generateDedupeKey(
    businessName: string,
    city: string,
    phone?: string | null,
    website?: string | null,
    address?: string | null,
): { key: string; matchedBy: string } {
    const shortHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
    const normName = normalizeName(businessName);
    const normCity = city.toLowerCase().trim();
    const normPhone = normalizePhone(phone);
    const domain = extractDomain(website);
    const normAddr = normalizeAddress(address);

    // Priority 1: Phone (most reliable unique identifier)
    if (normPhone) {
        return { key: `phone:${shortHash(normPhone)}`, matchedBy: "phone" };
    }

    // Priority 2: Domain (unique per business)
    if (domain && !["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "yelp.com", "google.com", "yellowpages.ca"].includes(domain)) {
        return { key: `domain:${shortHash(domain)}`, matchedBy: "domain" };
    }

    // Priority 3: Address (strong signal if available)
    if (normAddr && normAddr.length > 5) {
        return { key: `addr:${shortHash(`${normAddr}|${normCity}`)}`, matchedBy: "address" };
    }

    // Priority 4: Name + City (last resort)
    return { key: `name:${shortHash(`${normName}|${normCity}`)}`, matchedBy: "name_city" };
}

/**
 * Check if a new lead is a duplicate of any existing lead in a batch.
 * Returns the matched existing dedupe key or null.
 */
export function findDuplicateInBatch(
    newKey: string,
    existingKeys: Set<string>,
): boolean {
    return existingKeys.has(newKey);
}
