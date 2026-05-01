import {
  computeAxiomScore,
  type PainSignal,
  type WebsiteAssessment,
} from "@/lib/axiom-scoring";
import { chatCompletion } from "@/lib/deepseek";
import { validateContact } from "@/lib/contact-validation";
import { extractDomain, generateDedupeKey } from "@/lib/dedupe";
import { checkDisqualifiers } from "@/lib/disqualifiers";
import {
  launchAutomationBrowser,
  type AutomationBrowser,
  type AutomationBrowserContext,
  type AutomationPage,
} from "@/lib/browser-rendering";
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

type MapsListing = {
  ariaLabel: string;
  cardText: string;
  name: string;
  url: string;
};

type CollectedMapsTarget = {
  address: string;
  category: string;
  detailMode: "direct" | "fallback";
  phone: string;
  ratingText: string;
  title: string;
  website: string;
};

export interface ExecuteScrapeJobInput {
  city: string;
  existingDedupeKeys: string[];
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTextOrNull(value: string | null | undefined): string | null {
  const clean = normalizeWhitespace(value || "");
  return clean || null;
}

function normalizeWebsiteUrl(value: string): string {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  try {
    const url = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    if (url.hostname.includes("google.") && url.pathname.includes("/maps")) {
      return "";
    }
    return url.toString();
  } catch {
    if (/google\.[^/]*\/maps|maps\.google\./i.test(clean)) {
      return "";
    }
    return clean;
  }
}

function normalizeCategory(category: string, niche: string, businessName?: string): string {
  const clean = normalizeWhitespace(category);
  if (!clean) return "";

  if (/^\d+(?:\.\d+)?$/.test(clean)) {
    return "";
  }

  const comparable = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const nicheComparable = niche.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!comparable || comparable === nicheComparable) {
    return "";
  }

  const title = normalizeWhitespace(businessName || "");
  const titleComparable = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (titleComparable && (comparable === titleComparable || comparable.startsWith(titleComparable) || titleComparable.startsWith(comparable))) {
    return "";
  }

  const cleanWords = clean.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const titleWords = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (cleanWords.length >= 4 && titleWords.length >= 3) {
    const sharedWordCount = cleanWords.filter((word) => titleWords.includes(word)).length;
    if (sharedWordCount / Math.max(cleanWords.length, 1) >= 0.7) {
      return "";
    }
  }

  if (isLikelyHoursText(clean) || hasPhoneLikeText(clean) || isLikelyAddressText(clean)) {
    return "";
  }

  if (/reviews?|ratings?|stars?/i.test(clean)) {
    return "";
  }

  if (/^google maps$/i.test(clean)) {
    return "";
  }

  if (/^(see|saved|recents|get app|search|share|directions|website|photos|hours?|open|closed|call|menu|overview|nearby|about)$/i.test(clean)) {
    return "";
  }

  if (/^(restaurants?|hotels?|things to do|transit|parking|pharmacies|atms)$/i.test(clean)) {
    return "";
  }

  if (/\b(get app|saved|recents|search this area|search this place|share|directions|website|photos|menu|overview|nearby)\b/i.test(clean)) {
    return "";
  }

  return clean;
}

function normalizePhoneText(phone: string): string {
  return normalizeWhitespace(phone).replace(/[.,;]+$/g, "");
}

function hasPhoneLikeText(value: string): boolean {
  return /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(value);
}

function isLikelyHoursText(value: string): boolean {
  return /^(open|closed|opens|closes|hours?|website|call|directions|share|save)$/i.test(value) ||
    /\b(open|closed|closes|opens)\b/i.test(value);
}

function isLikelyAddressText(value: string): boolean {
  return /\d/.test(value) && /(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|hwy|highway|pkwy|parkway|unit|suite|floor|on|ontario|kitchener|waterloo|guelph|hamilton|cambridge)/i.test(value);
}

function extractPhoneFromText(value: string): string {
  const match = value.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  return match ? normalizePhoneText(match[0]) : "";
}

function cleanMapsAddressCandidate(value: string): string {
  const clean = normalizeWhitespace(value);
  if (!clean) {
    return "";
  }

  return normalizeWhitespace(
    clean
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .replace(/\s*(?:Closed|Open now|Open|Opens|Closes|Hours|Website|Directions|Share|Save|Photos|Phone)\b.*$/i, "")
      .replace(/\s*\(?\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\)?\s*$/i, "")
      .replace(/\s*[\u2022\u00b7]\s*$/, ""),
  );
}

