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
  type AutomationLocator,
  type AutomationPage,
} from "@/lib/browser-rendering";
import { generatePersonalization } from "@/lib/lead-personalization";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";
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
import {
  evaluateScrapeExtractionQuality,
  ScrapeQualityGateError,
  type ScrapeQualityEvaluation,
  type ScrapeQualityStatus,
} from "@/lib/scrape-quality";

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

export type MapsListing = {
  ariaLabel: string;
  cardText: string;
  name: string;
  url: string;
  websiteUrl: string;
};

export type CollectedMapsTarget = {
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
  qualityIssues?: string[];
  qualityStatus?: ScrapeQualityStatus;
  targetsFound?: number;
  targetsWithCategory?: number;
  targetsWithPhone?: number;
  targetsWithRatingReviews?: number;
  targetsWithWebsite?: number;
  withEmail: number;
}

const MAPS_RESULT_WAIT_MS = 2000;
const MAPS_SCROLL_IDLE_MS = 1500;
const MAPS_NO_LISTINGS_RETRY_WAIT_MS = 5000;
const MAPS_DETAIL_READY_TIMEOUT_MS = 14000;
const MAPS_DETAIL_SETTLE_AFTER_SIGNAL_MS = 3500;
const MAPS_DETAIL_POLL_MS = 750;

