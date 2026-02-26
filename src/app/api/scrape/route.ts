import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const niche = searchParams.get("niche");
    const city = searchParams.get("city");
    const radius = searchParams.get("radius") || "10";
    const maxDepth = parseInt(searchParams.get("maxDepth") || "5", 10);

    let browser: import("playwright").Browser | null = null;

    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (data: any) => {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                if (!niche || !city) {
                    throw new Error("Missing niche or city text");
                }

                const csvPath = `C:\\Users\\riley\\.gemini\\antigravity\\scratch\\Lead_Database_No_Site.csv`;
                const csvHeaders = [
                    { id: "Business_Name", title: "Business_Name" },
                    { id: "Niche", title: "Niche" },
                    { id: "City", title: "City" },
                    { id: "Category", title: "Category" },
                    { id: "Address", title: "Address" },
                    { id: "Phone", title: "Phone" },
                    { id: "Email", title: "Email" },
                    { id: "Owner_Name", title: "Owner_Name" },
                    { id: "Social_Link", title: "Social_Link" },
                    { id: "Review_Count", title: "Review_Count" },
                    { id: "Rating", title: "Rating" },
                    { id: "Target_Note", title: "Target_Note" }
                ];

                const fileExists = fs.existsSync(csvPath);
                const csvWriter = createObjectCsvWriter({
                    path: csvPath,
                    header: csvHeaders,
                    append: fileExists
                });

                browser = await chromium.launch({ headless: true });
                const context = await browser.newContext({ locale: "en-CA" });
                const page = await context.newPage();

                sendEvent({ message: `[🚀] Starting ENGINE V2 Scrape: ${niche} in ${city} (Radius: ${radius}km)` });

                // 1. Navigate to Google Maps
                const query = `${niche} in ${city}, Ontario`; // Radius logic relies on the viewport bounds we can't perfectly control via URL usually, but we inject it to the AI context.
                await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`);

                try {
                    await page.waitForSelector("div[role='feed']", { timeout: 15000 });
                } catch (e) {
                    throw new Error("Maps results timed out. No targets found.");
                }

                sendEvent({ message: `[🌐] Injecting infinite scroll bypass...` });

                // Infinite Scroll Bypass - Capture them all
                let lastHeight = 0;
                let scrollAttempts = 0;
                while (scrollAttempts < maxDepth) { // Dynamic depth
                    const newHeight = await page.evaluate(() => {
                        const feed = document.querySelector('div[role="feed"]');
                        if (feed) {
                            feed.scrollBy(0, 5000);
                            return feed.scrollHeight;
                        }
                        return 0;
                    });
                    if (newHeight === lastHeight) break; // Reached bottom
                    lastHeight = newHeight;
                    scrollAttempts++;
                    await page.waitForTimeout(1500);
                    sendEvent({ message: `[⬇️] Diving deeper... (Depth: ${scrollAttempts})` });
                }

                const htmlListings = await page.locator("div[role='feed'] > div:has(div.fontHeadlineSmall)").evaluateAll((elements) => {
                    return elements.map(el => {
                        const titleEl = el.querySelector("div.fontHeadlineSmall");
                        let webBtn = el.querySelector('a[data-value="Website"]');
                        if (!webBtn) {
                            webBtn = Array.from(el.querySelectorAll('a')).find(a => (a as HTMLElement).innerText && (a as HTMLElement).innerText.toLowerCase().includes("website")) || null;
                        }
                        return {
                            businessName: titleEl ? titleEl.textContent?.trim() || "" : "",
                            website: webBtn ? webBtn.getAttribute("href") || "" : "",
                            html: el.innerHTML,
                            text: (el as HTMLElement).innerText
                        }
                    });
                });

                sendEvent({ message: `[🔍] Initial Payload: ${htmlListings.length} raw map nodes found. Extracting target data...` });

                const targets: any[] = [];
                for (let i = 0; i < htmlListings.length; i++) {
                    const { businessName, website, html, text } = htmlListings[i];
                    if (!businessName) continue;

                    let rating = 0; let reviewCount = 0; let phone = ""; let address = ""; let category = "";

                    const ratingMatch = text.match(/(\d\.\d)(?:\s*\(([\d,]+)\))?/);
                    if (ratingMatch) {
                        rating = parseFloat(ratingMatch[1]);
                        if (ratingMatch[2]) {
                            reviewCount = parseInt(ratingMatch[2].replace(',', ''), 10);
                        }
                    }

                    const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                    if (phoneMatch) phone = phoneMatch[0];

                    // Next line after title/rating is usually Category · Address
                    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
                    if (lines.length > 2) {
                        const catAdd = lines[2].split('·');
                        if (catAdd.length > 0) category = catAdd[0].trim();
                        if (catAdd.length > 1) address = catAdd.slice(1).join('·').trim();
                    }

                    targets.push({ businessName, website, rating, reviewCount, phone, category, address });
                }

                sendEvent({ message: `[🎯] Perfect Targets Acquired: ${targets.length}` });

                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
                // Crucial fix for 404/censor: using gemini-2.5-pro since 1.5 is deprecated
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-pro",
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
                    ]
                });

                let savedCount = 0;

                for (const target of targets) {
                    sendEvent({ message: `[⚙️] Deep Enriching: ${target.businessName}...` });
                    const searchPage = await context.newPage();
                    let rawFootprint = "";
                    let email = "";
                    let ownerName = "";
                    let socialLink = "";
                    let websiteStatus = "MISSING";

                    try {
                        if (target.website) {
                            websiteStatus = "ACTIVE";
                            sendEvent({ message: `[🌐] Scanning Website Target: ${target.website.substring(0, 40)}...` });
                            await searchPage.goto(target.website, { waitUntil: "domcontentloaded", timeout: 15000 });
                            rawFootprint = await searchPage.locator("body").innerText();
                            const allLinks = await searchPage.locator("a").evaluateAll(a => a.map(n => n.getAttribute("href")).filter(h => h && h.startsWith('http')));
                            rawFootprint += "\n\nDISCOVERED LINKS:\n" + allLinks.join('\n');
                        } else {
                            sendEvent({ message: `[🔍] No website detected. Searching footprint...` });
                            const sQuery = `"${target.businessName}" ${city} email OR owner OR facebook OR linkedin`;
                            await searchPage.goto(`https://www.google.com/search?q=${encodeURIComponent(sQuery)}`, { waitUntil: "domcontentloaded" });
                            await searchPage.waitForSelector("#search", { timeout: 10000 });
                            rawFootprint = await searchPage.locator("#search").innerText();
                            const allLinks = await searchPage.locator("#search a").evaluateAll(a => a.map(n => n.getAttribute("href")).filter(h => h && h.startsWith('http')));
                            rawFootprint += "\n\nDISCOVERED LINKS:\n" + allLinks.join('\n');
                        }
                    } catch (err) {
                        // Ignore timeout
                    } finally {
                        await searchPage.close();
                    }

                    let tacticalNote = "No intelligence generated.";

                    if (process.env.GEMINI_API_KEY) {
                        try {
                            const prompt = websiteStatus === "ACTIVE" ?
                                `You are an elite B2B data analyzer. You are evaluating a local business website.
Business Name: ${target.businessName}
Location: ${city}
Category: ${target.category}
Website URL: ${target.website}

WEBSITE TEXTUAL CONTENT & LINKS:
${rawFootprint.substring(0, 15000)}

Your objective is to meticulously parse this website content to extract identifiers and evaluate its quality.
Return strictly a JSON object (no markdown formatting, no \`\`\`json wrappers) with exactly these keys:
{
  "email": "Extract any valid contact email found. Leave empty string if none.",
  "ownerName": "Identify the owner, founder, or contact person. Leave empty if none.",
  "socialLink": "Extract their best social media link (Facebook, IG, LinkedIn). Leave empty if none.",
  "tacticalPitch": "A 1 to 2 sentence critical evaluation of the website's quality, content depth, structure, and any obvious missing elements (like poor copy, no clear call-to-action). Provide a label at the start like '[Website Status: Poor] - '."
}`
                                :
                                `You are an elite B2B data analyzer. You are evaluating a local business that currently has NO functional website.
Business Name: ${target.businessName}
Location: ${city}
Category: ${target.category}

RAW SEARCH FOOTPRINT (Text & Links):
${rawFootprint.substring(0, 15000)}

Your objective is to meticulously parse this chaotic footprint and extract contact targets.
Return strictly a JSON object (no markdown formatting, no \`\`\`json wrappers) with exactly these keys:
{
  "email": "Extract any valid contact email found in the footprint. Ignore sentry.io or google links. Leave empty string if none.",
  "ownerName": "Identify the owner, founder, director, or standard contact person. Leave empty if none.",
  "socialLink": "Extract their best social media link (Facebook, Instagram, LinkedIn) from the discovered links. Leave empty if none.",
  "tacticalPitch": "Write exactly '[Website Status: MISSING] - ' followed by a 1-sentence analytical note of their strongest online platform (e.g. they have an active Facebook page or no presence at all)."
}`;

                            const result = await model.generateContent(prompt);
                            const textResp = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '').trim();

                            try {
                                const aiData = JSON.parse(textResp);
                                email = aiData.email || email;
                                ownerName = aiData.ownerName || ownerName;
                                socialLink = aiData.socialLink || socialLink;
                                tacticalNote = aiData.tacticalPitch || "Intelligence parsed but analysis empty.";
                            } catch (parseErr) {
                                console.error("JSON parse failed on Gemini response:", textResp);
                                tacticalNote = `AI parsing error, raw output: ${textResp.substring(0, 50)}`;
                            }

                        } catch (geminiErr: any) {
                            tacticalNote = `AI Error: ${geminiErr.message}`;
                        }
                    }

                    const savedLead = await prisma.lead.create({
                        data: {
                            businessName: target.businessName, niche, city,
                            phone: target.phone, rating: target.rating, reviewCount: target.reviewCount,
                            websiteStatus: websiteStatus,
                            category: target.category, address: target.address,
                            email, socialLink, contactName: ownerName,
                            tacticalNote
                        }
                    });

                    await csvWriter.writeRecords([{
                        Business_Name: target.businessName, Niche: niche, City: city, Category: target.category,
                        Address: target.address, Phone: target.phone, Email: email, Owner_Name: ownerName,
                        Social_Link: socialLink, Review_Count: target.reviewCount, Rating: target.rating, Target_Note: tacticalNote
                    }]);

                    savedCount++;
                    sendEvent({ message: `[✔] ${target.businessName} extracted, reasoned, and persisted to DB/CSV.` });
                }

                sendEvent({ message: `[✅] EXTRACTION COMPLETE. ${savedCount} targets strictly processed.` });
                sendEvent({ message: `[💾] CSV Appended: ${csvPath}` });
                sendEvent({ _done: true });

            } catch (error: any) {
                console.error("[!] Scrape Stream Error:", error);
                sendEvent({ error: error.message });
            } finally {
                if (browser) await browser.close();
                controller.close();
            }
        }
    });

    return new NextResponse(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
