import { strict as assert } from "node:assert";
import test from "node:test";

import {
  compareScrapeTargetCandidates,
  getScrapeTargetPriorityBand,
  normalizeScrapeTargetNiche,
  type ScrapeTargetCandidate,
} from "./scrape-targets";

function makeCandidate(overrides: Partial<ScrapeTargetCandidate> & Pick<ScrapeTargetCandidate, "id">) {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const { id, ...rest } = overrides;

  return {
    id,
    niche: "electrician",
    city: "Toronto",
    region: "ON",
    country: "CA",
    radius: "15",
    maxDepth: 6,
    active: true,
    lastRunAt: now,
    lastJobId: "job-1",
    totalRuns: 3,
    totalLeadsFound: 0,
    createdAt: now,
    updatedAt: now,
    adequateLeadCount: 0,
    lastJobStatus: "completed",
    lastJobLeadsFound: 0,
    lastJobWithEmail: 0,
    ...rest,
  } satisfies ScrapeTargetCandidate;
}

test("scrape target normalization matches proven historical lead groups", () => {
  assert.equal(normalizeScrapeTargetNiche("Roofers"), normalizeScrapeTargetNiche("roofing"));
  assert.equal(normalizeScrapeTargetNiche("Electricians"), normalizeScrapeTargetNiche("electrician"));
  assert.equal(normalizeScrapeTargetNiche("Med-Spas"), normalizeScrapeTargetNiche("medical spa"));
});

test("scrape target selection ranks proven adequate groups above stale zero-email targets", () => {
  const staleZeroEmail = makeCandidate({
    id: "stale-zero-email",
    niche: "electrician",
    city: "Calgary",
    totalRuns: 6,
    totalLeadsFound: 0,
    lastJobLeadsFound: 24,
    lastJobWithEmail: 0,
  });
  const provenInitialSource = makeCandidate({
    id: "proven-initial-source",
    niche: "Roofers",
    city: "Waterloo",
    adequateLeadCount: 10,
    totalRuns: 4,
    totalLeadsFound: 30,
    lastJobLeadsFound: 12,
    lastJobWithEmail: 4,
  });

  const ordered = [staleZeroEmail, provenInitialSource].sort(compareScrapeTargetCandidates);

  assert.equal(getScrapeTargetPriorityBand(provenInitialSource), 0);
  assert.equal(ordered[0].id, provenInitialSource.id);
});

test("scrape target selection cools down recently failed proven targets", () => {
  const recentlyFailed = makeCandidate({
    id: "recently-failed",
    niche: "Custom Cabinetry",
    city: "Guelph",
    adequateLeadCount: 11,
    lastJobStatus: "failed",
    lastRunAt: new Date(),
  });
  const nextProvenTarget = makeCandidate({
    id: "next-proven-target",
    niche: "Roofers",
    city: "Waterloo",
    adequateLeadCount: 10,
    lastJobStatus: "completed",
    lastRunAt: null,
    totalRuns: 0,
  });

  const ordered = [recentlyFailed, nextProvenTarget].sort(compareScrapeTargetCandidates);

  assert.equal(getScrapeTargetPriorityBand(recentlyFailed), 7);
  assert.equal(ordered[0].id, nextProvenTarget.id);
});
