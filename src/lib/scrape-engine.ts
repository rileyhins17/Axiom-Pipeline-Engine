import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

import {
  computeAxiomScore,
  type PainSignal,
  type WebsiteAssessment,
} from "@/lib/axiom-scoring";
import { validateContact } from "@/lib/contact-validation";
import { generateDedupeKey } from "@/lib/dedupe";
import { checkDisqualifiers } from "@/lib/disqualifiers";
import { launchAutomationBrowser, type AutomationBrowser, type AutomationBrowserContext } from "@/lib/browser-rendering";
import { generatePersonalization } from "@/lib/lead-personalization";
import {
  formatEmailCandidatesForPrompt,
  resolvePublicBusinessEmail,
  type EmailDiscoveryPage,
} from "@/lib/public-email-intelligence";
import {
  collectSearchDiscoveryPage,
  collectWebsiteDiscoveryPages,
  pickBestSocialLink,
} from "@/lib/public-web-discovery";
import type {
  ScrapeJobEventPayload,
  ScrapeLeadWriteInput,
} from "@/lib/scrape-jobs";

class ScrapeCanceledError extends Error {}

type Target = {
  address: string;
  businessName: string;
  category: string;
  phone: string;
  rating: number;
  reviewCount: number;
  website: string;
};

export interface ExecuteScrapeJobInput {
  city: string;
  existingDedupeKeys: string[];
  geminiApiKey?: string;
  jobId: string;
  maxDepth: number;
  niche: string;
  persistLead: (lead: ScrapeLeadWriteInput) => Promise<void>;
  radius: string;
  sendEvent: (data: ScrapeJobEventPayload) => Promise<void>;
  shouldAbort?: () => boolean;
}

export interface ExecuteScrapeJobResult {
  aborted: boolean;
  avgScore: number;
  leadsFound: number;
  withEmail: number;
}

function sanitizeAiJsonResponse(text: string): string {
  return text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
}

function createGeminiModel(apiKey?: string) {
  if (!apiKey) {
    return null;
  }

  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.5-pro",
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });
}

function buildActiveWebsitePrompt(input: {
  businessName: string;
  category: string;
  city: string;
  niche: string;
  rawFootprint: string;
  rating: number;
  reviewCount: number;
  targetWebsite: string;
  vettedEmailCandidates: string;
}) {
  return `You are an elite B2B web analyst evaluating a local business website for a web design agency.
Business: ${input.businessName} | Location: ${input.city} | Niche: ${input.niche} | Category: ${input.category}
Website: ${input.targetWebsite}
Rating: ${input.rating}/5 (${input.reviewCount} reviews)

WEBSITE CONTENT & LINKS:
${input.rawFootprint.substring(0, 15000)}

VETTED PUBLIC EMAIL CANDIDATES:
${input.vettedEmailCandidates}

EMAIL RULES:
- You may only return an email that appears exactly in the vetted public email candidates list above.
- If no candidate is clearly usable for outreach, return "".
- Prefer public owner, founder, director, or person-named inboxes over generic inboxes.
- Never invent, normalize, or guess an email.

Return a JSON object (no markdown, no code fences):
{
  "email": "Exact email from the vetted candidate list or empty string",
  "ownerName": "Owner/founder/contact person or empty string",
  "socialLink": "Best social media link (FB, IG, LinkedIn) or empty string",
  "websiteAssessment": {
    "speedRisk": 0-5,
    "conversionRisk": 0-5,
    "trustRisk": 0-5,
    "seoRisk": 0-5,
    "overallGrade": "A through F",
    "topFixes": ["Fix 1", "Fix 2", "Fix 3"]
  },
  "painSignals": [
    {"type": "CONVERSION|SPEED|TRUST|SEO|DESIGN|FUNCTIONALITY", "severity": 1-5, "evidence": "Specific evidence from the site", "source": "site_scan"}
  ],
  "hasContactForm": true/false,
  "hasSocialMessaging": true/false,
  "tacticalNote": "1-2 sentence critical evaluation"
}`;
}

