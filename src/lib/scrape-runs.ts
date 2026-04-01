import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

type StartScrapeRunInput = {
  actorUserId: string;
  city: string;
  metadata?: Record<string, unknown>;
  niche: string;
};

function serializeMetadata(metadata?: Record<string, unknown>): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  return JSON.stringify(metadata);
}

export async function startScrapeRun(input: StartScrapeRunInput) {
  const prisma = getPrisma();
  const env = getServerEnv();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - env.SCRAPE_TIMEOUT_MS);

  await prisma.scrapeRun.updateMany({
    where: {
      finishedAt: null,
      startedAt: { lt: staleBefore },
      status: "running",
    },
    data: {
      errorMessage: "Scrape timed out and was released automatically.",
      finishedAt: now,
      status: "timed_out",
    },
  });

  const activeCount = await prisma.scrapeRun.count({
    where: {
      finishedAt: null,
      status: "running",
    },
  });

  if (activeCount >= env.SCRAPE_CONCURRENCY_LIMIT) {
    return null;
  }

  return prisma.scrapeRun.create({
    data: {
      actorUserId: input.actorUserId,
      city: input.city,
      metadata: serializeMetadata(input.metadata),
      niche: input.niche,
      status: "running",
    },
  });
}

export async function finishScrapeRun(input: {
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  runId: string;
  status: string;
}) {
  try {
    const prisma = getPrisma();
    await prisma.scrapeRun.update({
      where: { id: input.runId },
      data: {
        errorMessage: input.errorMessage ?? null,
        finishedAt: new Date(),
        metadata: serializeMetadata(input.metadata),
        status: input.status,
      },
    });
  } catch (error) {
    console.error("[SCRAPE_RUN_UPDATE_FAILED]", error);
  }
}
