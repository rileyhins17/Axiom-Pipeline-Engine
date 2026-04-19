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

export const dynamic = 'force-dynamic';

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
    (sequence) => !sequence.hasSentAnyStep && (sequence.state === "QUEUED" || sequence.state === "SENDING"),
  ).length;
  const activeFollowUps = automationOverview.sequences.filter(
    (sequence) => sequence.hasSentAnyStep && (sequence.state === "WAITING" || sequence.state === "SENDING"),
  ).length;
  const blockedFollowUps = automationOverview.sequences.filter(
    (sequence) => sequence.hasSentAnyStep && sequence.state === "BLOCKED",
  ).length;

  const activeRun = scrapeJobs.find((job) => job.status === "running" || job.status === "claimed") ?? null;
  const repliedLeads = leads
    .filter((lead) => lead.outreachStatus === "REPLIED")
    .slice(0, 4);
  const recentSendEvents = automationOverview.recentSent.slice(0, 4);

  const attentionBoard: AttentionBoardItem[] = [
    {
      label: "Intake backlog",
      value: intakeBacklog,
      href: "/hunt",
      detail: "Sourced batch output waiting for handoff",
      action: "Open Lead Generator",
      icon: <Radar className="h-4 w-4 text-cyan-400" />,
    },
    {
      label: "Enrichment backlog",
      value: enrichmentBacklog,
      href: { pathname: "/outreach", query: { stage: "enrichment" } },
      detail: "Records still missing prep before approval",
      action: "Open Enrichment",
      icon: <Brain className="h-4 w-4 text-purple-400" />,
    },
    {
      label: "Ready for first touch",
      value: automationOverview.stats.ready,
      href: { pathname: "/outreach", query: { stage: "initial" } },
      detail: "Approved leads waiting on first-touch action",
      action: "Open Initial Outreach",
      icon: <MailCheck className="h-4 w-4 text-emerald-400" />,
    },
    {
      label: "Blocked follow-ups",
      value: blockedFollowUps,
      href: "/automation",
      detail: "Post-send sequences needing intervention",
      action: "Open Automation",
      icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-[32px] border border-white/[0.06] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-6 py-10 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:px-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <BrandMark
              className="w-full max-w-[360px] border-white/[0.08] bg-black/20 px-8 py-6 shadow-none"
              imageClassName="h-14"
            />
            <p className="mt-6 text-[11px] uppercase tracking-[0.34em] text-emerald-400/80">
              Axiom Pipeline Engine
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Quiet control for the whole lead machine.
            </h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[460px]">
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Lead Generator</div>
              <div className="mt-1 text-sm font-medium text-white">
                {activeRun ? `${activeRun.niche} in ${activeRun.city}` : "Idle"}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {activeRun ? "Run in progress" : "Ready for the next market"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Next scheduled send</div>
              <div className="mt-1 text-sm font-medium text-white">
                {formatRunTime(automationOverview.engine.nextSendAt)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {automationOverview.stats.scheduledToday} scheduled today
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="text-[11px] text-zinc-500">Automation mode</div>
              <div className="mt-1 text-sm font-medium text-white">{automationOverview.engine.mode}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {activeFollowUps} active follow-up sequence{activeFollowUps === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="h-10 rounded-full bg-white px-5 text-sm text-black hover:bg-zinc-200">
            <Link href="/hunt">
              Open Lead Generator
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-10 rounded-full border border-white/10 px-5 text-sm text-white hover:bg-white/[0.04]">
            <Link href="/outreach?stage=enrichment">
              Open Outreach
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-10 rounded-full border border-white/10 px-5 text-sm text-white hover:bg-white/[0.04]">
            <Link href="/automation">
              Open Automation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Intake Backlog" value={intakeBacklog} subtitle="waiting for prep" icon={<Radar />} iconColor="text-cyan-400" className="bg-white/[0.02]" />
        <StatCard label="Enrichment Backlog" value={enrichmentBacklog} subtitle="still before approval" icon={<Brain />} iconColor="text-purple-400" className="bg-white/[0.02]" />
        <StatCard label="Ready for First Touch" value={automationOverview.stats.ready} subtitle="approved pre-send leads" icon={<MailCheck />} iconColor="text-emerald-400" className="bg-white/[0.02]" />
        <StatCard label="First-Touch Queued" value={firstTouchQueued} subtitle="pre-send scheduled work" icon={<MailCheck />} iconColor="text-blue-400" className="bg-white/[0.02]" />
        <StatCard label="Active Follow-Ups" value={activeFollowUps} subtitle="already post-send" icon={<Bot />} iconColor="text-emerald-400" className="bg-white/[0.02]" />
        <StatCard label="Blocked Follow-Ups" value={blockedFollowUps} subtitle="need intervention" icon={<AlertTriangle />} iconColor="text-amber-400" className="bg-white/[0.02]" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Attention Board</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Route the next action</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {attentionBoard.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    {item.icon}
                    {item.label}
                  </div>
                  <div className="text-lg font-semibold text-white">{item.value}</div>
                </div>
                <div className="mt-3 text-sm leading-6 text-zinc-400">{item.detail}</div>
                <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-white/80">
                  {item.action}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-6">
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Recent Activity</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Replies and movement</h2>

          <div className="mt-6 space-y-3">
            {repliedLeads.length === 0 && recentSendEvents.length === 0 ? (
              <div className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-10 text-sm text-zinc-500">
                Recent replies and send activity will surface here once the pipeline starts moving.
              </div>
            ) : (
              <>
                {repliedLeads.map((lead) => (
                  <div key={`reply:${lead.id}`} className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Reply className="h-4 w-4 text-blue-400" />
                      Reply detected
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">
                      {lead.businessName} in {lead.city}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {formatRunTime(lead.lastContactedAt, "Recent")}
                    </div>
                  </div>
                ))}
                {recentSendEvents.map((event) => (
                  <div key={`send:${event.id}`} className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <MailCheck className="h-4 w-4 text-emerald-400" />
                      Automated send landed
                    </div>
                    <div className="mt-2 text-sm text-zinc-300">
                      {event.lead?.businessName || event.recipientEmail}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {formatRunTime(event.sentAt, "Sent recently")}
                    </div>
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
