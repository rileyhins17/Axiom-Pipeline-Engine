/**
 * Auto-Pipeline: Autonomous enrichment + qualification + queueing
 *
 * Runs as part of the automation scheduler. Takes leads from intake
 * through enrichment, qualification, and into the send queue without
 * manual intervention.
 *
 * Flow: Hunt (manual) → auto-enrich → auto-qualify → auto-queue → auto-send
 */

import { enrichLead } from "@/lib/outreach-enrichment";
import { hasValidPipelineEmail } from "@/lib/lead-qualification";
import { READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import {
  AUTONOMOUS_QUEUE_BATCH_SIZE,
  shouldAutonomouslyQueueLead,
} from "@/lib/automation-policy";
import {
  createFirstTouchDiagnostics,
  getAutomationReadyLeadSnapshot,
  getAutomationSettings,
  queueLeadsForAutomation,
  type AutomationFirstTouchDiagnostics,
} from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import type { LeadRecord } from "@/lib/prisma";

export type AutoPipelineResult = {
  enriched: number;
  enrichFailed: number;
  qualified: number;
  queued: number;
  queueSkipped: number;
  firstTouchDiagnostics: AutomationFirstTouchDiagnostics;
};

/**
 * Find leads that need enrichment: have email, have score, but no enrichmentData yet.
 */
async function findLeadsNeedingEnrichment(prisma: ReturnType<typeof getPrisma>, limit = 5): Promise<LeadRecord[]> {
  // Over-fetch so in-memory `hasValidPipelineEmail` filtering still leaves us
  // with a full batch. Earlier version fetched `limit` exactly which meant
  // that when the top-N by score were all generic/low-confidence emails the
  // enricher would silently receive zero work.
  const overfetch = Math.max(limit * 5, 100);
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: null,
      enrichmentData: null,
      email: { not: null },
      axiomScore: { not: null },
      firstContactedAt: null,
      isArchived: false,
    },
    orderBy: { axiomScore: "desc" },
    take: overfetch,
  })) as LeadRecord[];

  // Final qualification + cap at the requested batch size.
  return leads
    .filter((lead) => hasValidPipelineEmail(lead) && shouldAutonomouslyQueueLead(lead))
    .slice(0, limit);
}

/**
 * Find enriched leads that qualify for outreach but haven't been marked ready.
 */
async function findLeadsNeedingQualification(prisma: ReturnType<typeof getPrisma>): Promise<LeadRecord[]> {
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: { not: null },
      enrichmentData: { not: null },
      firstContactedAt: null,
      isArchived: false,
    },
    orderBy: { axiomScore: "desc" },
    take: 20,
  })) as LeadRecord[];

  return leads.filter((lead) => lead.enrichmentData && shouldAutonomouslyQueueLead(lead));
}

/**
 * Reset leads stuck in ENRICHING for too long (worker died mid-enrichment).
 * Without this, the "OR ENRICHING" branch of findLeadsNeedingEnrichment keeps
 * re-picking them but they may block forever if enrichLead always times out.
 */
async function resetStuckEnriching(prisma: ReturnType<typeof getPrisma>): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const stuck = (await prisma.lead.findMany({
    where: {
      outreachStatus: "ENRICHING",
      enrichedAt: null,
      isArchived: false,
      OR: [
        { lastUpdated: { lt: cutoff } },
        { lastUpdated: null },
      ],
    },
    select: { id: true },
    take: 200,
  })) as Array<{ id: number }>;

  if (stuck.length === 0) return 0;

  await Promise.all(
    stuck.map((s) =>
      prisma.lead
        .update({ where: { id: s.id }, data: { outreachStatus: "NOT_CONTACTED" } })
        .catch(() => null),
    ),
  );

  return stuck.length;
}

/**
 * Auto-enrich leads using DeepSeek.
 *
 * Parallelized in small chunks so a single cron tick can drain meaningful
 * backlogs (sequential x 10 was topping out ~150s which blows the worker
 * CPU budget and leaves leads stuck ENRICHING).
 */
