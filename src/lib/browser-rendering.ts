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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dynamicImport(specifier: string): Promise<any> {
  return import(specifier);
}

export async function launchAutomationBrowser(): Promise<AutomationBrowser> {
  const bindings = getCloudflareBindings();

  // Use Cloudflare Browser Rendering if available (CF Workers/Pages)
  if (bindings?.BROWSER) {
    try {
      const { launch } = await dynamicImport("@cloudflare/playwright");
      return launch(bindings.BROWSER);
    } catch {
      // Cloudflare playwright not available — fall through to local
    }
  }

  // Local Playwright — used on Raspberry Pi, dev machines, etc.
  const { chromium } = await dynamicImport("playwright");
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });
}

