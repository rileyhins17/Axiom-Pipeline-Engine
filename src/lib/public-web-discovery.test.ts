import { strict as assert } from "node:assert";
import test from "node:test";

import type { AutomationBrowserContext, AutomationLocator, AutomationPage } from "./browser-rendering";
import { collectWebsiteDiscoveryPages } from "./public-web-discovery";

type Snapshot = {
  text: string;
  links: Array<{ href: string; text?: string }>;
};

class FakeLocator implements AutomationLocator {
  async click() {}
  async count(): Promise<number> {
    return 0;
  }
  async evaluateAll<TResult>(): Promise<TResult> {
    return [] as TResult;
  }
  first(): AutomationLocator {
    return this;
  }
  async getAttribute(): Promise<string | null> {
    return null;
  }
  locator(): AutomationLocator {
    return this;
  }
  nth(): AutomationLocator {
    return this;
  }
  async textContent(): Promise<string | null> {
    return null;
  }
}

class FakePage implements AutomationPage {
  public navigatedTo = "";
  public settled = 0;

  constructor(private readonly snapshot: Snapshot) {}

  async close() {}

  async evaluate<TResult>(): Promise<TResult> {
    return this.snapshot as TResult;
  }

  async goto(url: string): Promise<unknown> {
    this.navigatedTo = url;
    return null;
  }

  locator(): AutomationLocator {
    return new FakeLocator();
  }

  url(): string {
    return this.navigatedTo;
  }

  async waitForSelector(): Promise<unknown> {
    return null;
  }

  async waitForTimeout(): Promise<void> {
    this.settled++;
  }
}

class FakeContext implements AutomationBrowserContext {
  public readonly pages: FakePage[];

  constructor(snapshots: Snapshot[]) {
    this.pages = snapshots.map((snapshot) => new FakePage(snapshot));
  }

  async close() {}

  async newPage(): Promise<AutomationPage> {
    const page = this.pages.find((candidate) => !candidate.navigatedTo);
    if (!page) throw new Error("No fake pages left");
    return page;
  }
}

test("collectWebsiteDiscoveryPages scans four relevant subpages and lets pages settle", async () => {
  const homepageLinks = [
    { href: "https://example.ca/contact", text: "Contact" },
    { href: "https://example.ca/request-a-quote", text: "Request a quote" },
    { href: "https://example.ca/team", text: "Team" },
    { href: "https://example.ca/about", text: "About" },
    { href: "https://example.ca/privacy", text: "Privacy" },
  ];
  const context = new FakeContext([
    { text: "Example homepage", links: homepageLinks },
    { text: "Contact page sarah@example.ca", links: [] },
    { text: "Quote page", links: [] },
    { text: "Team page", links: [] },
    { text: "About page", links: [] },
  ]);
  const events: string[] = [];

  const result = await collectWebsiteDiscoveryPages(context, "https://example.ca", (event) => {
    if (event.message) events.push(event.message);
  });

  assert.equal(result.pages.length, 5);
  assert.equal(events.length, 4);
  assert.equal(context.pages.filter((page) => page.settled > 0).length, 5);
  assert.deepEqual(
    new Set(result.pages.slice(1).map((page) => page.url)),
    new Set([
      "https://example.ca/contact",
      "https://example.ca/request-a-quote",
      "https://example.ca/team",
      "https://example.ca/about",
    ]),
  );
});