function buildMissingWebsitePrompt(input: {
  businessName: string;
  category: string;
  city: string;
  niche: string;
  rawFootprint: string;
  rating: number;
  reviewCount: number;
  vettedEmailCandidates: string;
}) {
  return `You are an elite B2B web analyst evaluating a local business with no website.
Business: ${input.businessName} | Location: ${input.city} | Niche: ${input.niche} | Category: ${input.category}
Rating: ${input.rating}/5 (${input.reviewCount} reviews)

RAW SEARCH FOOTPRINT:
${input.rawFootprint.substring(0, 15000)}

VETTED PUBLIC EMAIL CANDIDATES:
${input.vettedEmailCandidates}

EMAIL RULES:
- You may only return an email that appears exactly in the vetted public email candidates list above.
- If no candidate is clearly usable for outreach, return "".
- Prefer public owner, founder, director, or person-named inboxes over generic inboxes.
- Never invent, normalize, or guess an email.

Return a JSON object (no markdown, no code fences):
{
  "email": "Exact email from the vetted candidate list or empty string",
  "ownerName": "Owner/founder/director or empty string",
  "socialLink": "Best social media link (Facebook, Instagram, LinkedIn) or empty string",
  "websiteAssessment": null,
  "painSignals": [
    {"type": "NO_WEBSITE", "severity": 4, "evidence": "Specific evidence about their lack of web presence vs competitors", "source": "heuristic"},
    {"type": "CONVERSION", "severity": 3, "evidence": "How they are losing leads without a website", "source": "heuristic"}
  ],
  "hasContactForm": false,
  "hasSocialMessaging": true/false,
  "tacticalNote": "1 sentence about their strongest online platform or lack thereof"
}`;
}

async function collectTargets(
  context: AutomationBrowserContext,
  niche: string,
  city: string,
  maxDepth: number,
  sendEvent: (data: ScrapeJobEventPayload) => Promise<void>,
  shouldAbort?: () => boolean,
): Promise<Target[]> {
  const page = await context.newPage();

  try {
    if (shouldAbort?.()) {
      throw new ScrapeCanceledError("Scrape canceled before Maps navigation.");
    }

    const query = `${niche} in ${city}, Ontario`;
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
      waitUntil: "commit",
      timeout: 30000,
    });

    try {
      await page.waitForSelector("div[role='feed']", { timeout: 15000 });
    } catch {
      throw new Error("Maps results timed out. No targets found.");
    }

    await sendEvent({ message: "[MAPS] Infinite scroll extraction started" });

    let lastHeight = 0;
    let scrollAttempts = 0;
    while (scrollAttempts < maxDepth) {
      if (shouldAbort?.()) {
        throw new ScrapeCanceledError("Scrape canceled during Maps extraction.");
      }

      const newHeight = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollBy(0, 5000);
          return feed.scrollHeight;
        }
        return 0;
      });

      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
      scrollAttempts++;
      await page.waitForTimeout(1500);
      await sendEvent({ message: `[MAPS] Depth ${scrollAttempts}/${maxDepth}` });
    }

    const placeLinks = await page.locator("a.hfpxzc").evaluateAll((anchors) =>
      anchors
        .map((anchor) => ({
          name: anchor.getAttribute("aria-label") || "",
          url: (anchor as HTMLAnchorElement).href || anchor.getAttribute("href") || "",
        }))
        .filter((place) => place.name && place.url && !place.url.includes("/search/")),
    );

    await sendEvent({ message: `[MAPS] Found ${placeLinks.length} listings. Extracting details...` });

    const targets: Target[] = [];
    const chunkSize = process.platform === "win32" ? 1 : 5;

    for (let index = 0; index < placeLinks.length; index += chunkSize) {
      if (shouldAbort?.()) {
        throw new ScrapeCanceledError("Scrape canceled while collecting detail pages.");
      }

      const chunk = placeLinks.slice(index, index + chunkSize);
      await sendEvent({
        message: `[MAPS] Detail batch ${Math.floor(index / chunkSize) + 1}/${Math.ceil(placeLinks.length / chunkSize)}`,
      });

      const chunkResults = await Promise.all(
        chunk.map(async (place) => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(place.url, {
              timeout: 15000,
              waitUntil: "commit",
            });
            await detailPage.waitForSelector("h1", { timeout: 10000 });

            const details = await detailPage.evaluate(() => {
              const title = document.querySelector("h1")?.innerText || "";
              const webButton = document.querySelector('a[data-item-id="authority"]');
              const website =
                (webButton as HTMLAnchorElement | null)?.href ||
                webButton?.getAttribute("href") ||
                "";
              const phoneButton = document.querySelector('button[data-item-id*="phone:tel:"]');
              let phone = "";

              if (phoneButton) {
                phone = phoneButton.getAttribute("data-item-id")?.replace("phone:tel:", "") || "";
              } else {
                const fallbackButtons = Array.from(
                  document.querySelectorAll('button[data-tooltip="Copy phone number"]'),
                );
                if (fallbackButtons.length > 0) {
                  phone = (fallbackButtons[0] as HTMLElement).innerText;
                }
              }

              const addressButton = document.querySelector('button[data-item-id="address"]');
              const address = addressButton?.getAttribute("aria-label")?.replace("Address: ", "") || "";
              const categoryButton = document.querySelector('button[jsaction="pane.rating.category"]');
              const category = (categoryButton as HTMLElement | null)?.innerText || "";
              const ratingDiv = document.querySelector('div[jsaction="pane.rating.moreReviews"]');
              const ratingText = ratingDiv?.getAttribute("aria-label") || "";

              return { address, category, phone, ratingText, title, website };
            });

            return details;
          } catch {
            return null;
          } finally {
            await detailPage.close();
          }
        }),
      );

      for (const result of chunkResults) {
        if (!result || !result.title) continue;

        let rating = 0;
        let reviewCount = 0;
        if (result.ratingText) {
          const match = result.ratingText.match(/([\d.]+)\s*stars?\s*([\d,]+)/i);
          if (match) {
            rating = parseFloat(match[1]);
            reviewCount = parseInt(match[2].replace(/,/g, ""), 10);
          }
        }

        targets.push({
          address: result.address,
          businessName: result.title,
          category: result.category,
          phone: result.phone,
          rating,
          reviewCount,
          website: result.website,
        });
      }
    }

    return targets;
  } finally {
    await page.close();
  }
}