export type MapsDetailSnapshot = {
  addressText: string;
  bodyText: string;
  categoryText: string;
  h1: string;
  metaTitle: string;
  ogTitle: string;
  phoneDataId: string;
  phoneHref: string;
  ratingAriaLabel: string;
  ratingText: string;
  websiteHref: string;
};

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

  // Unwrap Google redirect URLs (e.g. google.com/url?q=https%3A%2F%2Fexample.com)
  const googleRedirectMatch = /[?&](?:q|url)=(https?(?:%3A|:)[^&#]+)/i.exec(clean);
  if (googleRedirectMatch) {
    try {
      const decoded = decodeURIComponent(googleRedirectMatch[1]);
      return normalizeWebsiteUrl(decoded);
    } catch {
      return "";
    }
  }

  try {
    const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
    // Filter any google.com URL (maps redirects, /url wrapper, etc.)
    if (url.hostname.includes("google.")) {
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

function extractWebsiteTokenFromText(value: string): string {
  const matches = value.matchAll(
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<>"')\]]*)?/gi,
  );

  for (const match of matches) {
    const index = match.index ?? 0;
    const previousChar = value[index - 1] || "";
    const candidate = match[0].replace(/[),.;:]+$/g, "");
    if (previousChar === "@" || candidate.includes("@")) continue;
    if (/google\.|maps\.|goo\.gl|gstatic\.|ggpht\./i.test(candidate)) continue;

    const normalized = normalizeWebsiteUrl(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (normalized) return normalized;
  }

  return "";
}

function emptyMapsDetailSnapshot(): MapsDetailSnapshot {
  return {
    addressText: "",
    bodyText: "",
    categoryText: "",
    h1: "",
    metaTitle: "",
    ogTitle: "",
    phoneDataId: "",
    phoneHref: "",
    ratingAriaLabel: "",
    ratingText: "",
    websiteHref: "",
  };
}

/**
 * Last-resort: extract a website URL from the Maps detail page body text.
 * Maps renders the website domain as visible text (e.g. "northmedicalspa.com")
 * directly below a "Website" label line. This handles cases where the DOM
 * selector fires before the link element is painted.
 */
function extractWebsiteFromBodyText(bodyText: string): string {
  const lines = bodyText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  // Primary: look for the "Website" label and read the next non-empty line
  const websiteIdx = lines.findIndex((l) => /^website$/i.test(l));
  if (websiteIdx >= 0 && websiteIdx + 1 < lines.length) {
    const candidate = lines[websiteIdx + 1];
    const website = extractWebsiteTokenFromText(candidate);
    if (website) return website;
  }

  for (const line of lines) {
    if (/\b(?:website|visit website|open website)\b/i.test(line)) {
      const website = extractWebsiteTokenFromText(line);
      if (website) return website;
    }
  }

  // Secondary: any line that looks like a bare domain (no spaces, has a TLD)
  const domainLike = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9\-.]+\.[a-z]{2,}(?:\/\S*)?$/i;
  const candidates: string[] = [];
  for (const line of lines) {
    if (domainLike.test(line) && line.length < 120 && !/google\.|maps\.|goo\.gl/i.test(line)) {
      candidates.push(line);
    }
  }

  const candidate = candidates.at(-1);
  return candidate ? normalizeWebsiteUrl(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`) : "";
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
  // Street-number + street-type pattern (works for any city, not a hardcoded list)
  if (/\d{1,6}\s+\w/.test(value) && /(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|hwy|highway|pkwy|parkway|unit|suite|floor)\b/i.test(value)) {
    return true;
  }
  // Canadian postal code present → almost certainly an address fragment
  if (/[a-z]\d[a-z]\s*\d[a-z]\d/i.test(value)) {
    return true;
  }
  return false;
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
  const rawText = [listing.ariaLabel, listing.cardText].filter(Boolean).join("\n");
  const sourceText = normalizeWhitespace(rawText);
  const title = normalizeWhitespace(listing.name || sourceText.split(" ").slice(0, 8).join(" "));
  const ratingText = sourceText;
  return {
    address: extractAddressFromMapsText(sourceText, title),
    category: extractCategoryFromBodyText(rawText, title) || extractCategoryFromBodyText(sourceText, title) || extractMapsCategoryFromText(sourceText, title),
    phone: extractPhoneFromText(sourceText),
    ratingText,
    title,
    website: normalizeWebsiteUrl(listing.websiteUrl) || extractWebsiteFromBodyText(rawText),
  };
}

async function safeLocatorCount(locator: AutomationLocator): Promise<number> {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

async function safeLocatorAttr(locator: AutomationLocator, name: string): Promise<string> {
  try {
    return (await locator.getAttribute(name)) || "";
  } catch {
    return "";
  }
}

async function safeLocatorText(locator: AutomationLocator, maxLength = 4000): Promise<string> {
  try {
    return ((await locator.textContent()) || "").trim().slice(0, maxLength);
  } catch {
    return "";
  }
}

function normalizeMapsPlaceUrl(value: string, baseUrl: string): string {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";

  try {
    return new URL(clean, baseUrl || "https://www.google.com").toString();
  } catch {
    return clean;
  }
}

function resolveMapsHrefValue(value: string, baseUrl: string): string {
  const clean = normalizeWhitespace(value);
  if (!clean) return "";
  if (/^(?:https?:\/\/|tel:|mailto:|javascript:)/i.test(clean)) return clean;
  if (clean.startsWith("/")) return normalizeMapsPlaceUrl(clean, baseUrl);
  return clean;
}

function isUsableMapsWebsiteHref(href: string, placeUrl: string): boolean {
  return Boolean(
    href &&
      href !== placeUrl &&
      !/^(?:tel|mailto|javascript):/i.test(href) &&
      !/google\.[^/]*\/maps|maps\.google\.|accounts\.google\.|support\.google\.|gstatic\.|ggpht\./i.test(href),
  );
}

async function findMapsListingCard(anchor: AutomationLocator): Promise<AutomationLocator | null> {
  const selectors = [
    "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' Nv2PK ')][1]",
    "xpath=ancestor::div[@role='article'][1]",
    "xpath=ancestor::div[string-length(normalize-space(.)) > 20][1]",
  ];

  for (const selector of selectors) {
    const candidate = anchor.locator(selector).first();
    if ((await safeLocatorCount(candidate)) > 0) {
      return candidate;
    }
  }

  return null;
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
    { label: "place detail", selector: "h1" },
  ];

  for (let attempt = 1; attempt <= 5; attempt++) {
    for (const candidate of selectors) {
      try {
        if (candidate.label === "place detail" && !page.url().includes("/maps/place/")) {
          continue;
        }
        const present = (await safeLocatorCount(page.locator(candidate.selector))) > 0;
        if (present) {
          await sendEvent({ message: `[MAPS] Results ready via ${candidate.label}` });
          return true;
        }
      } catch {
        // Try the next selector or the next retry window.
      }
    }

    await sendEvent({ message: `[MAPS] Waiting for Maps results (${attempt}/5)` });
    await page.waitForTimeout(MAPS_RESULT_WAIT_MS);
  }

  return false;
}

async function dismissGoogleMapsConsent(
  page: AutomationPage,
  sendEvent: (data: ScrapeJobEventPayload) => Promise<void>,
): Promise<boolean> {
  const bodyText = await safeLocatorText(page.locator("body"), 12000);
  const isConsentPage = /before you continue to google/i.test(bodyText) || page.url().includes("consent.google.com");

  if (!isConsentPage) {
    return false;
  }

  await sendEvent({ message: "[MAPS] Google consent gate detected; attempting dismissal" });

  const clickConsentButton = async (): Promise<string | null> => {
    const wantedLabels = ["reject all", "accept all", "i agree", "agree", "continue"];
    const controls = page.locator('button, div[role="button"], input[type="submit"], input[type="button"]');
    const controlCount = await safeLocatorCount(controls);

    for (let i = 0; i < controlCount; i += 1) {
      const control = controls.nth(i);
      const label = normalizeWhitespace(
        [
          await safeLocatorAttr(control, "aria-label"),
          await safeLocatorAttr(control, "data-label"),
          await safeLocatorAttr(control, "value"),
          await safeLocatorText(control, 300),
        ].join(" "),
      );
      const normalized = label.toLowerCase();
      if (!normalized || !wantedLabels.some((wanted) => normalized.includes(wanted))) {
        continue;
      }

      try {
        await control.click();
        return label;
      } catch {
        // Try the next matching control.
      }
    }

    return null;
  };

  for (let attempt = 1; attempt <= 5; attempt++) {
    const clickedLabel = await clickConsentButton();
    if (clickedLabel) {
      await sendEvent({ message: `[MAPS] Google consent click: ${clickedLabel.substring(0, 80)}` });
      await page.waitForTimeout(2500);
      const consentBodyText = await safeLocatorText(page.locator("body"), 12000);
      if (
        !page.url().includes("consent.google.com") &&
        !/before you continue to google/i.test(consentBodyText)
      ) {
        await sendEvent({ message: "[MAPS] Google consent gate dismissed" });
        return true;
      }
    }

    await page.waitForTimeout(750);
  }

  await sendEvent({ message: "[MAPS] Google consent gate remained after dismissal attempts" });
  return false;
}

async function collectMapsListings(page: AutomationPage): Promise<MapsListing[]> {
  const listings: MapsListing[] = [];
  const baseUrl = page.url();
  const anchors = page.locator("a.hfpxzc, a[href*='/maps/place/']");
  const anchorCount = await safeLocatorCount(anchors);

  for (let i = 0; i < anchorCount; i += 1) {
    const anchor = anchors.nth(i);
    const placeHref = await safeLocatorAttr(anchor, "href");
    const placeUrl = normalizeMapsPlaceUrl(placeHref, baseUrl);

    if (!placeUrl || placeUrl.includes("/search/")) {
      continue;
    }

    const card = await findMapsListingCard(anchor);
    const titleLocator = card ? card.locator(".qBF1Pd").first() : null;
    const titleText = titleLocator && (await safeLocatorCount(titleLocator)) > 0
      ? await safeLocatorText(titleLocator, 200)
      : "";
    const name = normalizeWhitespace((await safeLocatorAttr(anchor, "aria-label")) || titleText);

    if (!name) {
      continue;
    }

    const cardText = card ? await safeLocatorText(card, 4000) : "";
    let websiteUrl = "";

    if (card) {
      const controls = card.locator(
        "a[href], [data-item-id='authority'], [aria-label*='Website'], [aria-label*='website'], [data-tooltip*='Website'], [data-tooltip*='website']",
      );
      const controlCount = await safeLocatorCount(controls);

      for (let j = 0; j < controlCount; j += 1) {
        const candidate = controls.nth(j);
        const rawHref =
          (await safeLocatorAttr(candidate, "href")) ||
          (await safeLocatorAttr(candidate, "data-url")) ||
          (await safeLocatorAttr(candidate, "data-href")) ||
          (await safeLocatorAttr(candidate, "data-value"));
        const href = resolveMapsHrefValue(rawHref, baseUrl);
        const label = normalizeWhitespace(
          [
            await safeLocatorAttr(candidate, "aria-label"),
            await safeLocatorAttr(candidate, "data-tooltip"),
            await safeLocatorAttr(candidate, "data-value"),
            await safeLocatorAttr(candidate, "data-item-id"),
            await safeLocatorText(candidate, 500),
          ].join(" "),
        ).toLowerCase();

        if (!isUsableMapsWebsiteHref(href, placeUrl)) {
          continue;
        }

        if (label.includes("website") || label.includes("visit ") || label.includes("authority")) {
          websiteUrl = href;
          break;
        }

        if (!websiteUrl) {
          websiteUrl = href;
        }
      }
    }

    listings.push({
      ariaLabel: name,
      cardText,
      name,
      url: placeUrl,
      websiteUrl,
    });
  }

  const seen = new Set<string>();
  return listings
    .map((listing) => ({
      ...listing,
      websiteUrl: normalizeWebsiteUrl(listing.websiteUrl) || extractWebsiteFromBodyText(listing.cardText),
    }))
    .filter((listing) => {
      const key = listing.url || listing.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function collectCurrentPlaceListing(page: AutomationPage): Promise<MapsListing[]> {
  if (!page.url().includes("/maps/place/")) {
    return [];
  }

  const titleLocator = page.locator("h1").first();
  const title = (await safeLocatorCount(titleLocator)) > 0
    ? await safeLocatorText(titleLocator, 200)
    : "";
  const bodyText = await safeLocatorText(page.locator("body"), 4000);

  if (!title || !page.url()) {
    return [];
  }

  return [{
    ariaLabel: title,
    cardText: bodyText,
    name: title,
    url: page.url(),
    websiteUrl: "",
  }];
}

async function extractMapsDetailFromPage(
  detailPage: AutomationPage,
  place: MapsListing,
  fallbackTitle: string,
  listingFallback: Omit<CollectedMapsTarget, "detailMode">,
): Promise<CollectedMapsTarget> {
  const raw = await waitForMapsDetailSnapshot(detailPage, fallbackTitle);
  return extractMapsDetailFromSnapshot(raw, place, fallbackTitle, listingFallback);
}

async function readMapsDetailSnapshot(detailPage: AutomationPage): Promise<MapsDetailSnapshot> {
  return detailPage.evaluate(function () {
    const q = (sel: string): HTMLElement | null => document.querySelector(sel) as HTMLElement | null;
    const text = (sel: string) => {
      const el = q(sel);
      return el ? (el.innerText || el.textContent || "").trim() : "";
    };
    const attr = (sel: string, a: string) => {
      const el = q(sel);
      return el ? (el.getAttribute(a) || "") : "";
    };
    let authorityHref = "";
    let websiteHref = "";
    let phoneHref = "";
    const linkNodes = document.querySelectorAll(
      "a[href], [data-item-id='authority'], [aria-label*='Website'], [aria-label*='website'], [data-tooltip*='Website'], [data-tooltip*='website']",
    );

    for (let i = 0; i < linkNodes.length; i += 1) {
      const node = linkNodes[i];
      const element = node as HTMLElement;
      const href =
        (element as HTMLAnchorElement).href ||
        element.getAttribute("href") ||
        element.getAttribute("data-url") ||
        element.getAttribute("data-href") ||
        element.getAttribute("data-value") ||
        "";
      const dataItemId = element.getAttribute("data-item-id") || "";
      const haystack = [
        element.getAttribute("aria-label") || "",
        element.getAttribute("data-tooltip") || "",
        element.getAttribute("data-value") || "",
        dataItemId,
        element.textContent || "",
      ]
        .join(" ")
        .toLowerCase();
      const usableHref =
        href &&
        !/^(?:tel|mailto|javascript):/i.test(href) &&
        !/google\.[^/]*\/maps|maps\.google\.|accounts\.google\.|support\.google\.|gstatic\.|ggpht\./i.test(href);

      if (!phoneHref && /^tel:/i.test(href)) {
        phoneHref = href;
      }
      if (usableHref && !authorityHref && dataItemId === "authority") {
        authorityHref = href;
      }
      if (usableHref && !websiteHref && haystack.indexOf("website") >= 0) {
        websiteHref = href;
      }
    }

    return {
      h1: text("h1"),
      ogTitle: attr('meta[property="og:title"]', "content"),
      metaTitle: attr('meta[name="title"]', "content"),
      websiteHref: authorityHref || websiteHref || "",
      phoneHref,
      phoneDataId: attr('button[data-item-id*="phone:tel:"]', "data-item-id"),
      addressText: text('button[data-item-id="address"], a[data-item-id="address"], button[data-tooltip*="Address"], button[aria-label^="Address:"]'),
      categoryText: text(
        'button[jsaction="pane.rating.category"], button[jsaction*="pane.rating.category"], button[data-item-id="category"], div[data-item-id="category"]',
      ),
      ratingAriaLabel: attr('div[jsaction="pane.rating.moreReviews"]', "aria-label"),
      ratingText: text('div[jsaction="pane.rating.moreReviews"]'),
      bodyText: (document.body ? document.body.innerText || "" : "").trim(),
    };
  }).catch(() => emptyMapsDetailSnapshot());
}

function scoreMapsDetailSnapshot(raw: MapsDetailSnapshot, fallbackTitle: string): number {
  const bodyText = raw.bodyText.replace(/\r\n/g, "\n");
  const titleCandidate = normalizeWhitespace(raw.h1 || raw.ogTitle || raw.metaTitle || fallbackTitle);
  let score = isMeaningfulMapsTitle(titleCandidate) ? 1 : 0;

  if (normalizeWebsiteUrl(raw.websiteHref) || extractWebsiteFromBodyText(bodyText)) score += 3;
  if (raw.phoneDataId || raw.phoneHref || extractPhoneFromText(bodyText)) score += 2;
  if (cleanMapsAddressCandidate(raw.addressText.replace(/^Address:\s*/i, "")) || extractAddressFromMapsText(bodyText, titleCandidate)) score += 2;
  if (extractMapsCategoryFromText(raw.categoryText, titleCandidate) || extractCategoryFromBodyText(bodyText, titleCandidate)) score += 1;
  if (raw.ratingAriaLabel || raw.ratingText) score += 1;

  return score;
}

async function waitForMapsDetailSnapshot(detailPage: AutomationPage, fallbackTitle: string): Promise<MapsDetailSnapshot> {
  const startedAt = Date.now();
  let firstUsefulSignalAt = 0;
  let bestSnapshot = emptyMapsDetailSnapshot();
  let bestScore = -1;

  while (Date.now() - startedAt < MAPS_DETAIL_READY_TIMEOUT_MS) {
    const snapshot = await readMapsDetailSnapshot(detailPage);
    const score = scoreMapsDetailSnapshot(snapshot, fallbackTitle);

    if (score > bestScore) {
      bestScore = score;
      bestSnapshot = snapshot;
    }

    const hasUsefulDetail = score >= 4;
    const hasAnchoredWebsite = Boolean(normalizeWebsiteUrl(snapshot.websiteHref));
    if (hasUsefulDetail) {
      firstUsefulSignalAt ||= Date.now();
      if (hasAnchoredWebsite || Date.now() - firstUsefulSignalAt >= MAPS_DETAIL_SETTLE_AFTER_SIGNAL_MS) {
        return bestSnapshot;
      }
    }

    await detailPage.waitForTimeout(MAPS_DETAIL_POLL_MS);
  }

  return bestSnapshot;
}

function extractMapsDetailFromSnapshot(
  raw: MapsDetailSnapshot,
  place: MapsListing,
  fallbackTitle: string,
  listingFallback: Omit<CollectedMapsTarget, "detailMode">,
): CollectedMapsTarget {
  const bodyText = raw.bodyText.replace(/\r\n/g, "\n");

  const titleCandidate = normalizeWhitespace(raw.h1 || raw.ogTitle || raw.metaTitle || "");
  const title = isMeaningfulMapsTitle(titleCandidate)
    ? titleCandidate
    : normalizeWhitespace(fallbackTitle || listingFallback.title || place.name);

  const website =
    normalizeWebsiteUrl(raw.websiteHref) ||
    extractWebsiteFromBodyText(bodyText) ||
    listingFallback.website;

  const phone = normalizePhoneText(
    raw.phoneDataId.replace("phone:tel:", "") ||
      raw.phoneHref.replace(/^tel:/i, "") ||
      extractPhoneFromText(bodyText) ||
      listingFallback.phone,
  );

  const address = normalizeWhitespace(
    cleanMapsAddressCandidate(raw.addressText.replace(/^Address:\s*/i, "")) ||
      extractAddressFromMapsText(bodyText, title) ||
      listingFallback.address,
  );

  const directCategory = extractCategoryFromBodyText(bodyText, title);
  const category = normalizeWhitespace(
    extractMapsCategoryFromText(raw.categoryText, title) ||
      directCategory ||
      extractCategoryFromMapsText(bodyText, title) ||
      listingFallback.category,
  );
  const finalCategory = isMeaningfulMapsCategory(category, title)
    ? category
    : (isMeaningfulMapsCategory(listingFallback.category, title) ? listingFallback.category : "");

  const ratingText = normalizeWhitespace(
    raw.ratingAriaLabel || raw.ratingText || listingFallback.ratingText || bodyText,
  );

  return {
    address,
    category: finalCategory,
    detailMode: scoreMapsDetailSnapshot(raw, fallbackTitle) >= 3 ? "direct" : "fallback",
    phone,
    ratingText,
    title,
    website,
  };
}

export const scrapeEngineTestInternals = {
  buildMapsListingFallback,
  extractMapsDetailFromSnapshot,
  extractWebsiteFromBodyText,
  normalizeWebsiteUrl,
  scoreMapsDetailSnapshot,
};

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

function getPrimaryPainSignal(painSignals: PainSignal[]) {
  return [...painSignals].sort((a, b) => b.severity - a.severity)[0] || null;
}

function buildPreVaultOutreachEnrichment(input: {
  assessment: WebsiteAssessment | null;
  businessName: string;
  category: string;
  painSignals: PainSignal[];
  tacticalNote: string;
  targetWebsite: string;
  websiteStatus: string;
}): EnrichmentResult {
  const primaryPain = getPrimaryPainSignal(input.painSignals);
  const domain = cleanTextOrNull(extractDomain(input.targetWebsite));
  const siteReference = domain || input.businessName;
  const topFix = input.assessment?.topFixes?.find(Boolean);
  const observedIssue =
    primaryPain?.evidence ||
    topFix ||
    (input.websiteStatus === "MISSING"
      ? "No clear website surfaced during the scan."
      : "The scan found friction in the website path.");
  const keyPainPoint =
    input.websiteStatus === "MISSING"
      ? "No clear website surfaced for a new visitor."
      : primaryPain?.type === "SPEED"
        ? "The site may feel slower than it should on first load."
        : primaryPain?.type === "TRUST"
          ? "Trust signals may not be visible early enough."
          : primaryPain?.type === "SEO"
            ? "Service information may be harder to scan than it should be."
            : "The contact or quote path may be creating avoidable friction.";

  return {
    valueProposition:
      input.websiteStatus === "MISSING"
        ? `Axiom can help ${input.businessName} give new visitors a clearer place to understand the work and reach out.`
        : `Axiom can help ${input.businessName} make the path from ${siteReference} to a real enquiry clearer.`,
    pitchAngle:
      input.websiteStatus === "MISSING"
        ? "Lead with the missing website and keep the note curiosity-based."
        : `Lead with the clearest scan finding: ${observedIssue}`,
    anticipatedObjections: [
      "Most work already comes from referrals.",
      "The current site may feel good enough for now.",
      "They may not be actively looking for website help.",
    ],
    emailTone: "professional",
    keyPainPoint,
    competitiveEdge:
      "A stronger local site usually makes services, proof, and the next step obvious within the first few seconds.",
    personalizedHook:
      input.websiteStatus === "MISSING"
        ? `I could not find a clear site for ${input.businessName} while checking the local listing.`
        : `I had a quick look through ${siteReference}, and one thing stood out from a visitor's point of view.`,
    recommendedCTA: "Worth me sending over a couple of quick fixes?",
    enrichmentSummary: `${input.tacticalNote} Primary outreach issue: ${observedIssue}`,
  };
}

function scoreWebsiteRiskFromSignals(input: {
  rawFootprint: string;
  targetWebsite: string;
  category: string;
  niche: string;
}): WebsiteAssessment {
  const text = input.rawFootprint.toLowerCase();
  const normalizedText = normalizeWhitespace(text);
  const contentLength = normalizedText.length;
  const hasQuotePath = /\b(quote|estimate|book|booking|appointment|schedule|contact|call now|get started)\b/i.test(text);
  const hasForm = /\b(form|submit|request a quote|get a quote|send message|contact us)\b/i.test(text);
  const hasPhone = hasPhoneLikeText(text);
  const hasTrustSignals = /\b(review|testimonial|licensed|insured|warranty|guarantee|gallery|portfolio|before|after|years experience|family owned)\b/i.test(text);
  const hasServiceDetail = /\b(services?|service area|repair|install|maintenance|emergency|residential|commercial)\b/i.test(text);
  const hasLocalContext = input.category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
    .some((word) => text.includes(word)) ||
    input.niche
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
      .some((word) => text.includes(word));
  const hasHttps = /^https:\/\//i.test(input.targetWebsite);

  const conversionRisk = Math.min(
    5,
    (hasQuotePath ? 1 : 4) +
      (hasForm || hasPhone ? 0 : 1),
  );
  const trustRisk = Math.min(
    5,
    (hasTrustSignals ? 1 : 4) +
      (hasHttps ? 0 : 1),
  );
  const seoRisk = Math.min(
    5,
    (contentLength >= 1200 ? 1 : contentLength >= 500 ? 3 : 5) +
      (hasServiceDetail && hasLocalContext ? 0 : 1),
  );
  const speedRisk = contentLength > 18000 ? 4 : contentLength > 10000 ? 3 : 2;
  const totalRisk = speedRisk + conversionRisk + trustRisk + seoRisk;
  const overallGrade = totalRisk <= 5 ? "A" : totalRisk <= 8 ? "B" : totalRisk <= 11 ? "C" : totalRisk <= 14 ? "D" : "F";
  const topFixes = [
    !hasQuotePath ? "Make the quote/contact path obvious above the fold" : "",
    !hasTrustSignals ? "Bring reviews, proof, or project examples higher on the page" : "",
    !hasServiceDetail || !hasLocalContext ? "Add clearer service and local-area detail" : "",
    !hasForm && !hasPhone ? "Add a simple direct contact option" : "",
  ].filter(Boolean).slice(0, 3);

  return {
    conversionRisk,
    overallGrade,
    seoRisk,
    speedRisk,
    topFixes: topFixes.length > 0 ? topFixes : ["Keep the main offer and next step easy to scan"],
    trustRisk,
  };
}

function mergeWebsiteAssessments(
  aiAssessment: WebsiteAssessment | null,
  heuristicAssessment: WebsiteAssessment | null,
): WebsiteAssessment | null {
  if (!heuristicAssessment) return aiAssessment;
  if (!aiAssessment) return heuristicAssessment;

  const speedRisk = Math.max(aiAssessment.speedRisk || 0, heuristicAssessment.speedRisk);
  const conversionRisk = Math.max(aiAssessment.conversionRisk || 0, heuristicAssessment.conversionRisk);
  const trustRisk = Math.max(aiAssessment.trustRisk || 0, heuristicAssessment.trustRisk);
  const seoRisk = Math.max(aiAssessment.seoRisk || 0, heuristicAssessment.seoRisk);
  const totalRisk = speedRisk + conversionRisk + trustRisk + seoRisk;
  const overallGrade = totalRisk <= 5 ? "A" : totalRisk <= 8 ? "B" : totalRisk <= 11 ? "C" : totalRisk <= 14 ? "D" : "F";
  const topFixes = Array.from(new Set([
    ...(aiAssessment.topFixes || []),
    ...(heuristicAssessment.topFixes || []),
  ].filter(Boolean))).slice(0, 3);

  return {
    conversionRisk,
    overallGrade,
    seoRisk,
    speedRisk,
    topFixes,
    trustRisk,
  };
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
- Never choose role inboxes such as info@, contact@, sales@, marketing@, office@, admin@, support@, service@, quotes@, estimates@, booking@, or web@.
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
- Never choose role inboxes such as info@, contact@, sales@, marketing@, office@, admin@, support@, service@, quotes@, estimates@, booking@, or web@.
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
    let lastListingCount = 0;
    let scrollAttempts = 0;
    let stableScrollAttempts = 0;
    while (scrollAttempts < maxDepth) {
      if (shouldAbort?.()) {
        throw new ScrapeCanceledError("Scrape canceled during Maps extraction.");
      }

      const scrollState = await page.evaluate(function () {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollBy(0, 5000);
          return {
            height: feed.scrollHeight,
            listingCount: document.querySelectorAll("a.hfpxzc, a[href*='/maps/place/']").length,
          };
        }
        const body = document.body;
        return {
          height: body ? body.scrollHeight : 0,
          listingCount: document.querySelectorAll("a.hfpxzc, a[href*='/maps/place/']").length,
        };
      });

      if (scrollState.height <= lastHeight && scrollState.listingCount <= lastListingCount) {
        stableScrollAttempts++;
        if (stableScrollAttempts >= 2) break;
      } else {
        stableScrollAttempts = 0;
      }

      lastHeight = Math.max(lastHeight, scrollState.height);
      lastListingCount = Math.max(lastListingCount, scrollState.listingCount);
      scrollAttempts++;
      await page.waitForTimeout(MAPS_SCROLL_IDLE_MS);
      await sendEvent({ message: `[MAPS] Depth ${scrollAttempts}/${maxDepth}` });
    }

    let placeLinks = await collectMapsListings(page);
    if (placeLinks.length === 0) {
      await sendEvent({ message: "[MAPS] No listings on first pass, retrying once..." });
      await page.waitForTimeout(MAPS_NO_LISTINGS_RETRY_WAIT_MS);
      placeLinks = await collectMapsListings(page);
    }

    if (placeLinks.length === 0) {
      placeLinks = await collectCurrentPlaceListing(page);
      if (placeLinks.length > 0) {
        await sendEvent({ message: "[MAPS] Search resolved to a direct place detail; extracting current place." });
      }
    }

    if (placeLinks.length === 0) {
      await sendEvent({ message: "[MAPS] No place listings found after retries; skipping Maps scrape." });
      return [];
    }

    await sendEvent({ message: `[MAPS] Listings found: ${placeLinks.length}` });
    await sendEvent({
      message: `[MAPS] Listings with visible website: ${placeLinks.filter((place) => Boolean(place.websiteUrl)).length}`,
    });
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
            // "commit" only means navigation started; the readiness loop
            // below waits for Maps contact fields to settle before extraction.
            await detailPage.waitForSelector("body", { timeout: 8000 }).catch(() => detailPage.waitForTimeout(4000));
            await detailPage.waitForTimeout(MAPS_DETAIL_POLL_MS);

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
  let extractionQuality: ScrapeQualityEvaluation | null = null;

  const buildResult = (abortedResult: boolean): ExecuteScrapeJobResult => ({
    aborted: abortedResult,
    avgScore: leadsFound > 0 ? Math.round(totalScore / leadsFound) : 0,
    leadsFound,
    qualityIssues: extractionQuality?.issues.map((issue) => issue.code),
    qualityStatus: extractionQuality?.status,
    targetsFound: extractionQuality?.metrics.targetsFound,
    targetsWithCategory: extractionQuality?.metrics.targetsWithCategory,
    targetsWithPhone: extractionQuality?.metrics.targetsWithPhone,
    targetsWithRatingReviews: extractionQuality?.metrics.targetsWithRatingReviews,
    targetsWithWebsite: extractionQuality?.metrics.targetsWithWebsite,
    withEmail,
  });

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
      return buildResult(true);
    }

    extractionQuality = evaluateScrapeExtractionQuality({
      targetsFound: targets.length,
      targetsWithCategory: targets.filter((target) => Boolean(normalizeCategory(target.category, input.niche, target.businessName))).length,
      targetsWithPhone: targets.filter((target) => Boolean(target.phone)).length,
      targetsWithRatingReviews: targets.filter((target) => target.rating > 0 || target.reviewCount > 0).length,
      targetsWithWebsite: targets.filter((target) => Boolean(target.website)).length,
    });

    await input.sendEvent({
      message:
        `[QUALITY] scrape=${extractionQuality.status} ` +
        `website=${extractionQuality.metrics.targetsWithWebsite}/${extractionQuality.metrics.targetsFound} ` +
        `category=${extractionQuality.metrics.targetsWithCategory}/${extractionQuality.metrics.targetsFound} ` +
        `phone=${extractionQuality.metrics.targetsWithPhone}/${extractionQuality.metrics.targetsFound}`,
      stats: {
        qualityIssues: extractionQuality.issues.map((issue) => issue.code),
        qualityStatus: extractionQuality.status,
        targetsFound: extractionQuality.metrics.targetsFound,
        targetsWithCategory: extractionQuality.metrics.targetsWithCategory,
        targetsWithPhone: extractionQuality.metrics.targetsWithPhone,
        targetsWithRatingReviews: extractionQuality.metrics.targetsWithRatingReviews,
        targetsWithWebsite: extractionQuality.metrics.targetsWithWebsite,
      },
    });

    for (const issue of extractionQuality.issues) {
      await input.sendEvent({
        message: `[QUALITY] ${issue.severity.toUpperCase()} ${issue.code}: ${issue.detail}`,
      });
    }

    if (extractionQuality.shouldFailJob) {
      throw new ScrapeQualityGateError(extractionQuality);
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

      if (websiteStatus === "ACTIVE") {
        const heuristicAssessment = scoreWebsiteRiskFromSignals({
          category: scoringCategory,
          niche: input.niche,
          rawFootprint,
          targetWebsite: target.website,
        });
        assessment = mergeWebsiteAssessments(assessment, heuristicAssessment);
        for (const fix of heuristicAssessment.topFixes) {
          if (!painSignals.some((signal) => signal.evidence === fix)) {
            painSignals.push({
              evidence: fix,
              severity: 3,
              source: "site_scan",
              type: fix.includes("proof") || fix.includes("reviews") ? "TRUST" : "CONVERSION",
            });
          }
        }
      }

      const contactValidation = {
        ...validateContact(email, target.phone, {
          businessWebsite: target.website,
          ownerName,
        }),
        email,
      };
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
      const preVaultEnrichment = buildPreVaultOutreachEnrichment({
        assessment,
        businessName: target.businessName,
        category: scoringCategory,
        painSignals,
        tacticalNote,
        targetWebsite: target.website,
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
        enrichedAt: new Date(),
        enrichmentData: JSON.stringify(preVaultEnrichment),
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
      return buildResult(true);
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
    await input.sendEvent({
      _done: true,
      stats: {
        avgScore,
        leadsFound,
        qualityIssues: extractionQuality?.issues.map((issue) => issue.code) ?? [],
        qualityStatus: extractionQuality?.status ?? "healthy",
        targetsFound: extractionQuality?.metrics.targetsFound ?? targets.length,
        targetsWithCategory: extractionQuality?.metrics.targetsWithCategory ?? 0,
        targetsWithPhone: extractionQuality?.metrics.targetsWithPhone ?? 0,
        targetsWithRatingReviews: extractionQuality?.metrics.targetsWithRatingReviews ?? 0,
        targetsWithWebsite: extractionQuality?.metrics.targetsWithWebsite ?? 0,
        withEmail,
      },
    });

    return {
      aborted: false,
      avgScore,
      leadsFound,
      qualityIssues: extractionQuality?.issues.map((issue) => issue.code) ?? [],
      qualityStatus: extractionQuality?.status ?? "healthy",
      targetsFound: extractionQuality?.metrics.targetsFound ?? targets.length,
      targetsWithCategory: extractionQuality?.metrics.targetsWithCategory ?? 0,
      targetsWithPhone: extractionQuality?.metrics.targetsWithPhone ?? 0,
      targetsWithRatingReviews: extractionQuality?.metrics.targetsWithRatingReviews ?? 0,
      targetsWithWebsite: extractionQuality?.metrics.targetsWithWebsite ?? 0,
      withEmail,
    };
  } catch (error) {
    if (error instanceof ScrapeCanceledError) {
      aborted = true;
      return buildResult(true);
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





