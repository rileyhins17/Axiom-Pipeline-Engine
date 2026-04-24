import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  MailCheck,
  Radar,
  Reply,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  OperatorEmptyState,
  OperatorHeader,
  OperatorMetric,
  OperatorMetricGrid,
  OperatorPage,
  OperatorPanel,
  StatusPill,
} from "@/components/ui/operator-page";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

function emptyAutomationOverview() {
  return {
    settings: {
      ...AUTOMATION_SETTINGS_DEFAULTS,
    },
    mailboxes: [],
    ready: [],
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

function formatRunTime(value: Date | string | null | undefined, fallback = "Nothing scheduled") {
  return formatAppDateTime(
    value,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
    fallback,
  );
}

export const dynamic = "force-dynamic";

type AttentionBoardItem = {
  label: string;
  value: number;
  href: Parameters<typeof Link>[0]["href"];
  detail: string;
  action: string;
  icon: ReactNode;
};

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const automationOverview = await listAutomationOverview().catch(() => emptyAutomationOverview());
  const scrapeJobs = await listScrapeJobs(8).catch(() => []);
  const leads = await prisma.lead.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      businessName: true,
      city: true,
      email: true,
      emailConfidence: true,
      emailFlags: true,
      emailType: true,
      axiomScore: true,
      enrichedAt: true,
      enrichmentData: true,
      source: true,
      outreachStatus: true,
      lastContactedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const preSendStages = partitionPreSendLeads(
    leads.filter((lead) => {
      if (isContactedOutreachStatus(lead.outreachStatus)) return false;
      if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
      return true;
    }),
  );

  const intakeBacklog = preSendStages.intake.length;
  const enrichmentBacklog = preSendStages.enrichment.length;
  const firstTouchQueued = automationOverview.sequences.filter(
    (sequence) =>
      !sequence.hasSentAnyStep && (sequence.state === "QUEUED" || sequence.state === "SENDING"),
  ).length;
  const activeFollowUps = automationOverview.sequences.filter(
    (sequence) => sequence.hasSentAnyStep && (sequence.state === "WAITING" || sequence.state === "SENDING"),
  ).length;
  const blockedFollowUps = automationOverview.sequences.filter(
    (sequence) => sequence.hasSentAnyStep && sequence.state === "BLOCKED",
  ).length;

  const activeRun = scrapeJobs.find((job) => job.status === "running" || job.status === "claimed") ?? null;
  const repliedLeads = leads.filter((lead) => lead.outreachStatus === "REPLIED").slice(0, 4);
  const recentSendEvents = automationOverview.recentSent.slice(0, 4);

  const attentionBoard: AttentionBoardItem[] = [
    {
      label: "Intake backlog",
      value: intakeBacklog,
      href: "/hunt",
      detail: "Sourced leads waiting for prep handoff.",
      action: "Open Hunt",
      icon: <Radar className="h-4 w-4 text-cyan-300" />,
    },
    {
      label: "Enrichment backlog",
      value: enrichmentBacklog,
      href: { pathname: "/outreach", query: { stage: "enrichment" } },
      detail: "Records missing enough evidence for first touch.",
      action: "Open Outreach",
      icon: <Brain className="h-4 w-4 text-indigo-300" />,
    },
    {
      label: "Ready first touches",
      value: automationOverview.stats.ready,
      href: { pathname: "/outreach", query: { stage: "initial" } },
      detail: "Qualified leads waiting on manual send or queueing.",
      action: "Open first-touch queue",
      icon: <MailCheck className="h-4 w-4 text-emerald-300" />,
    },
    {
      label: "Blocked follow-ups",
      value: blockedFollowUps,
      href: "/automation",
      detail: "Sequences that need operator intervention.",
      action: "Open Automation",
      icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
    },
  ];

  return (
    <OperatorPage>
      <OperatorHeader
        eyebrow="Axiom Pipeline Engine"
        title="Operations dashboard"
        description="A focused command view for what needs attention now: intake, enrichment, first touch, follow-up health, and recent reply movement."
        status={
          <StatusPill tone={automationOverview.engine.mode === "ACTIVE" ? "success" : "warning"}>
            {automationOverview.engine.mode}
          </StatusPill>
        }
        actions={
          <>
            <Button asChild>
              <Link href="/outreach?stage=initial">
                Open Outreach
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/automation">
                Automation
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] text-muted-foreground">Hunt state</div>
            <div className="mt-2 text-sm font-medium text-white">
              {activeRun ? `${activeRun.niche} in ${activeRun.city}` : "Idle"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {activeRun ? "Run in progress" : "Ready for a new market"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] text-muted-foreground">Next send</div>
            <div className="mt-2 text-sm font-medium text-white">
              {formatRunTime(automationOverview.engine.nextSendAt)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {automationOverview.stats.scheduledToday} scheduled today
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] text-muted-foreground">Follow-up engine</div>
            <div className="mt-2 text-sm font-medium text-white">
              {activeFollowUps} active sequence{activeFollowUps === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {automationOverview.engine.replyStoppedCount} stopped by reply
            </div>
          </div>
        </div>
      </OperatorHeader>

      <OperatorMetricGrid className="xl:grid-cols-6">
        <OperatorMetric label="Intake backlog" value={intakeBacklog} detail="waiting for prep" icon={Radar} tone="info" />
        <OperatorMetric label="Enrichment backlog" value={enrichmentBacklog} detail="before approval" icon={Brain} tone="accent" />
        <OperatorMetric label="Ready first touch" value={automationOverview.stats.ready} detail="qualified leads" icon={MailCheck} tone="success" />
        <OperatorMetric label="Queued first touch" value={firstTouchQueued} detail="scheduled pre-send" icon={MailCheck} tone="info" />
        <OperatorMetric label="Active follow-ups" value={activeFollowUps} detail="post-send sequences" icon={Bot} tone="success" />
        <OperatorMetric label="Blocked follow-ups" value={blockedFollowUps} detail="needs operator review" icon={AlertTriangle} tone={blockedFollowUps > 0 ? "warning" : "neutral"} />
      </OperatorMetricGrid>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <OperatorPanel
          title="Attention board"
          description="Open the highest-leverage queue instead of hunting through analytics."
          contentClassName="grid gap-3 md:grid-cols-2"
        >
          {attentionBoard.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="operator-focus rounded-xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-white/15 hover:bg-white/[0.035]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  {item.icon}
                  {item.label}
                </div>
                <div className="text-xl font-semibold text-white">{item.value}</div>
              </div>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-zinc-200">
                {item.action}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </OperatorPanel>

        <OperatorPanel title="Recent movement" description="Replies and sent activity that change operator priorities.">
          <div className="flex flex-col gap-3">
            {repliedLeads.length === 0 && recentSendEvents.length === 0 ? (
              <OperatorEmptyState
                title="No recent activity"
                description="Replies and sent emails will appear here once the pipeline starts moving."
                icon={Reply}
              />
            ) : (
              <>
                {repliedLeads.map((lead) => (
                  <div key={`reply:${lead.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Reply className="h-4 w-4 text-cyan-300" />
                      Reply detected
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">
                      {lead.businessName} in {lead.city}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatRunTime(lead.lastContactedAt, "Recent")}
                    </div>
                  </div>
                ))}
                {recentSendEvents.map((event) => (
                  <div key={`send:${event.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <MailCheck className="h-4 w-4 text-emerald-300" />
                      Email sent
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">
                      {event.lead?.businessName || event.recipientEmail}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatRunTime(event.sentAt, "Sent recently")}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </OperatorPanel>
      </section>
    </OperatorPage>
  );
}