async function enrichWithAi(input: {
  businessName: string;
  category: string;
  city: string;
  discoveryPages: EmailDiscoveryPage[];
  emailResolution: ReturnType<typeof resolvePublicBusinessEmail>;
  model: ReturnType<typeof createGeminiModel>;
  niche: string;
  ownerName: string;
  rawFootprint: string;
  rating: number;
  reviewCount: number;
  socialLink: string;
  targetWebsite: string;
  websiteStatus: string;
}) {
  let ownerName = input.ownerName;
  let socialLink = input.socialLink;
  let tacticalNote = "No intelligence generated.";
  let hasContactForm = false;
  let hasSocialMessaging = /facebook|instagram|messenger/i.test(socialLink);
  let assessment: WebsiteAssessment | null = null;
  let painSignals: PainSignal[] = [];
  let emailResolution = input.emailResolution;
  let email = emailResolution.email;

  try {
    const vettedEmailCandidates = formatEmailCandidatesForPrompt(emailResolution.candidates);
    const prompt =
      input.websiteStatus === "ACTIVE"
        ? buildActiveWebsitePrompt({
            businessName: input.businessName,
            category: input.category,
            city: input.city,
            niche: input.niche,
            rawFootprint: input.rawFootprint,
            rating: input.rating,
            reviewCount: input.reviewCount,
            targetWebsite: input.targetWebsite,
            vettedEmailCandidates,
          })
        : buildMissingWebsitePrompt({
            businessName: input.businessName,
            category: input.category,
            city: input.city,
            niche: input.niche,
            rawFootprint: input.rawFootprint,
            rating: input.rating,
            reviewCount: input.reviewCount,
            vettedEmailCandidates,
          });

    const result = await input.model!.generateContent(prompt);
    const textResponse = sanitizeAiJsonResponse(result.response.text());
    const aiData = JSON.parse(textResponse) as {
      email?: string;
      hasContactForm?: boolean;
      hasSocialMessaging?: boolean;
      ownerName?: string;
      painSignals?: Array<{
        evidence?: string;
        severity?: number;
        source?: string;
        type?: string;
      }>;
      socialLink?: string;
      tacticalNote?: string;
      websiteAssessment?: {
        conversionRisk?: number;
        overallGrade?: string;
        seoRisk?: number;
        speedRisk?: number;
        topFixes?: string[];
        trustRisk?: number;
      } | null;
    };

    ownerName = aiData.ownerName || ownerName;
    socialLink = aiData.socialLink || socialLink;
    tacticalNote = aiData.tacticalNote || tacticalNote;
    hasContactForm = aiData.hasContactForm === true;
    hasSocialMessaging = aiData.hasSocialMessaging === true || hasSocialMessaging;

    if (aiData.websiteAssessment) {
      assessment = {
        conversionRisk: Math.min(aiData.websiteAssessment.conversionRisk || 0, 5),
        overallGrade: aiData.websiteAssessment.overallGrade || "C",
        seoRisk: Math.min(aiData.websiteAssessment.seoRisk || 0, 5),
        speedRisk: Math.min(aiData.websiteAssessment.speedRisk || 0, 5),
        topFixes: (aiData.websiteAssessment.topFixes || []).slice(0, 3),
        trustRisk: Math.min(aiData.websiteAssessment.trustRisk || 0, 5),
      };
    }

    if (Array.isArray(aiData.painSignals)) {
      painSignals = aiData.painSignals
        .filter((signal) => signal && signal.type && signal.evidence)
        .map((signal) => ({
          evidence: signal.evidence as string,
          severity: Math.min(Math.max(signal.severity || 1, 1), 5),
          source: (signal.source as PainSignal["source"]) || "ai_analysis",
          type: signal.type as PainSignal["type"],
        }));
    }

    emailResolution = resolvePublicBusinessEmail({
      aiPreferredEmail: aiData.email || "",
      businessName: input.businessName,
      businessWebsite: input.targetWebsite,
      ownerName,
      pages: input.discoveryPages,
    });
    email = emailResolution.email || email;
  } catch (geminiError: unknown) {
    const message = geminiError instanceof Error ? geminiError.message : "Unknown AI error";
    tacticalNote = `AI Error: ${message}`;
  }

  return {
    assessment,
    email,
    emailResolution,
    hasContactForm,
    hasSocialMessaging,
    ownerName,
    painSignals,
    socialLink,
    tacticalNote,
  };
}

