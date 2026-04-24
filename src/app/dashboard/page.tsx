import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  MailCheck,
  Radar,
  Reply,
  Send,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

function emptyAutomationOverview() {
  return {
    settings: { ...AUTOMATION_SETTINGS_DEFAULTS },
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

type ActionItem = {
  label: string;
  value: number;
  href: Parameters<typeof Link>[0]["href"];
  detail: string;
  action: string;
  icon: ReactNode;
  tone: string;
};

function PipelineStep({
  label,
  value,
  detail,
  href,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  href: Parameters<typeof Link>[0]["href"];
  icon: ReactNode;
  tone: string;
}) {
  return (
    <Link href={href} className="group app-panel-subtle rounded-2xl p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.045]">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-black/20 ${tone}`}>
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-white" />
      </div>
      <div className="mt-5 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm font-medium text-white">{label}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-500">{detail}</div>
    </Link>
  );
}

function ActionCard({ item }: { item: ActionItem }) {
  return (
    <Link href={item.href} className="group app-panel-quiet block rounded-2xl p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.035]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          {item.icon}
          {item.label}
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 font-mono text-xs text-white">
          {item.value}
        </span>
      </div>
      <div className="mt-3 text-sm leading-6 text-zinc-400">{item.detail}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-zinc-300 group-hover:text-white">
        {item.action}
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

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
    (sequence) => !sequence.hasSentAnyStep && (sequence.state === "QUEUED" || sequence.state === "SENDING"),
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
  const totalActiveWork = intakeBacklog + enrichmentBacklog + automationOverview.stats.ready + firstTouchQueued + activeFollowUps;

  const attentionBoard: ActionItem[] = [
    {
      label: "Intake backlog",
      value: intakeBacklog,
      href: "/hunt",
      detail: "Sourced records that still need handoff into the prep pipeline.",
      action: "Open Hunt",
      icon: <Radar className="h-4 w-4 text-cyan-300" />,
      tone: "cyan",
    },
    {
      label: "Needs enrichment",
      value: enrichmentBacklog,
      href: { pathname: "/outreach", query: { stage: "enrichment" } },
      detail: "Leads missing enough context to approve for first touch.",
      action: "Open Outreach",
      icon: <Brain className="h-4 w-4 text-violet-300" />,
      tone: "violet",
    },
    {
      label: "Ready to send",
      value: automationOverview.stats.ready,
      href: { pathname: "/outreach", query: { stage: "initial" } },
      detail: "Approved leads waiting for manual send or automation queueing.",
      action: "Send leads",
      icon: <MailCheck className="h-4 w-4 text-emerald-300" />,
      tone: "emerald",
    },
    {
      label: "Blocked follow-ups",
      value: blockedFollowUps,
      href: "/automation",
      detail: "Post-send sequences that need operator intervention.",
      action: "Resolve issues",
      icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
      tone: "amber",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="app-shell-surface overflow-hidden rounded-[28px] p-5 md:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <BrandMark
              className="border-white/[0.08] bg-black/20 px-5 py-3 shadow-none"
              imageClassName="h-10"
            />
            <p className="app-eyebrow mt-6">Command Center</p>
            <h1 className="app-title mt-3 text-4xl font-semibold md:text-5xl">
              One connected pipeline from sourcing to follow-up.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
              The dashboard now shows the actual operating flow: find leads, verify them, send the first touch, and keep follow-ups moving.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <div className="app-panel-quiet rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Radar className="h-3.5 w-3.5 text-cyan-300" />
                Hunt
              </div>
              <div className="mt-3 text-sm font-semibold text-white">
                {activeRun ? `${activeRun.niche} in ${activeRun.city}` : "Ready"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{activeRun ? "Run in progress" : "No active scrape"}</div>
            </div>
            <div className="app-panel-quiet rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Clock3 className="h-3.5 w-3.5 text-amber-300" />
                Next send
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{formatRunTime(automationOverview.engine.nextSendAt)}</div>
              <div className="mt-1 text-xs text-zinc-500">{automationOverview.stats.scheduledToday} scheduled today</div>
            </div>
            <div className="app-panel-quiet rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Bot className="h-3.5 w-3.5 text-emerald-300" />
                Automation
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{automationOverview.engine.mode}</div>
              <div className="mt-1 text-xs text-zinc-500">{activeFollowUps} active follow-up{activeFollowUps === 1 ? "" : "s"}</div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-4">
          <PipelineStep label="Hunt" value={intakeBacklog} detail="intake waiting" href="/hunt" icon={<Radar className="h-4 w-4" />} tone="border-cyan-400/20 text-cyan-300" />
          <PipelineStep label="Vault" value={leads.length} detail="verified records" href="/vault" icon={<Database className="h-4 w-4" />} tone="border-emerald-400/20 text-emerald-300" />
          <PipelineStep label="Outreach" value={automationOverview.stats.ready} detail="ready first touches" href={{ pathname: "/outreach", query: { stage: "initial" } }} icon={<Send className="h-4 w-4" />} tone="border-amber-400/20 text-amber-300" />
          <PipelineStep label="Automation" value={activeFollowUps} detail="follow-ups active" href="/automation" icon={<Bot className="h-4 w-4" />} tone="border-blue-400/20 text-blue-300" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active Work" value={totalActiveWork} subtitle="open movement across the pipeline" icon={<CheckCircle2 />} iconColor="text-emerald-300" />
        <StatCard label="Needs Prep" value={intakeBacklog + enrichmentBacklog} subtitle="before first-touch approval" icon={<Brain />} iconColor="text-violet-300" />
        <StatCard label="Ready" value={automationOverview.stats.ready} subtitle="approved pre-send leads" icon={<MailCheck />} iconColor="text-cyan-300" />
        <StatCard label="Queued" value={firstTouchQueued} subtitle="first touch scheduled" icon={<Send />} iconColor="text-amber-300" />
        <StatCard label="Blocked" value={blockedFollowUps} subtitle="requires intervention" icon={<AlertTriangle />} iconColor="text-red-300" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="app-panel rounded-[24px] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="app-eyebrow">Action Queue</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">What needs attention next</h2>
            </div>
            <Button asChild className="rounded-full bg-white text-black hover:bg-zinc-200">
              <Link href="/outreach?stage=initial">
                Work ready leads
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {attentionBoard.map((item) => (
              <ActionCard key={item.label} item={item} />
            ))}
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-5">
          <p className="app-eyebrow">Recent Movement</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Replies and sends</h2>

          <div className="mt-5 space-y-3">
            {repliedLeads.length === 0 && recentSendEvents.length === 0 ? (
              <div className="app-panel-quiet rounded-2xl px-4 py-10 text-sm text-zinc-500">
                Pipeline activity will appear here once the first sends and replies land.
              </div>
            ) : (
              <>
                {repliedLeads.map((lead) => (
                  <div key={`reply:${lead.id}`} className="app-panel-quiet rounded-2xl px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Reply className="h-4 w-4 text-blue-300" />
                      Reply detected
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">{lead.businessName} in {lead.city}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatRunTime(lead.lastContactedAt, "Recent")}</div>
                  </div>
                ))}
                {recentSendEvents.map((event) => (
                  <div key={`send:${event.id}`} className="app-panel-quiet rounded-2xl px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <MailCheck className="h-4 w-4 text-emerald-300" />
                      Automated send landed
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">{event.lead?.businessName || event.recipientEmail}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatRunTime(event.sentAt, "Sent recently")}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
