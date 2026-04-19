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
import { isLeadOutreachEligible, hasValidPipelineEmail } from "@/lib/lead-qualification";
import { READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import {
  AUTONOMOUS_QUEUE_BATCH_SIZE,
  shouldAutonomouslyQueueLead,
} from "@/lib/automation-policy";
import { queueLeadsForAutomation } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import type { LeadRecord } from "@/lib/prisma";

export type AutoPipelineResult = {
  enriched: number;
  enrichFailed: number;
  qualified: number;
  queued: number;
  queueSkipped: number;
};

/**
 * Find leads that need enrichment: have email, have score, but no enrichmentData yet.
 */
async function findLeadsNeedingEnrichment(prisma: ReturnType<typeof getPrisma>, limit = 5): Promise<LeadRecord[]> {
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: null,
      enrichmentData: null,
      email: { not: null },
      axiomScore: { not: null },
      isArchived: false,
      outreachStatus: { in: ["NOT_CONTACTED", "ENRICHING"] },
    },
    orderBy: { axiomScore: "desc" },
    take: limit,
  })) as LeadRecord[];

  // Only enrich leads with valid pipeline emails
  return leads.filter((lead) => hasValidPipelineEmail(lead));
}

/**
 * Find enriched leads that qualify for outreach but haven't been marked ready.
 */
async function findLeadsNeedingQualification(prisma: ReturnType<typeof getPrisma>): Promise<LeadRecord[]> {
  const leads = (await prisma.lead.findMany({
    where: {
      enrichedAt: { not: null },
      enrichmentData: { not: null },
      isArchived: false,
      outreachStatus: { in: ["NOT_CONTACTED", "ENRICHING", "ENRICHED"] },
    },
    orderBy: { axiomScore: "desc" },
    take: 20,
  })) as LeadRecord[];

  return leads.filter((lead) => isLeadOutreachEligible(lead));
}

/**
 * Auto-enrich leads using OpenRouter/DeepSeek.
 */
async function autoEnrich(prisma: ReturnType<typeof getPrisma>, limit = 3): Promise<{ enriched: number; failed: number }> {
  const leads = await findLeadsNeedingEnrichment(prisma, limit);
  let enriched = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      // Mark as enriching
      await prisma.lead.update({
        where: { id: lead.id },
        data: { outreachStatus: "ENRICHING" },
      });

      const result = await enrichLead(lead);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          enrichedAt: new Date(),
          enrichmentData: JSON.stringify(result),
          outreachStatus: "ENRICHED",
        },
      });
      enriched++;
    } catch (error) {
      console.error(`[auto-pipeline] Failed to enrich lead ${lead.id}:`, error);
      // Revert status on failure
      await prisma.lead.update({
        where: { id: lead.id },
        data: { outreachStatus: "NOT_CONTACTED" },
      }).catch(() => null);
      failed++;
    }
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
async function autoQueue(systemUserId: string): Promise<{ queued: number; skipped: number }> {
  const prisma = getPrisma();

  // Find leads that are READY_FOR_FIRST_TOUCH but not yet in a sequence
  const readyLeads = (await prisma.lead.findMany({
    where: {
      outreachStatus: READY_FOR_FIRST_TOUCH_STATUS,
      isArchived: false,
      enrichmentData: { not: null },
    },
    orderBy: { axiomScore: "desc" },
    take: AUTONOMOUS_QUEUE_BATCH_SIZE,
  })) as LeadRecord[];

  if (readyLeads.length === 0) return { queued: 0, skipped: 0 };

  const existing = await prisma.outreachSequence.findMany({
    where: {
      leadId: { in: readyLeads.map((l) => l.id) },
      status: { notIn: ["STOPPED", "FAILED"] },
    },
    select: { leadId: true },
  });
  const activeLeadIds = new Set(existing.map((s) => s.leadId));

  const eligibleIds = readyLeads
    .filter((lead) => !activeLeadIds.has(lead.id) && shouldAutonomouslyQueueLead(lead))
    .map((lead) => lead.id);

  if (eligibleIds.length === 0) return { queued: 0, skipped: 0 };

  const result = await queueLeadsForAutomation({
    leadIds: eligibleIds,
    queuedByUserId: systemUserId,
  });

  return { queued: result.queued.length, skipped: result.skipped.length };
}

/**
 * Run the full auto-pipeline: enrich → qualify → queue.
 * Called from runAutomationScheduler() before send processing.
 */
export async function runAutoPipeline(systemUserId: string): Promise<AutoPipelineResult> {
  const prisma = getPrisma();

  // Step 1: Auto-enrich (limit to 3 per run to stay within API budget)
  const { enriched, failed: enrichFailed } = await autoEnrich(prisma, 3);

  // Step 2: Auto-qualify enriched leads
  const qualified = await autoQualify(prisma);

  // Step 3: Auto-queue qualified leads
  const { queued, skipped: queueSkipped } = await autoQueue(systemUserId);

  return {
    enriched,
    enrichFailed,
    qualified,
    queued,
    queueSkipped,
  };
}