function isMeaningfulMapsTitle(value: string): boolean {
  const clean = normalizeWhitespace(value);
  return Boolean(clean) && clean.length >= 3 && !/^google maps$/i.test(clean);
}

function isMeaningfulMapsCategory(value: string, title: string): boolean {
  const clean = normalizeWhitespace(value);
  const normalizedTitle = normalizeWhitespace(title);
  if (!clean || clean.length > 80) {
    return false;
  }

  if (/^\d+(?:\.\d+)?$/.test(clean)) {
    return false;
  }

  if (/^google maps$/i.test(clean)) {
    return false;
  }

  if (/^(see|saved|recents|get app|search|share|directions|website|photos|hours?|open|closed|call|menu|overview|nearby|about)$/i.test(clean)) {
    return false;
  }

  if (/\b(get app|saved|recents|search this area|search this place|share|directions|website|photos|menu|overview|nearby)\b/i.test(clean)) {
    return false;
  }

  if (/[\p{S}\p{C}]/u.test(clean.replace(/[&'â€™.\-]/g, ""))) {
    return false;
  }

  const cleanLower = clean.toLowerCase();
  const titleLower = normalizedTitle.toLowerCase();
  if (clean === normalizedTitle || (titleLower && cleanLower.startsWith(titleLower))) {
    return false;
  }

  const cleanWords = cleanLower.split(/[^a-z0-9]+/).filter(Boolean);
  const titleWords = titleLower.split(/[^a-z0-9]+/).filter(Boolean);
  const sharedWordCount = cleanWords.filter((word) => titleWords.includes(word)).length;
  if (cleanWords.length > 3 && sharedWordCount / Math.max(cleanWords.length, 1) >= 0.7) {
    return false;
  }

  if (/[<>]/.test(clean) || /<\/?[a-z]/i.test(clean)) {
    return false;
  }

  if (/^(overview|about|directions|nearby|save|share|website|address)$/i.test(clean)) {
    return false;
  }

  if (/^(restaurants?|hotels?|things to do|transit|parking|pharmacies|atms)$/i.test(clean)) {
    return false;
  }

  return true;
}

function extractMapsCategoryFromText(value: string, title: string): string {
  const clean = normalizeWhitespace(value);
  const normalizedTitle = normalizeWhitespace(title);
  if (!clean) {
    return "";
  }

  let working = clean;
  if (normalizedTitle) {
    const lowerWorking = working.toLowerCase();
    const lowerTitle = normalizedTitle.toLowerCase();
    if (lowerWorking.startsWith(lowerTitle)) {
      working = working.slice(normalizedTitle.length).trim();
    }
  }

  working = working.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
  working = working.replace(/^[ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·\-ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|:]+\s*/u, "").trim();

  const cutTokens = [
    /(?:^|\s)(?:ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢|ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·|\||ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|-)(?:\s|$)/,
    /\bClosed\b/i,
    /\bOpen now\b/i,
    /\bOpens\b/i,
    /\bHours\b/i,
    /\bWebsite\b/i,
    /\bDirections\b/i,
    /\bShare\b/i,
    /\bSave\b/i,
    /\bPhotos\b/i,
    /\bPhone\b/i,
    /\bAddress\b/i,
    /\d{1,6}\s+[A-Za-z0-9'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢.\-/& ]{2,80}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Way|Ln|Lane|Ct|Court|Cres|Crescent|Pkwy|Parkway|Pl|Place|Ter|Terrace|Hwy|Highway)\b/i,
    /\d{1,6}\s+[A-Za-z0-9'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢.\-/& ]{2,80}\s+(?:Kitchener|Waterloo|Guelph|Hamilton|Cambridge|Toronto|London|Burlington|Ontario|ON)\b/i,
  ];

  let endIndex = working.length;
  for (const token of cutTokens) {
    const matchIndex = working.search(token);
    if (matchIndex > 0 && matchIndex < endIndex) {
      endIndex = matchIndex;
    }
  }

  let candidate = working.slice(0, endIndex).trim();
  candidate = candidate.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
  candidate = candidate.replace(/^[ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·\-ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|:]+\s*/u, "").trim();

  if (!candidate || candidate.length > 80) {
    return "";
  }

  if (isLikelyHoursText(candidate) || hasPhoneLikeText(candidate) || isLikelyAddressText(candidate)) {
    return "";
  }

  if (/reviews?|ratings?|stars?/i.test(candidate)) {
    return "";
  }

  if (/^google maps$/i.test(candidate)) {
    return "";
  }

  return candidate;
}

function extractAddressFromMapsText(text: string, title: string): string {
  const source = normalizeWhitespace(text);
  const normalizedTitle = normalizeWhitespace(title);
  if (!source) {
    return "";
  }

  let tail = source;
  if (normalizedTitle) {
    const index = source.toLowerCase().indexOf(normalizedTitle.toLowerCase());
    if (index >= 0) {
      tail = source.slice(index + normalizedTitle.length).trim();
    }
  }

  const patterns = [
    /\d{1,6}\s+[A-Za-z0-9'Ã¢â‚¬â„¢\.\-/& ]{2,80}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Way|Ln|Lane|Ct|Court|Cres|Crescent|Pkwy|Parkway|Pl|Place|Ter|Terrace|Hwy|Highway)\b[^|]{0,80}/i,
    /\d{1,6}\s+[A-Za-z0-9'Ã¢â‚¬â„¢\.\-/& ]{2,80}\s+(?:Kitchener|Waterloo|Guelph|Hamilton|Cambridge|Toronto|London|Burlington|Ontario|ON)\b[^|]{0,80}/i,
  ];

  for (const pattern of patterns) {
    const match = tail.match(pattern) || source.match(pattern);
    if (match) {
      return cleanMapsAddressCandidate(match[0]);
    }
  }

  return "";
}

async function readLocatorText(page: AutomationPage, selector: string, preserveLineBreaks = false): Promise<string> {
  try {
    const text = await page
      .evaluate((sel) => {
        const element = document.querySelector(sel) as HTMLElement | null;
        if (!element) {
          return "";
        }
        return (element.innerText || element.textContent || "").trim();
      }, selector)
      .catch(() => "");

    if (preserveLineBreaks) {
      return (text || "").replace(/\r\n/g, "\n").trim();
    }

    return normalizeWhitespace(text || "");
  } catch {
    return "";
  }
}

async function readLocatorAttribute(page: AutomationPage, selector: string, attribute: string): Promise<string> {
  try {
    const value = await page
      .evaluate(
        ([sel, attr]) => {
          const element = document.querySelector(sel) as HTMLElement | null;
          if (!element) {
            return "";
          }
          return element.getAttribute(attr) || "";
        },
        [selector, attribute],
      )
      .catch(() => "");

    return normalizeWhitespace(value || "");
  } catch {
    return "";
  }
}

function extractCategoryFromMapsText(text: string, title: string): string {
  return extractMapsCategoryFromText(text, title);
}

function extractCategoryFromBodyText(bodyText: string, title: string): string {
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  const titleIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return Boolean(lower && normalizedTitle && (lower === normalizedTitle || lower.includes(normalizedTitle) || normalizedTitle.includes(lower)));
  });
  const scanLines = titleIndex >= 0 ? lines.slice(titleIndex + 1) : lines;

  for (const line of scanLines) {
    const lower = line.toLowerCase();
    if (!line || lower === normalizedTitle) continue;
    if (/^\d+(?:\.\d+)?$/.test(line)) continue;

    const dotIndex = line.search(/[\u00B7\u2022]/u);
    if (dotIndex > 0) {
      let candidate = normalizeWhitespace(line.slice(0, dotIndex));
      candidate = candidate.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
      if (!candidate || candidate.length > 40) continue;
      if (/^google maps$/i.test(candidate)) continue;
      if (isLikelyHoursText(candidate) || hasPhoneLikeText(candidate) || isLikelyAddressText(candidate)) continue;
      return candidate;
    }

    if (line.length <= 60 && isMeaningfulMapsCategory(line, title)) {
      return line;
    }

    if (isLikelyHoursText(line) || hasPhoneLikeText(line) || isLikelyAddressText(line)) {
      continue;
    }
    if (/reviews?|ratings?|stars?|open now|closed|hours?|website|directions|save|share|address/i.test(line)) {
      continue;
    }
  }

  return "";
}

function buildMapsListingFallback(listing: MapsListing): {
  address: string;
  category: string;
  phone: string;
  ratingText: string;
  title: string;
  website: string;
} {
  const sourceText = normalizeWhitespace([listing.ariaLabel, listing.cardText].filter(Boolean).join("\n"));
  const title = normalizeWhitespace(listing.name || sourceText.split(" ").slice(0, 8).join(" "));
  const ratingText = sourceText;
  return {
    address: extractAddressFromMapsText(sourceText, title),
    category: extractCategoryFromBodyText(sourceText, title) || extractMapsCategoryFromText(sourceText, title),
    phone: extractPhoneFromText(sourceText),
    ratingText,
    title,
    website: "",
  };
}

async function waitForMapsResultSurface(
  page: AutomationPage,
  sendEvent: (data: ScrapeJobEventPayload) => Promise<void>,
): Promise<boolean> {
  const selectors = [
    { label: "feed", selector: "div[role='feed']" },
    { label: "place links", selector: "a.hfpxzc" },
    { label: "place links by href", selector: "a[href*='/maps/place/']" },
    { label: "result cards", selector: "div[role='article']" },
  ];

  for (let attempt = 1; attempt <= 5; attempt++) {
    for (const candidate of selectors) {
      try {
        const present = await page.locator(candidate.selector).evaluateAll((elements) => elements.length > 0);
        if (present) {
          await sendEvent({ message: `[MAPS] Results ready via ${candidate.label}` });
          return true;
        }
      } catch {
        // Try the next selector or the next retry window.
      }
    }

    await sendEvent({ message: `[MAPS] Waiting for Maps results (${attempt}/5)` });
    await page.waitForTimeout(2000);
  }

  return false;
}

async function dismissGoogleMapsConsent(
  page: AutomationPage,
  sendEvent: (data: ScrapeJobEventPayload) => Promise<void>,
): Promise<boolean> {
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  const isConsentPage = /before you continue to google/i.test(bodyText) || page.url().includes("consent.google.com");

  if (!isConsentPage) {
    return false;
  }

  await sendEvent({ message: "[MAPS] Google consent gate detected; attempting dismissal" });

  const consentSelectors = [
    'button[aria-label="Reject all"]',
    'button[aria-label="Accept all"]',
    'button[aria-label="I agree"]',
    'button[aria-label="Agree"]',
    'button:has-text("Reject all")',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
  ];

  const clickConsentButton = async (selector: string): Promise<boolean> => {
    return page.evaluate((candidateSelector: string) => {
      const button = document.querySelectorAll(candidateSelector)[0] as HTMLButtonElement | undefined;
      if (!button) {
        return false;
      }

      setTimeout(() => button.click(), 0);
      return true;
    }, selector).catch(() => false);
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const selector of consentSelectors) {
      try {
        const clicked = await clickConsentButton(selector);
        if (!clicked) {
          continue;
        }

        await page.waitForTimeout(2500);
        const consentBodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
        if (
          !page.url().includes("consent.google.com") &&
          !/before you continue to google/i.test(consentBodyText)
        ) {
          await sendEvent({ message: "[MAPS] Google consent gate dismissed" });
          return true;
        }
      } catch {
        // Try the next consent control or the next retry window.
      }
    }

    await page.waitForTimeout(1000);
  }

  await sendEvent({ message: "[MAPS] Google consent gate remained after dismissal attempts" });
  return false;
}

async function collectMapsListings(page: AutomationPage): Promise<MapsListing[]> {
  const listings = await page
    .locator("a.hfpxzc, a[href*='/maps/place/']")
    .evaluateAll((anchors) =>
      anchors
        .map((anchor) => {
          const element = anchor as HTMLAnchorElement;
          const card = element.closest("div.Nv2PK") || element.closest("div[role='article']") || element.parentElement;
          return {
            ariaLabel: element.getAttribute("aria-label") || "",
            cardText: (card?.textContent || "").trim().slice(0, 2000),
            name: element.getAttribute("aria-label") || "",
            url: element.href || element.getAttribute("href") || "",
          };
        })
        .filter((place) => place.name && place.url && !place.url.includes("/search/")),
    );

  return listings as MapsListing[];
}

async function extractMapsDetailFromPage(
  detailPage: AutomationPage,
  place: MapsListing,
  fallbackTitle: string,
  listingFallback: Omit<CollectedMapsTarget, "detailMode">,
): Promise<CollectedMapsTarget> {
  const bodyText = await readLocatorText(detailPage, "body", true);
  const titleCandidate =
    normalizeWhitespace(
      (await readLocatorText(detailPage, "h1")) ||
        (await readLocatorAttribute(detailPage, 'meta[property="og:title"]', "content")) ||
        (await readLocatorAttribute(detailPage, 'meta[name="title"]', "content")) ||
        "",
    );
  const title = isMeaningfulMapsTitle(titleCandidate)
    ? titleCandidate
    : normalizeWhitespace(fallbackTitle || listingFallback.title || place.name);
  const website =
    normalizeWebsiteUrl(
      (await readLocatorAttribute(
        detailPage,
        'a[data-item-id="authority"], a[data-tooltip*="Website"], a[aria-label*="Website"]',
        "href",
      )) || listingFallback.website,
    );
  const phone =
    normalizePhoneText(
      (await readLocatorAttribute(detailPage, 'button[data-item-id*="phone:tel:"]', "data-item-id"))
        .replace("phone:tel:", "") ||
        extractPhoneFromText(bodyText) ||
        listingFallback.phone,
    );
  const address =
    normalizeWhitespace(
      cleanMapsAddressCandidate(
        (await readLocatorText(detailPage, 'button[data-item-id="address"], a[data-item-id="address"], button[data-tooltip*="Address"]'))
          .replace(/^Address:\s*/i, ""),
      ) ||
        extractAddressFromMapsText(bodyText, title) ||
        listingFallback.address,
    );
  const directCategory = extractCategoryFromBodyText(bodyText, title);
  const category =
    normalizeWhitespace(
      extractMapsCategoryFromText(
        await readLocatorText(
          detailPage,
          'button[jsaction="pane.rating.category"], button[jsaction*="pane.rating.category"], button[data-item-id="category"], div[data-item-id="category"]',
        ),
        title,
      ) ||
        directCategory ||
        extractCategoryFromMapsText(bodyText, title) ||
        listingFallback.category,
    );
  const finalCategory = isMeaningfulMapsCategory(category, title)
    ? category
    : (isMeaningfulMapsCategory(listingFallback.category, title) ? listingFallback.category : "");
  const ratingText =
    normalizeWhitespace(
      (await readLocatorAttribute(detailPage, 'div[jsaction="pane.rating.moreReviews"]', "aria-label")) ||
        (await readLocatorText(detailPage, 'div[jsaction="pane.rating.moreReviews"]')) ||
        listingFallback.ratingText ||
        bodyText,
    );

  return {
    address,
    category: finalCategory,
    detailMode: "direct",
    phone,
    ratingText,
    title,
    website,
  };
}

function parseMapsRatingAndReviews(source: string): { rating: number; reviewCount: number } {
  const text = normalizeWhitespace(source);
  if (!text) {
    return { rating: 0, reviewCount: 0 };
  }

  const candidatePatterns = [
    /([\d.]+)\s*(?:stars?|rating)[^\d]{0,40}([\d,]+)\s*(?:reviews?|ratings?)/i,
    /([\d.]+)\s*[ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ]\s*([\d,]+)/i,
    /rating[:\s]+([\d.]+)[^\d]{0,40}reviews?[:\s]+([\d,]+)/i,
    /([\d.]+)\s*\(\s*([\d,]+)\s*\)\s*(?:reviews?|ratings?)?/i,
  ];

  for (const pattern of candidatePatterns) {
    const match = text.match(pattern);
    if (match) {
      const rating = Number.parseFloat(match[1]);
      const reviewCount = Number.parseInt(match[2].replace(/,/g, ""), 10);
      if (Number.isFinite(rating) && Number.isFinite(reviewCount)) {
        return { rating, reviewCount };
      }
    }
  }

  const numbers = Array.from(text.matchAll(/\d[\d,]*(?:\.\d+)?/g)).map((match) => Number.parseFloat(match[0].replace(/,/g, "")));
  if (numbers.length === 0) {
    return { rating: 0, reviewCount: 0 };
  }

  const rating = numbers.find((value) => value > 0 && value <= 5) || 0;
  const reviewCount = numbers.find((value) => value >= 5 && value !== rating) || 0;

  return {
    rating,
    reviewCount,
  };
}

function buildFallbackTacticalNote(input: {
  businessName: string;
  category: string;
  rating: number;
  reviewCount: number;
  socialLink: string;
  websiteStatus: string;
}) {
  if (input.websiteStatus === "MISSING") {
    return `No website is visible for ${input.businessName}; outreach should focus on web presence and lead capture.`;
  }

  if (input.socialLink) {
    return `${input.businessName} has an active digital footprint; position outreach around conversion opportunities.`;
  }

  if (input.reviewCount > 0 || input.rating > 0) {
    return `${input.businessName} has strong review signals; outreach should emphasize trust-driven marketing and lead capture.`;
  }

  if (input.category) {
    return `Website scan incomplete for ${input.businessName}; position outreach around ${input.category.toLowerCase()} conversion and trust gaps.`;
  }

  return `Website scan incomplete for ${input.businessName}; position outreach around conversion and trust gaps.`;
}

function sanitizeTacticalNote(note: string | null | undefined, fallback: string): string {
  const clean = normalizeWhitespace(note || "");
  if (!clean) {
    return fallback;
  }

  if (/^(ai error|error:|fetch failed|503 service unavailable|502 bad gateway|timeout)/i.test(clean)) {
    return fallback;
  }

  return clean;
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
  let missingTitleCount = 0;

  try {
    if (shouldAbort?.()) {
      throw new ScrapeCanceledError("Scrape canceled before Maps navigation.");
    }

    const query = `${niche} in ${city}, Ontario`;
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
      waitUntil: "commit",
      timeout: 30000,
    });

    await dismissGoogleMapsConsent(page, sendEvent);

    const hasResultsSurface = await waitForMapsResultSurface(page, sendEvent);
    if (!hasResultsSurface) {
      await sendEvent({
        message: "[MAPS] No Maps results discovered after retries; skipping Maps scrape.",
      });
      return [];
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

    let placeLinks = await collectMapsListings(page);
    if (placeLinks.length === 0) {
      await sendEvent({ message: "[MAPS] No listings on first pass, retrying once..." });
      await page.waitForTimeout(5000);
      placeLinks = await collectMapsListings(page);
    }

    if (placeLinks.length === 0) {
      await sendEvent({ message: "[MAPS] No place listings found after retries; skipping Maps scrape." });
      return [];
    }

    await sendEvent({ message: `[MAPS] Listings found: ${placeLinks.length}` });
    await sendEvent({ message: `[MAPS] Detail extraction started` });

    const targets: Target[] = [];
    let directDetailCount = 0;
    let fallbackDetailCount = 0;
    let directFailureSamples = 0;
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
          const fallbackTitle = normalizeWhitespace(place.name);
          const listingFallback = buildMapsListingFallback(place);
          try {
            await detailPage.goto(place.url, {
              timeout: 15000,
              waitUntil: "commit",
            });
            await detailPage.waitForTimeout(1000);

            return await extractMapsDetailFromPage(detailPage, place, fallbackTitle, {
              address: listingFallback.address,
              category: listingFallback.category,
              phone: listingFallback.phone,
              ratingText: listingFallback.ratingText,
              title: listingFallback.title,
              website: listingFallback.website,
            });
          } catch (error) {
            if (directFailureSamples < 3) {
              directFailureSamples++;
              await sendEvent({
                message: `[MAPS] Direct detail scrape failed for ${place.name}: ${error instanceof Error ? error.message : String(error)}`,
              });
            }
            return {
              ...listingFallback,
              detailMode: "fallback" as const,
            };
          } finally {
            await detailPage.close();
          }
        }),
      );

      for (const result of chunkResults as Array<CollectedMapsTarget>) {
        if (!result || !result.title) {
          missingTitleCount++;
          continue;
        }

        const { rating, reviewCount } = parseMapsRatingAndReviews(result.ratingText);
        if (result.detailMode === "direct") {
          directDetailCount++;
        } else {
          fallbackDetailCount++;
        }

        targets.push({
          address: normalizeWhitespace(result.address),
          businessName: result.title,
          category: normalizeCategory(result.category, niche, result.title),
          phone: normalizePhoneText(result.phone),
          rating,
          reviewCount,
          website: normalizeWebsiteUrl(result.website),
        });
      }
    }

    const targetsWithWebsite = targets.filter((target) => Boolean(target.website)).length;
    const targetsWithCategory = targets.filter((target) => Boolean(target.category)).length;
    const targetsWithPhone = targets.filter((target) => Boolean(target.phone)).length;
    const targetsWithRatingReviews = targets.filter((target) => target.rating > 0 || target.reviewCount > 0).length;

    await sendEvent({ message: `[MAPS] Detail scrape success count: ${directDetailCount}` });
    await sendEvent({ message: `[MAPS] Detail fallback count: ${fallbackDetailCount}` });
    await sendEvent({ message: `[MAPS] Targets with website: ${targetsWithWebsite}` });
    await sendEvent({ message: `[MAPS] Targets with category: ${targetsWithCategory}` });
    await sendEvent({ message: `[MAPS] Targets with phone: ${targetsWithPhone}` });
    await sendEvent({ message: `[MAPS] Targets with rating/reviews: ${targetsWithRatingReviews}` });
    await sendEvent({ message: `[MAPS] Final targets entering enrichment: ${targets.length}` });
    await sendEvent({
      message: `[MAPS] Detail extraction complete: ${targets.length}/${placeLinks.length} usable`,
    });
    if (missingTitleCount > 0) {
      await sendEvent({
        message: `[MAPS] Dropped ${missingTitleCount} listings with no usable title after detail extraction`,
      });
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
  let tacticalNote = buildFallbackTacticalNote({
    businessName: input.businessName,
    category: input.category,
    rating: input.rating,
    reviewCount: input.reviewCount,
    socialLink: input.socialLink,
    websiteStatus: input.websiteStatus,
  });
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

    const result = await chatCompletion({
      messages: [{ role: "user", content: prompt }],
      responseFormat: "json_object",
      temperature: 0.2,
    });
    const resultText = result.content;
    const textResponse = sanitizeAiJsonResponse(resultText);
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
    tacticalNote = sanitizeTacticalNote(
      aiData.tacticalNote,
      buildFallbackTacticalNote({
        businessName: input.businessName,
        category: input.category,
        rating: input.rating,
        reviewCount: input.reviewCount,
        socialLink,
        websiteStatus: input.websiteStatus,
      }),
    );
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
  } catch (error) {
    console.error("[enrichWithAi] DeepSeek enrichment failed; using local fallback intelligence:", error);
    tacticalNote = buildFallbackTacticalNote({
      businessName: input.businessName,
      category: input.category,
      rating: input.rating,
      reviewCount: input.reviewCount,
      socialLink,
      websiteStatus: input.websiteStatus,
    });
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
  const source = `${input.niche}|${input.city}|${new Date().toISOString().split("T")[0]}`;
  const existingDedupeKeys = new Set(input.existingDedupeKeys);
  let browser: AutomationBrowser | null = null;
  let context: AutomationBrowserContext | null = null;
  let aborted = false;
  let leadsFound = 0;
  let withEmail = 0;
  let totalScore = 0;
  let websiteUrlCoverage = 0;
  let websiteDomainCoverage = 0;
  let categoryCoverage = 0;
  let emailFlagsCoverage = 0;
  let phoneFlagsCoverage = 0;
  let activeWebsiteWithoutUrlCount = 0;

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
        "[ENGINE] Intelligence modules online: scoring, dedupe, contact validation, public email resolver, DeepSeek enrichment",
    });

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
      const effectiveCategory = normalizeCategory(target.category, input.niche, target.businessName);
      const scoringCategory = effectiveCategory || input.niche;

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

      const aiResult = await enrichWithAi({
        businessName: target.businessName,
        category: scoringCategory,
        city: input.city,
        discoveryPages,
        emailResolution,
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
        category: scoringCategory,
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
        category: scoringCategory,
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
        address: cleanTextOrNull(target.address),
        axiomScore: scoreResult.axiomScore,
        axiomTier: scoreResult.tier,
        axiomWebsiteAssessment: assessment ? JSON.stringify(assessment) : null,
        businessName: target.businessName,
        callOpener: personalization.callOpener,
        category: cleanTextOrNull(target.category),
        city: input.city,
        contactName: cleanTextOrNull(ownerName),
        dedupeKey: dedupe.key,
        dedupeMatchedBy: dedupe.matchedBy,
        disqualifiers:
          disqualifyResult.reasons.length > 0 ? JSON.stringify(disqualifyResult.reasons) : null,
        disqualifyReason: disqualifyResult.primaryReason,
        email,
        emailConfidence: contactValidation.emailConfidence,
        emailFlags: JSON.stringify(contactValidation.emailFlags),
        emailType: contactValidation.emailType,
        followUpQuestion: personalization.followUpQuestion,
        isArchived,
        lastUpdated: new Date(),
        leadScore: scoreResult.axiomScore,
        niche: input.niche,
        painSignals: JSON.stringify(painSignals),
        phone: cleanTextOrNull(target.phone) || "",
        phoneConfidence: contactValidation.phoneConfidence,
        phoneFlags: JSON.stringify(contactValidation.phoneFlags),
        rating: target.rating,
        reviewCount: target.reviewCount,
        scoreBreakdown: JSON.stringify(scoreResult.breakdown),
        socialLink: cleanTextOrNull(socialLink) || "",
        websiteDomain: cleanTextOrNull(extractDomain(target.website)),
        websiteUrl: cleanTextOrNull(target.website),
        source,
        tacticalNote: cleanTextOrNull(tacticalNote) || tacticalNote,
        websiteGrade: assessment?.overallGrade || null,
        websiteStatus,
      };

      if (lead.websiteUrl) websiteUrlCoverage++;
      if (lead.websiteDomain) websiteDomainCoverage++;
      if (lead.category) categoryCoverage++;
      if (lead.emailFlags) emailFlagsCoverage++;
      if (lead.phoneFlags) phoneFlagsCoverage++;
      if (lead.websiteStatus === "ACTIVE" && !lead.websiteUrl) {
        activeWebsiteWithoutUrlCount++;
        await input.sendEvent({
          message: `[LEAD] Active website missing URL for ${lead.businessName}; keeping status active only when a real URL survives normalization.`,
        });
      }

      await input.persistLead(lead);

      leadsFound++;
      totalScore += scoreResult.axiomScore;
      if (scoreResult.hasValidEmail) withEmail++;
      tierCounts[scoreResult.tier] = (tierCounts[scoreResult.tier] || 0) + 1;

      const websiteSummary = scoreResult.websiteLabel ? ` | ${scoreResult.websiteLabel}` : "";
      const pipelineSummary = scoreResult.outreachEligible
        ? " | Pipeline Ready"
        : scoreResult.emailGateApplied
          ? " | Email Gated"
          : "";
      const disqualifiedLabel = isArchived ? " | DISQUALIFIED" : "";
      const disqualifiedReason = isArchived && disqualifyResult.primaryReason
        ? ` (${disqualifyResult.primaryReason})`
        : "";
      await input.sendEvent({
        message: `[SCORE] ${scoreResult.axiomScore}/100 [${scoreResult.tier}]${websiteSummary}${pipelineSummary}${disqualifiedLabel}${disqualifiedReason} - ${target.businessName}`,
        scoreUpdate: {
          axiomScore: scoreResult.axiomScore,
          breakdown: scoreResult.breakdown,
          businessName: target.businessName,
          emailGateApplied: scoreResult.emailGateApplied,
          fitLabel: scoreResult.fitLabel,
          hasValidEmail: scoreResult.hasValidEmail,
          outreachEligible: scoreResult.outreachEligible,
          reasonSummary: scoreResult.reasonSummary,
          tier: scoreResult.tier,
          websiteLabel: scoreResult.websiteLabel,
          websiteQuality: scoreResult.websiteQuality,
          websiteStatus,
        },
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
      message:
        `[DONE] Field coverage websiteUrl:${websiteUrlCoverage}/${leadsFound} websiteDomain:${websiteDomainCoverage}/${leadsFound} category:${categoryCoverage}/${leadsFound} emailFlags:${emailFlagsCoverage}/${leadsFound} phoneFlags:${phoneFlagsCoverage}/${leadsFound}`,
    });
    if (activeWebsiteWithoutUrlCount > 0) {
      await input.sendEvent({
        message: `[DONE] ${activeWebsiteWithoutUrlCount} ACTIVE website rows were missing a normalized website URL and were logged for review.`,
      });
    }
    await input.sendEvent({
      message: `[DONE] Tiers S:${tierCounts.S || 0} A:${tierCounts.A || 0} B:${tierCounts.B || 0} C:${tierCounts.C || 0} D:${tierCounts.D || 0}`,
    });
    await input.sendEvent({
      message: "[DONE] Export the protected results from Vault or /api/leads/export.",
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





