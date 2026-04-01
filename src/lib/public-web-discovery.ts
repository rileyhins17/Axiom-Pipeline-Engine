import {
    pickRelevantContactLinks,
    type EmailDiscoveryPage,
    type ResolvedLink,
} from "@/lib/public-email-intelligence";
import type { AutomationBrowserContext, AutomationPage } from "@/lib/browser-rendering";
import type { ScrapeJobEventPayload } from "@/lib/scrape-jobs";

type PageSnapshot = {
    text: string;
    links: ResolvedLink[];
};

async function capturePageSnapshot(page: AutomationPage): Promise<PageSnapshot> {
    return page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"))
            .map((anchor) => {
                const element = anchor as HTMLAnchorElement;
                return {
                    href: element.href || element.getAttribute("href") || "",
                    text: (element.textContent || "").trim().slice(0, 160),
                };
            })
            .filter((link) => link.href);

        return {
            text: document.body?.innerText || "",
            links,
        };
    });
}

function buildDiscoverySection(label: string, snapshot: PageSnapshot): string {
    const trimmedText = snapshot.text.slice(0, 5000);
    const trimmedLinks = snapshot.links
        .map((link) => link.href)
        .filter(Boolean)
        .slice(0, 40)
        .join("\n");

    return `[${label.toUpperCase()}]\n${trimmedText}\n\nLINKS:\n${trimmedLinks}`;
}

export async function collectWebsiteDiscoveryPages(
    context: AutomationBrowserContext,
    website: string,
    sendEvent: (data: ScrapeJobEventPayload) => Promise<void> | void,
): Promise<{ rawFootprint: string; pages: EmailDiscoveryPage[] }> {
    const pages: EmailDiscoveryPage[] = [];
    const sections: string[] = [];
    const homepage = await context.newPage();

    try {
        await homepage.goto(website, { waitUntil: "domcontentloaded", timeout: 15000 });
        const homepageSnapshot = await capturePageSnapshot(homepage);

        pages.push({
            url: website,
            role: "homepage",
            sourceLabel: "Homepage",
            text: homepageSnapshot.text,
            links: homepageSnapshot.links,
        });
        sections.push(buildDiscoverySection("Homepage", homepageSnapshot));

        const contactLinks = pickRelevantContactLinks(website, homepageSnapshot.links, 4);
        for (const link of contactLinks) {
            const subPage = await context.newPage();
            try {
                await sendEvent({ message: `[EMAIL] Scanning ${link.role} page: ${link.url}` });
                await subPage.goto(link.url, { waitUntil: "domcontentloaded", timeout: 12000 });
                const snapshot = await capturePageSnapshot(subPage);
                pages.push({
                    url: link.url,
                    role: link.role,
                    sourceLabel: link.label || link.role,
                    text: snapshot.text,
                    links: snapshot.links,
                });
                sections.push(buildDiscoverySection(link.label || link.role, snapshot));
            } catch {
                // Ignore secondary page failures and keep the run moving.
            } finally {
                await subPage.close();
            }
        }
    } finally {
        await homepage.close();
    }

    return {
        rawFootprint: sections.join("\n\n"),
        pages,
    };
}

export async function collectSearchDiscoveryPage(
    context: AutomationBrowserContext,
    query: string,
): Promise<{ rawFootprint: string; pages: EmailDiscoveryPage[] }> {
    const searchPage = await context.newPage();

    try {
        await searchPage.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
        });

        try {
            await searchPage.waitForSelector("#search", { timeout: 8000 });
        } catch {
            await searchPage.waitForSelector("body", { timeout: 8000 });
        }

        const snapshot = await capturePageSnapshot(searchPage);
        return {
            rawFootprint: buildDiscoverySection("Search results", snapshot),
            pages: [{
                url: searchPage.url(),
                role: "search",
                sourceLabel: "Search results",
                text: snapshot.text,
                links: snapshot.links,
            }],
        };
    } finally {
        await searchPage.close();
    }
}

export function pickBestSocialLink(pages: EmailDiscoveryPage[]): string {
    const preferredHosts = ["linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com"];
    const candidates = pages
        .flatMap((page) => page.links)
        .map((link) => link.href)
        .filter(Boolean);

    for (const host of preferredHosts) {
        const match = candidates.find((href) => href.includes(host));
        if (match) return match;
    }

    return "";
}
