import "server-only";

import { getCloudflareBindings } from "@/lib/cloudflare";

export interface AutomationLocator {
  evaluateAll<TResult>(pageFunction: (elements: any[]) => TResult): Promise<TResult>;
}

export interface AutomationPage {
  close(): Promise<void>;
  evaluate<TResult>(pageFunction: () => TResult): Promise<TResult>;
  goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
  locator(selector: string): AutomationLocator;
  url(): string;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
}

export interface AutomationBrowserContext {
  close(): Promise<void>;
  newPage(): Promise<AutomationPage>;
}

export interface AutomationBrowser {
  close(): Promise<void>;
  newContext(options?: { locale?: string }): Promise<AutomationBrowserContext>;
}

async function loadCloudflarePlaywright() {
  return import("@cloudflare/playwright");
}

async function loadLocalPlaywright() {
  return import("playwright");
}

function getLocalChromiumLaunchOptions() {
  if (process.platform === "win32") {
    return {
      headless: true,
    };
  }

  return {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };
}

export async function launchAutomationBrowser(): Promise<AutomationBrowser> {
  const bindings = getCloudflareBindings();

  // Use Cloudflare Browser Rendering if available (CF Workers/Pages).
  if (bindings?.BROWSER) {
    try {
      const { launch } = await loadCloudflarePlaywright();
      return launch(bindings.BROWSER);
    } catch {
      // Cloudflare Playwright is unavailable, so fall back to local Playwright.
    }
  }

  // Local Playwright is used on Windows dev machines and other Node runtimes.
  const { chromium } = await loadLocalPlaywright();
  return chromium.launch(getLocalChromiumLaunchOptions());
}
