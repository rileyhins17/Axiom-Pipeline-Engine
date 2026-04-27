import { getCloudflareBindings } from "@/lib/cloudflare";

export interface AutomationLocator {
  click(): Promise<void>;
  evaluateAll<TResult>(pageFunction: (elements: any[]) => TResult): Promise<TResult>;
}

export interface AutomationPage {
  close(): Promise<void>;
  evaluate<TResult>(pageFunction: (...args: any[]) => TResult, arg?: any): Promise<TResult>;
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

type CloudflareBrowserRegistry = Record<string, unknown>;

async function loadCloudflarePlaywright() {
  return import("@cloudflare/playwright");
}

async function loadLocalPlaywright() {
  const runtimeImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("playwright")>;

  return runtimeImport("playwright");
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
      const globalScope = globalThis as typeof globalThis & {
        __cloudflareBrowserBindings?: CloudflareBrowserRegistry;
      };
      globalScope.__cloudflareBrowserBindings ??= {};
      globalScope.__cloudflareBrowserBindings.BROWSER = bindings.BROWSER;

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