export async function executeScrapeJob(input: ExecuteScrapeJobInput): Promise<ExecuteScrapeJobResult> {
  const model = createGeminiModel(input.geminiApiKey);
  const source = `${input.niche}|${input.city}|${new Date().toISOString().split("T")[0]}`;
  const existingDedupeKeys = new Set(input.existingDedupeKeys);
  let browser: AutomationBrowser | null = null;
  let context: AutomationBrowserContext | null = null;
  let aborted = false;
  let leadsFound = 0;
  let withEmail = 0;
  let totalScore = 0;

  const shouldAbort = () => {
    if (aborted) return true;
    if (input.shouldAbort?.()) {
      aborted = true;
      return true;
    }
    return false;
  };

  try {
    browser = await launchAutomationBrowser();
    context = await browser.newContext({ locale: "en-CA" });

    await input.sendEvent({
      message: `[ENGINE] AXIOM ENGINE initialized for ${input.niche} in ${input.city} (R:${input.radius}km, D:${input.maxDepth})`,
    });
    await input.sendEvent({
      message:
        "[ENGINE] Intelligence modules online: scoring, dedupe, contact validation, public email resolver",
    });

    if (!model) {
      await input.sendEvent({
        message: "[AI] Gemini key not configured. Running heuristic-only enrichment.",
      });
    }

    const targets = await collectTargets(
      context,
      input.niche,
      input.city,
      input.maxDepth,
      input.sendEvent,
      shouldAbort,
    );

    if (shouldAbort()) {
      return { aborted: true, avgScore: 0, leadsFound, withEmail };
    }

    await input.sendEvent({
      message: `[ENGINE] ${targets.length} targets parsed. Starting enrichment...`,
      progress: 0,
      total: targets.length,
    });

    let duplicateCount = 0;
    let disqualifiedCount = 0;
    const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };

    for (let index = 0; index < targets.length; index++) {
      if (shouldAbort()) {
        break;
      }

      const target = targets[index];
      const dedupe = generateDedupeKey(
        target.businessName,
        input.city,
        target.phone,
        target.website,
        target.address,
      );

      if (existingDedupeKeys.has(dedupe.key)) {
        duplicateCount++;
        await input.sendEvent({
          message: `[DEDUPE] ${target.businessName} skipped (${dedupe.matchedBy})`,
          progress: index + 1,
          total: targets.length,
          stats: { leadsFound, withEmail },
        });
        continue;
      }
      existingDedupeKeys.add(dedupe.key);

      await input.sendEvent({
        message: `[ENRICH] ${index + 1}/${targets.length} ${target.businessName}`,
        progress: index,
        total: targets.length,
        stats: { leadsFound, withEmail },
      });

      let rawFootprint = "";
      let email = "";
      let ownerName = "";
      let socialLink = "";
      let websiteStatus = "MISSING";
      let discoveryPages: EmailDiscoveryPage[] = [];

      try {
        if (shouldAbort()) {
          break;
        }

        if (target.website) {
          websiteStatus = "ACTIVE";
          await input.sendEvent({ message: `[WEB] Deep scan ${target.website.substring(0, 70)}` });
          const discovery = await collectWebsiteDiscoveryPages(context, target.website, input.sendEvent);
          rawFootprint = discovery.rawFootprint;
          discoveryPages = discovery.pages;
          socialLink = pickBestSocialLink(discovery.pages);
        } else {
          await input.sendEvent({ message: "[WEB] No website. Searching public footprint..." });
          const searchQuery = `"${target.businessName}" ${input.city} email OR owner OR founder OR facebook OR linkedin`;
          const discovery = await collectSearchDiscoveryPage(context, searchQuery);
          rawFootprint = discovery.rawFootprint;
          discoveryPages = discovery.pages;
          socialLink = pickBestSocialLink(discovery.pages);
        }
      } catch {
        // Continue with partial discovery data when a crawl step fails.
      }

      let emailResolution = resolvePublicBusinessEmail({
        businessName: target.businessName,
        businessWebsite: target.website,
        pages: discoveryPages,
      });
      email = emailResolution.email;

      if (emailResolution.email) {
        await input.sendEvent({
          message: `[EMAIL] Resolver candidate ${emailResolution.email} (${emailResolution.emailType}/${emailResolution.confidence.toFixed(2)})`,
        });
      } else {
        await input.sendEvent({ message: "[EMAIL] Resolver found no vetted public email" });
      }

      let assessment: WebsiteAssessment | null = null;
      let painSignals: PainSignal[] = [];
      let tacticalNote = "No intelligence generated.";
      let hasContactForm = false;
      let hasSocialMessaging = /facebook|instagram|messenger/i.test(socialLink);

      if (model) {
        const aiResult = await enrichWithAi({
          businessName: target.businessName,
          category: target.category,
          city: input.city,
          discoveryPages,
          emailResolution,
          model,
          niche: input.niche,
          ownerName,
          rawFootprint,
          rating: target.rating,
          reviewCount: target.reviewCount,
          socialLink,
          targetWebsite: target.website,
          websiteStatus,
        });

        ownerName = aiResult.ownerName;
        socialLink = aiResult.socialLink;
        tacticalNote = aiResult.tacticalNote;
        hasContactForm = aiResult.hasContactForm;
        hasSocialMessaging = aiResult.hasSocialMessaging;
        assessment = aiResult.assessment;
        painSignals = aiResult.painSignals;
        emailResolution = aiResult.emailResolution;
        email = aiResult.email;
      }

      if (websiteStatus === "MISSING" && !painSignals.some((signal) => signal.type === "NO_WEBSITE")) {
        painSignals.unshift({
          evidence: `${target.businessName} has no website and is relying on directory or social presence only`,
          severity: 4,
          source: "heuristic",
          type: "NO_WEBSITE",
        });
      }

      if (websiteStatus === "MISSING" && painSignals.length === 1 && target.reviewCount >= 5) {
        painSignals.push({
          evidence: `Active business with ${target.reviewCount} reviews but no web presence is likely losing leads to competitors`,
          severity: 3,
          source: "heuristic",
          type: "CONVERSION",
        });
      }

      const contactValidation = validateContact(email, target.phone, {
        businessWebsite: target.website,
        ownerName,
      });
      await input.sendEvent({
        message: `[EMAIL] Final ${email || "none"} | type=${contactValidation.emailType} | confidence=${contactValidation.emailConfidence.toFixed(2)}`,
      });

      const scoreResult = computeAxiomScore({
        assessment,
        category: target.category,
        city: input.city,
        contact: contactValidation,
        hasContactForm,
        hasSocialMessaging,
        niche: input.niche,
        painSignals,
        rating: target.rating,
        reviewContent: rawFootprint.substring(0, 2000),
        reviewCount: target.reviewCount,
        websiteContent: rawFootprint.substring(0, 5000),
        websiteStatus,
      });

      const disqualifyResult = checkDisqualifiers({
        assessment,
        axiomScore: scoreResult.axiomScore,
        businessName: target.businessName,
        category: target.category,
        city: input.city,
        niche: input.niche,
        painSignals,
        rating: target.rating,
        reviewCount: target.reviewCount,
        tier: scoreResult.tier,
        websiteContent: rawFootprint.substring(0, 5000),
        websiteStatus,
      });

      const personalization = generatePersonalization({
        assessment,
        businessName: target.businessName,
        city: input.city,
        contactName: ownerName || null,
        niche: input.niche,
        painSignals,
        websiteStatus,
      });

      const isArchived = disqualifyResult.disqualified;
      if (isArchived) disqualifiedCount++;

      const lead: ScrapeLeadWriteInput = {
        address: target.address,
        axiomScore: scoreResult.axiomScore,
        axiomTier: scoreResult.tier,
        axiomWebsiteAssessment: assessment ? JSON.stringify(assessment) : null,
        businessName: target.businessName,
        callOpener: personalization.callOpener,
        category: target.category.trim() || input.niche.trim(),
        city: input.city,
        contactName: ownerName || null,
        dedupeKey: dedupe.key,
        dedupeMatchedBy: dedupe.matchedBy,
        disqualifiers:
          disqualifyResult.reasons.length > 0 ? JSON.stringify(disqualifyResult.reasons) : null,
        disqualifyReason: disqualifyResult.primaryReason,
        email,
        emailConfidence: contactValidation.emailConfidence,
        emailType: contactValidation.emailType,
        followUpQuestion: personalization.followUpQuestion,
        isArchived,
        lastUpdated: new Date(),
        leadScore: scoreResult.axiomScore,
        niche: input.niche,
        painSignals: JSON.stringify(painSignals),
        phone: target.phone,
        phoneConfidence: contactValidation.phoneConfidence,
        rating: target.rating,
        reviewCount: target.reviewCount,
        scoreBreakdown: JSON.stringify(scoreResult.breakdown),
        socialLink,
        source,
        tacticalNote,
        websiteGrade: assessment?.overallGrade || null,
        websiteStatus,
      };

      await input.persistLead(lead);

      leadsFound++;
      totalScore += scoreResult.axiomScore;
      if (email) withEmail++;
      tierCounts[scoreResult.tier] = (tierCounts[scoreResult.tier] || 0) + 1;

      const grade = assessment ? ` | Grade: ${assessment.overallGrade}` : "";
      const disqualifiedLabel = isArchived ? " | DISQUALIFIED" : "";
      await input.sendEvent({
        message: `[SCORE] ${scoreResult.axiomScore}/100 [${scoreResult.tier}]${grade}${disqualifiedLabel} - ${target.businessName}`,
        progress: index + 1,
        stats: { leadsFound, withEmail },
        total: targets.length,
      });
    }

    if (shouldAbort()) {
      return {
        aborted: true,
        avgScore: leadsFound > 0 ? Math.round(totalScore / leadsFound) : 0,
        leadsFound,
        withEmail,
      };
    }

    const qualifiedCount = leadsFound - disqualifiedCount;
    const avgScore = leadsFound > 0 ? Math.round(totalScore / leadsFound) : 0;

    await input.sendEvent({ message: "[DONE] AXIOM extraction complete" });
    await input.sendEvent({
      message: `[DONE] ${leadsFound} processed | ${duplicateCount} deduped | ${disqualifiedCount} disqualified | ${qualifiedCount} qualified`,
    });
    await input.sendEvent({
      message: `[DONE] Tiers S:${tierCounts.S || 0} A:${tierCounts.A || 0} B:${tierCounts.B || 0} C:${tierCounts.C || 0} D:${tierCounts.D || 0}`,
    });
    await input.sendEvent({
      message: "[DONE] Export the protected results from The Vault or /api/leads/export.",
    });
    await input.sendEvent({ _done: true, stats: { avgScore, leadsFound, withEmail } });

    return {
      aborted: false,
      avgScore,
      leadsFound,
      withEmail,
    };
  } catch (error) {
    if (error instanceof ScrapeCanceledError) {
      aborted = true;
      return {
        aborted: true,
        avgScore: leadsFound > 0 ? Math.round(totalScore / leadsFound) : 0,
        leadsFound,
        withEmail,
      };
    }

    throw error;
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
