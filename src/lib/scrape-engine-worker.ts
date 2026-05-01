export type { ExecuteScrapeJobInput, ExecuteScrapeJobResult } from "./scrape-engine";

type ScrapeEngineModule = typeof import("./scrape-engine");

export async function executeScrapeJob(
  ...args: Parameters<ScrapeEngineModule["executeScrapeJob"]>
): Promise<Awaited<ReturnType<ScrapeEngineModule["executeScrapeJob"]>>> {
  const engine: ScrapeEngineModule = await import("./scrape-engine");
  return engine.executeScrapeJob(...args);
}
