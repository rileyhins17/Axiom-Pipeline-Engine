import type { LeadRecord as Lead } from "../prisma";
import { strict as assert } from "node:assert";
import test from "node:test";
import { escapeCsv, formatJsonFlags, formatPhoneDisplay, generateCsv, sortLeadsDeterministic } from "./csv";
import { exportPresets } from "./export-presets";

test("CSV Exporter Tests", async (t) => {
    await t.test("verify header order EXACTLY for call_sheet preset", () => {
        const preset = exportPresets.call_sheet;
        const expectedHeaders = [
            "Tier", "Axiom Score", "Company", "Niche", "Category", "City", "Contact Name", "Phone", "Email",
            "Contact Quality", "Email Type", "Email Confidence", "Email Flags", "Phone Confidence", "Phone Flags",
            "Website Status", "Website URL", "Website Domain", "Social Link", "Pain Summary", "Pain 1", "Pain 2",
            "Pain 3", "Call Opener (Short)", "Follow-Up (Short)", "Website Grade", "Disqualify Reason",
            "Disqualifiers", "Top Fix 1", "Top Fix 2", "Top Fix 3", "Call Opener (Full)", "Follow-Up (Full)",
            "Source", "Last Updated", "Lead ID"
        ];

        assert.deepEqual(
            preset.columns.map(c => c.header),
            expectedHeaders,
            "call_sheet headers do not match expected exact order"
        );
    });

    await t.test("verify quoting works for commas/quotes/newlines", () => {
        assert.equal(escapeCsv("regular text"), "regular text");
        assert.equal(escapeCsv("hello, world"), '"hello, world"');
        assert.equal(escapeCsv("he said \"hello\""), '"he said ""hello"""');
        assert.equal(escapeCsv("line1\nline2"), '"line1 ⏎ line2"', "Newlines should be replaced to keep CSV flat and quoted if the replacement symbol triggers it.");
        assert.equal(escapeCsv("  spaced   out  "), "spaced out", "Whitespace should be normalized");
    });

    await t.test("verify BOM exists and CRLF line endings in generated CSV", () => {
        const leads = [] as Lead[];
        const preset = exportPresets.crm_basic;
        const csv = generateCsv(leads, preset);

        assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");

        const leads2 = [{ id: 1, businessName: "Test" } as Lead];
        const csv2 = generateCsv(leads2, preset);
        assert.ok(csv2.includes("\r\n"), "CSV must use CRLF line endings");
    });

    await t.test("verify deterministic sorting for a small fixture dataset", () => {
        const fixture = [
            { id: 1, axiomTier: "B", axiomScore: 80, businessName: "Zeta Corp" },
            { id: 2, axiomTier: "S", axiomScore: 90, businessName: "Alpha Inc" },
            { id: 3, axiomTier: "S", axiomScore: 90, businessName: "Beta LLC" },
            { id: 4, axiomTier: "S", axiomScore: 95, businessName: "Gamma Co" },
            { id: 5, axiomTier: "C", axiomScore: 60, businessName: "Delta Ltd" },
        ] as Lead[];

        sortLeadsDeterministic(fixture);

        assert.equal(fixture[0].id, 4);
        assert.equal(fixture[1].id, 2);
        assert.equal(fixture[2].id, 3);
        assert.equal(fixture[3].id, 1);
        assert.equal(fixture[4].id, 5);
    });
});

import { buildPainSummary, formatPainReadable, truncateString } from "./csv";

