import { Brain, Clock3, MailCheck, ShieldCheck } from "lucide-react";

import { OutreachHub } from "@/components/outreach/outreach-hub";
import { ToastProvider } from "@/components/ui/toast-provider";
import { StatCard } from "@/components/ui/stat-card";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { getActiveAutomationLeadIds, listAutomationOverview } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import {
  getContactedOutreachLeadWhere,
  getOutreachPipelineLeadWhere,
  isContactedOutreachStatus,
  READY_FOR_FIRST_TOUCH_STATUS,
} from "@/lib/outreach";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

function emptyAutomationOverview() {
  return {
    settings: {
      enabled: true,
      globalPaused: false,
      sendWindowStartHour: 9,
      sendWindowStartMinute: 0,
      sendWindowEndHour: 16,
      sendWindowEndMinute: 30,
      initialDelayMinMinutes: 10,
      initialDelayMaxMinutes: 45,
      followUp1BusinessDays: 2,
      followUp2BusinessDays: 4,
      schedulerClaimBatch: 4,
      replySyncStaleMinutes: 15,
    },
    ready: [],
    mailboxes: [],
    sequences: [],
    queued: [],
    active: [],
    finished: [],
    recentSent: [],
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
    recentRuns: [],
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

function formatRunTime(value: Date | string | null | undefined) {
  return formatAppDateTime(
    value,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    "No runs recorded yet",
  );
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string }>;
}) {
  await requireSession();

  const prisma = getPrisma();
  const params = (await searchParams) || {};
  const requestedStage = params.stage;
  const initialTab =
    requestedStage === "initial"
        ? "initial"
        : requestedStage === "log"
          ? "log"
          : "prep";

  const automationLeadIds = new Set(await getActiveAutomationLeadIds().catch(() => []));
  const automationOverview = await listAutomationOverview().catch(() => emptyAutomationOverview());

  const allPreSendLeads = await prisma.lead.findMany({
    where: {
      isArchived: false,
    },
    orderBy: {
      createdAt: "desc",
    },
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
  }).catch(() => []);

  const stageEligibleLeads = allPreSendLeads.filter((lead) => {
    if (automationLeadIds.has(lead.id)) return false;
    if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
    if (isContactedOutreachStatus(lead.outreachStatus)) return false;
    return true;
  });
  const preSendStages = partitionPreSendLeads(stageEligibleLeads);
  const enrichmentLeads = [...preSendStages.intake, ...preSendStages.enrichment];
  const qualificationLeads = preSendStages.qualification;
  const prepLeads = [...preSendStages.intake, ...preSendStages.enrichment, ...qualificationLeads];

  const readyLeads = await prisma.lead.findMany({
    where: getOutreachPipelineLeadWhere(),
    orderBy: {
      axiomScore: "desc",
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      niche: true,
      contactName: true,
      phone: true,
      email: true,
      emailConfidence: true,
      emailFlags: true,
      emailType: true,
      axiomScore: true,
      axiomTier: true,
      websiteStatus: true,
      enrichedAt: true,
      enrichmentData: true,
      outreachStatus: true,
      source: true,
      createdAt: true,
      lastUpdated: true,
      outreachChannel: true,
      firstContactedAt: true,
      lastContactedAt: true,
      nextFollowUpDue: true,
      outreachNotes: true,
    },
  }).catch(() => []);

  const initialOutreachLeads = readyLeads.filter((lead) => !automationLeadIds.has(lead.id));

  const contactedLeads = await prisma.lead.findMany({
    where: getContactedOutreachLeadWhere(),
    orderBy: {
      lastContactedAt: "desc",
    },
    select: {
      id: true,
      outreachStatus: true,
      nextFollowUpDue: true,
      businessName: true,
      lastContactedAt: true,
    },
  }).catch(() => []);

  let emailsSentToday = 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    emailsSentToday = await prisma.outreachEmail.count({
      where: {
        sentAt: { gte: today },
        status: "sent",
      },
    });
  } catch {
    // Table may not exist yet.
  }

  const now = Date.now();
  const followUpDue = contactedLeads.filter(
    (lead) => lead.nextFollowUpDue && new Date(lead.nextFollowUpDue).getTime() <= now,
  ).length;
  const intakeBacklog = preSendStages.intake.length;
  const lastRun = automationOverview.recentRuns[0];
  const followUpSequences = automationOverview.sequences.filter((sequence: any) => sequence.hasSentAnyStep);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-6 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-400/80">
              Axiom Pipeline Engine
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Outreach
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Outreach is the simple pre-send console: prep the lead, launch the first touch, then hand it off to Follow-Up.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[440px]">
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Last scheduler run</div>
              <div className="mt-1 text-sm font-medium text-white">
                {lastRun ? lastRun.status : "Idle"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{formatRunTime(lastRun?.startedAt)}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Next send</div>
              <div className="mt-1 text-sm font-medium text-white">
                {formatRunTime(automationOverview.engine.nextSendAt)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">Automation owns post-send timing</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Follow-up due</div>
              <div className="mt-1 text-sm font-medium text-white">{followUpDue}</div>
              <div className="mt-1 text-xs text-zinc-500">manual threads waiting</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Intake Backlog"
          value={intakeBacklog}
          subtitle="sourced leads still entering prep"
          icon={<Brain />}
          iconColor="text-cyan-400"
        />
        <StatCard
          label="Prep Queue"
          value={prepLeads.length}
          subtitle={`${qualificationLeads.length} close to approval`}
          icon={<ShieldCheck />}
          iconColor="text-purple-400"
        />
        <StatCard
          label="Ready for First Touch"
          value={initialOutreachLeads.length}
          subtitle={`${automationOverview.stats.queued} already queued`}
          icon={<MailCheck />}
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Sent Today"
          value={emailsSentToday}
          subtitle={`${followUpSequences.length} follow-up sequences live`}
          icon={<Clock3 />}
          iconColor="text-amber-400"
        />
      </section>

      <ToastProvider>
        <OutreachHub
          initialPrepLeads={JSON.parse(JSON.stringify(prepLeads))}
          initialQualificationLeads={JSON.parse(JSON.stringify(qualificationLeads))}
          initialReadyLeads={JSON.parse(JSON.stringify(initialOutreachLeads))}
          initialAutomationOverview={JSON.parse(JSON.stringify(automationOverview))}
          initialTab={initialTab}
        />
      </ToastProvider>
    </div>
  );
}
