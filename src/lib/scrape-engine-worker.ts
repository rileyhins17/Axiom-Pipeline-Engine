export type { ExecuteScrapeJobInput, ExecuteScrapeJobResult } from "./scrape-engine";

export async function executeScrapeJob(...args: any[]) {
  const engine = (await import("./scrape-engine")) as any;
  return engine.executeScrapeJob(...args);
}
