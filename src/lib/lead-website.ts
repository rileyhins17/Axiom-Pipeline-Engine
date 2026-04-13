export function normalizeWebsiteUrl(value: string | null | undefined): string | null {
    if (!value) return null;

    const clean = value.trim();
    if (!clean) return null;

    try {
        const url = new URL(clean.startsWith("http://") || clean.startsWith("https://") ? clean : `https://${clean.replace(/^\/+/, "")}`);
        return url.toString();
    } catch {
        return null;
    }
}

export function resolveLeadWebsiteUrl(source: unknown): string | null {
    if (!source || typeof source !== "object") return null;

    const record = source as {
        websiteUrl?: string | null;
        websiteDomain?: string | null;
        website?: string | null;
    };

    return normalizeWebsiteUrl(record.websiteUrl || record.websiteDomain || record.website);
}
