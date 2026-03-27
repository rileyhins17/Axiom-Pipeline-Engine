import { strict as assert } from "node:assert";
import test from "node:test";

import {
    pickRelevantContactLinks,
    resolvePublicBusinessEmail,
} from "./public-email-intelligence";

test("pickRelevantContactLinks tolerates non-string href values", () => {
    const links = [
        {
            href: new URL("https://example.com/contact"),
            text: "Contact",
        } as unknown as { href: string; text?: string },
        {
            href: new URL("mailto:hello@example.com"),
            text: "Email",
        } as unknown as { href: string; text?: string },
    ];

    const result = pickRelevantContactLinks("https://example.com", links, 4);

    assert.equal(result.length, 1);
    assert.equal(result[0].role, "contact");
    assert.match(result[0].url, /\/contact$/);
});

test("resolvePublicBusinessEmail tolerates non-string href values", () => {
    const result = resolvePublicBusinessEmail({
        businessName: "Acme Landscaping",
        businessWebsite: "https://acme-landscaping.com",
        pages: [
            {
                url: "https://acme-landscaping.com",
                role: "homepage",
                sourceLabel: "Homepage",
                text: "Reach us at hello@acme-landscaping.com",
                links: [
                    {
                        href: new URL("mailto:hello@acme-landscaping.com"),
                        text: "hello@acme-landscaping.com",
                    } as unknown as { href: string; text?: string },
                ],
            },
        ],
    });

    assert.equal(result.email, "hello@acme-landscaping.com");
    assert.equal(result.emailType, "generic");
});
