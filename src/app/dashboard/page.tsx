import Link from "next/link";
import type { Route } from "next";
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

import { StatCard } from "@/components/ui/stat-card";
import { createEmptyAutomationOverview } from "@/lib/automation-overview";
import { buildAutomationHref } from "@/lib/outbound-navigation";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { resolveLeadWebsiteUrl } from "@/lib/lead-website";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

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

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const automationOverview = await listAutomationOverview().catch(() => createEmptyAutomationOverview());
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
      !sequence.hasSentAnyStep &&
      (sequence.state === "QUEUED" || sequence.state === "SENDING"),
  ).length;
  const activeFollowUps = automationOverview.sequences.filter(
    (sequence) =>
      sequence.hasSentAnyStep &&
      (sequence.state === "WAITING" || sequence.state === "SENDING"),
  ).length;
  const blockedFollowUps = automationOverview.sequences.filter(
    (sequence) => sequence.hasSentAnyStep && sequence.state === "BLOCKED",
  ).length;

  const activeRun = scrapeJobs.find((job) => job.status === "running" || job.status === "claimed") ?? null;
  const repliedLeads = leads
    .filter((lead) => lead.outreachStatus === "REPLIED")
    .slice(0, 4);
  const recentSendEvents = automationOverview.recentSent.slice(0, 4);

  const attentionBoard: Array<{
    label: string;
    value: number;
    href: Route;
    detail: string;
    action: string;
    icon: ReactNode;
  }> = [
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
      href: buildAutomationHref({ tab: "overview" }) as Route,
      detail: "Records still missing prep before approval",
      action: "Open Outbound",
      icon: <Brain className="h-4 w-4 text-purple-400" />,
    },
    {
      label: "Ready for first touch",
      value: automationOverview.stats.ready,
      href: buildAutomationHref({ tab: "queue", filter: "initial" }) as Route,
      detail: "Approved leads waiting on first-touch action",
      action: "Open Queue",
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
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Compact status header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Operations</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Pipeline health and next actions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs">
            <span className="text-zinc-500">Engine</span>
            <span className={`font-mono font-medium ${automationOverview.engine.mode === "ACTIVE" ? "text-emerald-400" : "text-amber-400"}`}>
              {automationOverview.engine.mode}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs">
            <span className="text-zinc-500">Next send</span>
            <span className="font-mono font-medium text-white">
              {formatRunTime(automationOverview.engine.nextSendAt, "—")}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs">
            <span className="text-zinc-500">Source</span>
            <span className="font-medium text-white">
              {activeRun ? `${activeRun.niche} · ${activeRun.city}` : "Idle"}
            </span>
          </div>
        </div>
      </div>

      {/* Pipeline stats */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Intake Backlog" value={intakeBacklog} subtitle="waiting for prep" icon={<Radar />} iconColor="text-zinc-400" className="bg-white/[0.02]" />
        <StatCard label="Enrichment Backlog" value={enrichmentBacklog} subtitle="still before approval" icon={<Brain />} iconColor="text-zinc-400" className="bg-white/[0.02]" />
        <StatCard label="Ready for First Touch" value={automationOverview.stats.ready} subtitle="approved pre-send leads" icon={<MailCheck />} iconColor="text-emerald-400" className="bg-white/[0.02]" />
        <StatCard label="First-Touch Queued" value={firstTouchQueued} subtitle="scheduled work" icon={<MailCheck />} iconColor="text-zinc-400" className="bg-white/[0.02]" />
        <StatCard label="Active Follow-Ups" value={activeFollowUps} subtitle="post-send" icon={<Bot />} iconColor="text-zinc-400" className="bg-white/[0.02]" />
        <StatCard label="Blocked Follow-Ups" value={blockedFollowUps} subtitle="need intervention" icon={<AlertTriangle />} iconColor="text-amber-400" className="bg-white/[0.02]" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">Attention board</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Route the next action</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attentionBoard.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg border border-white/[0.06] bg-black/20 p-3.5 transition-colors hover:border-white/[0.10] hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    {item.icon}
                    {item.label}
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-white">{item.value}</div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">{item.detail}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  {item.action}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Replies and movement</p>

          <div className="mt-4 space-y-2">
            {repliedLeads.length === 0 && recentSendEvents.length === 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-8 text-center text-xs text-zinc-600">
                Activity will surface here once the pipeline starts moving.
              </div>
            ) : (
              <>
                {repliedLeads.map((lead) => (
                  <div key={`reply:${lead.id}`} className="rounded-lg border border-white/[0.06] bg-black/20 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Reply className="h-3.5 w-3.5 text-blue-400" />
                      Reply detected
                    </div>
                    <div className="mt-1.5 text-xs text-zinc-400">
                      {(() => {
                        const websiteUrl = resolveLeadWebsiteUrl(lead);
                        return websiteUrl ? (
                          <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="transition-colors hover:text-cyan-300"
                            title={websiteUrl}
                          >
                            {lead.businessName}
                          </a>
                        ) : (
                          <>{lead.businessName}</>
                        );
                      })()} in {lead.city}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      {formatRunTime(lead.lastContactedAt, "Recent")}
                    </div>
                  </div>
                ))}
                {recentSendEvents.map((event) => (
                  <div key={`send:${event.id}`} className="rounded-lg border border-white/[0.06] bg-black/20 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <MailCheck className="h-3.5 w-3.5 text-emerald-400" />
                      Send landed
                    </div>
                    <div className="mt-1.5 text-xs text-zinc-400">
                      {(() => {
                        const websiteUrl = resolveLeadWebsiteUrl(event.lead);
                        const leadName = event.lead?.businessName || event.recipientEmail;
                        return websiteUrl ? (
                          <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="transition-colors hover:text-cyan-300"
                            title={websiteUrl}
                          >
                            {leadName}
                          </a>
                        ) : (
                          <>{leadName}</>
                        );
                      })()}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
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