test("CSV Exporter Formatting Tests", async (t) => {
    await t.test("Pain Summary Generator priority and missing website defaults", () => {
        // NO_WEBSITE > CONVERSION
        const lead1 = {
            websiteStatus: "MISSING",
            reviewCount: 25,
            painSignals: JSON.stringify([
                { type: "CONVERSION", severity: 5 },
                { type: "NO_WEBSITE", severity: 5 }
            ])
        } as Lead;
        assert.equal(buildPainSummary(lead1), "Strong reviews but no website — you’re invisible in organic search beyond Maps.");

        // Only missing painSignals
        const lead2 = {
            websiteStatus: "MISSING",
            painSignals: null
        } as Lead;
        assert.equal(buildPainSummary(lead2), "No website found — customers can’t easily verify or contact you online.");

        // Speed pains
        const lead3 = {
            painSignals: JSON.stringify([{ type: "SPEED", severity: 4 }])
        } as Lead;
        assert.equal(buildPainSummary(lead3), "Mobile load appears heavy — slower pages typically lose ready-to-buy visitors.");
    });

    await t.test("Pain 1-3 selection ordering works", () => {
        const painsStr = JSON.stringify([
            { type: "SEO", severity: 5, evidence: "low seo", evidenceType: "measured" },
            { type: "SPEED", severity: 2, evidence: "slow", evidenceType: "measured" },
            { type: "CONVERSION", severity: 5, evidence: "bad convert", evidenceType: "observed" }
        ]);
        const formatted = formatPainReadable(painsStr);

        // Expected order:
        // 1. Severity 5 + CONVERSION (priority 2) -> CONVERSION s5: bad convert
        // 2. Severity 5 + SEO (priority 5) -> SEO s5: low seo
        // 3. Severity 2 + SPEED (priority 3) -> SPEED s2: slow

        assert.equal(formatted.length, 3);
        assert.equal(formatted[0], "CONVERSION s5: bad convert");
        assert.equal(formatted[1], "SEO s5: low seo");
        assert.equal(formatted[2], "SPEED s2: slow");
    });

    await t.test("Short truncation works", () => {
        assert.equal(truncateString(null, 10), "");
        const longStr = "A".repeat(10);
        assert.equal(truncateString(longStr, 10), "AAAAAAAAAA");
        assert.equal(truncateString(longStr + "A", 10), "AAAAAAAAA…");
        assert.equal(truncateString("Newline \n here", 100), "Newline | here");
    });

    await t.test("Contact Quality checks", () => {
        const preset = exportPresets.call_sheet;
        const cqCol = preset.columns.find(c => c.header === "Contact Quality");
        assert.ok(cqCol);

        const l1 = { email: "a@b.com", emailConfidence: 0.8, emailType: "owner", phone: "123", phoneConfidence: 0.9 } as Lead;
        assert.equal(cqCol.resolve(l1), "Email owner 0.80 | Phone 0.90");

        const l2 = { email: null, phone: null } as Lead;
        assert.equal(cqCol.resolve(l2), "Email none n/a | Phone none n/a");
    });

    await t.test("Phone display and flag formatting are spreadsheet-safe", () => {
        assert.equal(formatPhoneDisplay("12266471538"), "+1 (226) 647-1538");
        assert.equal(formatPhoneDisplay("(519) 555-1234"), "(519) 555-1234");
        assert.equal(formatJsonFlags(JSON.stringify(["free_provider", "personal_inbox"])), "free_provider; personal_inbox");
        assert.equal(formatJsonFlags(JSON.stringify([])), "clean");
    });
});

test("CSV Dialect and Column Control Tests", async (t) => {
    const fixtureLeads = [
        {
            id: 1,
            businessName: "Alpha; Beta, & Co.",
            niche: 'Digital "Marketing"',
            city: "New York\nCity"
        } as Lead
    ];

    const simplePreset: import("./csv").CsvPreset = {
        name: "test_preset",
        columns: [
            { key: "id", header: "Lead ID", resolve: l => l.id },
            { key: "company", header: "Company Name", resolve: l => l.businessName },
            { key: "niche", header: "Niche", resolve: l => l.niche },
            { key: "city", header: "City Area", resolve: l => l.city }
        ]
    };

    await t.test("delimiter=semicolon uses ';' and quotes fields containing ';'", () => {
        const res = generateCsv(fixtureLeads, simplePreset, undefined, { delimiter: ";", bom: false });
        const lines = res.split("\r\n");
        assert.equal(lines[0], "Lead ID;Company Name;Niche;City Area");
        assert.equal(lines[1], '1;"Alpha; Beta, & Co.";"Digital ""Marketing""";"New York ⏎ City"');
    });

    await t.test("delimiter=tab outputs TSV", () => {
        const res = generateCsv(fixtureLeads, simplePreset, undefined, { delimiter: "\t", bom: false });
        const lines = res.split("\r\n");
        assert.equal(lines[0], "Lead ID\tCompany Name\tNiche\tCity Area");
    });

    await t.test("quote=always wraps every field in quotes", () => {
        const res = generateCsv(fixtureLeads, simplePreset, undefined, { quote: "always", bom: false });
        const lines = res.split("\r\n");
        assert.equal(lines[0], '"Lead ID","Company Name","Niche","City Area"');
        assert.equal(lines[1], '"1","Alpha; Beta, & Co.","Digital ""Marketing""","New York ⏎ City"');
    });

    await t.test("columns=... exact column order", () => {
        const cols = [simplePreset.columns[3], simplePreset.columns[1]]; // City, Company
        const res = generateCsv([], simplePreset, cols, { bom: false });
        assert.ok(res.startsWith("City Area,Company Name"));
    });

    await t.test("header=snake converts headers deterministically", () => {
        const res = generateCsv([], simplePreset, undefined, { headerStyle: "snake", bom: false });
        assert.ok(res.startsWith("lead_id,company_name,niche,city_area"));
    });
});

