import { ToastProvider } from "@/components/ui/toast-provider";
import { OutreachHub } from "@/components/outreach/outreach-hub";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { getActiveAutomationLeadIds, listAutomationOverview } from "@/lib/outreach-automation";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function emptyAutomationOverview() {
  return {
    settings: {
      ...AUTOMATION_SETTINGS_DEFAULTS,
    },
    ready: [],
    mailboxes: [],
    sequences: [],
    queued: [],
    active: [],
    finished: [],
    recentSent: [],
    recentRuns: [],
    engine: {
      mode: "ACTIVE",
      nextSendAt: null,
      scheduledToday: 0,
      blockedCount: 0,
      replyStoppedCount: 0,
      readyCount: 0,
      queuedCount: 0,
      waitingCount: 0,
      sendingCount: 0,
    },
    pipeline: {
      needsEnrichment: 0,
      enriching: 0,
      enriched: 0,
      readyForTouch: 0,
    },
    stats: {
      ready: 0,
      queued: 0,
      sending: 0,
      waiting: 0,
      blocked: 0,
      active: 0,
      paused: 0,
      stopped: 0,
      completed: 0,
      replied: 0,
      scheduledToday: 0,
    },
  };
}

function mapStageToTab(stage: string | string[] | undefined) {
  const value = Array.isArray(stage) ? stage[0] : stage;
  if (value === "initial" || value === "ready") return "initial" as const;
  if (value === "log" || value === "sent" || value === "replied") return "log" as const;
  return "prep" as const;
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[] }>;
}) {
  await requireSession();

  const prisma = getPrisma();
  const [overview, activeAutomationLeadIds, leads] = await Promise.all([
    listAutomationOverview().catch(() => emptyAutomationOverview()),
    getActiveAutomationLeadIds().catch(() => []),
    prisma.lead.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        businessName: true,
        city: true,
        niche: true,
        phone: true,
        email: true,
        emailConfidence: true,
        emailFlags: true,
        emailType: true,
        contactName: true,
        axiomScore: true,
        axiomTier: true,
        websiteStatus: true,
        enrichedAt: true,
        enrichmentData: true,
        outreachStatus: true,
        source: true,
        createdAt: true,
        lastUpdated: true,
        outreachNotes: true,
      },
    }),
  ]);

  const automationLeadIds = new Set(activeAutomationLeadIds);
  const stageEligibleLeads = leads.filter((lead) => {
    if (automationLeadIds.has(lead.id)) return false;
    if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
    if (isContactedOutreachStatus(lead.outreachStatus)) return false;
    return true;
  });
  const stages = partitionPreSendLeads(stageEligibleLeads);
  const readyLeads = leads.filter(
    (lead) => lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS && !automationLeadIds.has(lead.id),
  );
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-7xl">
      <ToastProvider>
        <OutreachHub
          initialPrepLeads={JSON.parse(JSON.stringify([...stages.intake, ...stages.enrichment]))}
          initialQualificationLeads={JSON.parse(JSON.stringify(stages.qualification))}
          initialReadyLeads={JSON.parse(JSON.stringify(readyLeads))}
          initialAutomationOverview={JSON.parse(JSON.stringify(overview))}
          initialTab={mapStageToTab(params.stage)}
        />
      </ToastProvider>
    </div>
  );
}