async function autoEnrich(
  prisma: ReturnType<typeof getPrisma>,
  limit = 30,
  concurrency = 6,
): Promise<{ enriched: number; failed: number }> {
  const leads = await findLeadsNeedingEnrichment(prisma, limit);
  if (leads.length === 0) return { enriched: 0, failed: 0 };

  // Claim all leads as ENRICHING up-front so concurrent cron ticks don't
  // double-process the same ones.
  await Promise.all(
    leads.map((l) =>
      prisma.lead
        .update({ where: { id: l.id }, data: { outreachStatus: "ENRICHING" } })
        .catch(() => null),
    ),
  );

  let enriched = 0;
  let failed = 0;

  const runOne = async (lead: LeadRecord) => {
    try {
      const result = await enrichLead(lead);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          enrichedAt: new Date(),
          enrichmentData: JSON.stringify(result),
          outreachStatus: READY_FOR_FIRST_TOUCH_STATUS,
        },
      });
      enriched++;
    } catch (error) {
      console.error(`[auto-pipeline] Failed to enrich lead ${lead.id}:`, error);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { outreachStatus: "NOT_CONTACTED" },
      }).catch(() => null);
      failed++;
    }
  };

  // Process in windows so we respect rate limits but still push volume
  for (let i = 0; i < leads.length; i += concurrency) {
    const window = leads.slice(i, i + concurrency);
    await Promise.allSettled(window.map(runOne));
  }

  return { enriched, failed };
}

/**
 * Auto-qualify enriched leads (mark them READY_FOR_FIRST_TOUCH).
 */
async function autoQualify(prisma: ReturnType<typeof getPrisma>): Promise<number> {
  const leads = await findLeadsNeedingQualification(prisma);
  let qualified = 0;

  for (const lead of leads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { outreachStatus: READY_FOR_FIRST_TOUCH_STATUS },
    });
    qualified++;
  }

  return qualified;
}

/**
 * Auto-queue qualified leads into the automation engine.
 */
async function autoQueue(
  systemUserId: string,
): Promise<{ queued: number; skipped: number; firstTouchDiagnostics: AutomationFirstTouchDiagnostics }> {
  const prisma = getPrisma();

  // Build from the fully filtered ready set. Taking the top N raw enriched rows
  // first lets generic/already-sent leads repeatedly block lower-scored viable
  // first touches from ever entering the queue.
  const readySnapshot = await getAutomationReadyLeadSnapshot(prisma);
  const readyLeads = readySnapshot.leads;
  const firstTouchDiagnostics = { ...readySnapshot.diagnostics };

  if (readyLeads.length === 0) return { queued: 0, skipped: 0, firstTouchDiagnostics };

  let queued = 0;
  let skipped = 0;
  let cursor = 0;

  while (queued < AUTONOMOUS_QUEUE_BATCH_SIZE && cursor < readyLeads.length) {
    const leadIds = readyLeads
      .slice(cursor, cursor + (AUTONOMOUS_QUEUE_BATCH_SIZE - queued))
      .map((lead) => lead.id);
    cursor += leadIds.length;

    if (leadIds.length === 0) break;

    const result = await queueLeadsForAutomation({
      leadIds,
      queuedByUserId: systemUserId,
    });

    queued += result.queued.length;
    skipped += result.skipped.length;

    if (
      result.queued.length === 0 &&
      result.skipped.some((entry) => entry.reason === "No active mailbox is available right now")
    ) {
      break;
    }
  }

  firstTouchDiagnostics.queuedFirstTouchCount = queued;
  return { queued, skipped, firstTouchDiagnostics };
}

/**
 * Run the full auto-pipeline: enrich → qualify → queue.
 * Called from runAutomationScheduler() before send processing.
 */
export async function runAutoPipeline(systemUserId: string): Promise<AutoPipelineResult> {
  const prisma = getPrisma();
  const settings = await getAutomationSettings(prisma);

  if (settings.emergencyPaused) {
    console.log("[auto-pipeline] Skipped — emergency kill switch is active");
    return {
      enriched: 0,
      enrichFailed: 0,
      qualified: 0,
      queued: 0,
      queueSkipped: 0,
      firstTouchDiagnostics: createFirstTouchDiagnostics(),
    };
  }

  // Step 0: Reset leads that got stuck in ENRICHING from a prior tick that
  // died mid-call (worker CPU timeout, transient upstream failure, etc.).
  const recovered = await resetStuckEnriching(prisma).catch(() => 0);
  if (recovered > 0) {
    console.log(`[auto-pipeline] Recovered ${recovered} stuck ENRICHING leads`);
  }

  // Step 1: Auto-enrich. Processed 6-wide × 30 per tick so a single minute of
  // cron drains up to ~30 leads. A 200-lead backlog clears in ~7 min.
  const { enriched, failed: enrichFailed } = await autoEnrich(prisma, 30, 6);

  // Step 2: Auto-qualify enriched leads
  const qualified = await autoQualify(prisma);

  // Step 3: Auto-queue qualified leads
  const { queued, skipped: queueSkipped, firstTouchDiagnostics } = await autoQueue(systemUserId);
  console.log(`[auto-pipeline] First-touch diagnostics: ${JSON.stringify(firstTouchDiagnostics)}`);

  return {
    enriched,
    enrichFailed,
    qualified,
    queued,
    queueSkipped,
    firstTouchDiagnostics,
  };
}
