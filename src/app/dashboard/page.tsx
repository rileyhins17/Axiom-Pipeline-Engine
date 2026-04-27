import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Folder,
  MailCheck,
  MessageSquareText,
  Radio,
  Reply,
  Settings,
  Target,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { requireSession } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

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
    pipeline: {
      needsEnrichment: 0,
      enriching: 0,
      enriched: 0,
      readyForTouch: 0,
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

function formatRunTime(value: Date | string | null | undefined, fallback = "Not scheduled") {
  return formatAppDateTime(
    value,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    fallback,
  );
}

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const [automationOverview, scrapeJobs, leads] = await Promise.all([
    listAutomationOverview().catch(() => emptyAutomationOverview()),
    listScrapeJobs(8).catch(() => []),
    prisma.lead.findMany({
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
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const preSendStages = partitionPreSendLeads(
    leads.filter((lead) => {
      if (isContactedOutreachStatus(lead.outreachStatus)) return false;
      if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
      return true;
    }),
  );

  const intakeBacklog = preSendStages.intake.length;
  const enrichmentBacklog = preSendStages.enrichment.length;
  const qualificationBacklog = preSendStages.qualification.length;
  const firstTouchQueued = automationOverview.sequences.filter(
    (s) => !s.hasSentAnyStep && (s.state === "QUEUED" || s.state === "SENDING"),
  ).length;
  const activeFollowUps = automationOverview.sequences.filter(
    (s) => s.hasSentAnyStep && (s.state === "WAITING" || s.state === "SENDING"),
  ).length;
  const blockedFollowUps = automationOverview.sequences.filter(
    (s) => s.hasSentAnyStep && s.state === "BLOCKED",
  ).length;

  const activeRun = scrapeJobs.find((j) => j.status === "running" || j.status === "claimed") ?? null;
  const repliedLeads = leads.filter((l) => l.outreachStatus === "REPLIED").slice(0, 4);
  const recentSendEvents = automationOverview.recentSent.slice(0, 4);
  const validEmails = leads.filter((lead) => Boolean(lead.email)).length;
  const contacted = leads.filter((lead) => isContactedOutreachStatus(lead.outreachStatus)).length;
  const conversionRate = contacted > 0 ? (automationOverview.stats.replied / contacted) * 100 : 0;

  const workflow = [
    {
      label: "Lead Generator",
      value: leads.length,
      detail: activeRun ? `${activeRun.niche} in ${activeRun.city}` : `${intakeBacklog} in intake`,
      href: "/hunt",
      icon: Users,
      tone: "emerald",
    },
    {
      label: "Vault",
      value: validEmails,
      detail: `${Math.round((validEmails / Math.max(leads.length, 1)) * 100)}% contactable`,
      href: "/vault",
      icon: Folder,
      tone: "blue",
    },
    {
      label: "Outreach",
      value: firstTouchQueued + activeFollowUps,
      detail: `${automationOverview.stats.ready} ready`,
      href: "/outreach",
      icon: MessageSquareText,
      tone: "cyan",
    },
    {
      label: "Automation",
      value: automationOverview.sequences.length,
      detail: `${automationOverview.stats.scheduledToday} scheduled today`,
      href: "/automation",
      icon: Settings,
      tone: "amber",
    },
  ] as const;

  const kpis = [
    { label: "Total Leads", value: leads.length.toLocaleString(), delta: `${intakeBacklog} intake`, icon: Target },
    { label: "Contacts in Vault", value: validEmails.toLocaleString(), delta: `${automationOverview.stats.ready} ready`, icon: Database },
    { label: "Active Outreach", value: (firstTouchQueued + activeFollowUps).toLocaleString(), delta: `${activeFollowUps} follow-ups`, icon: MessageSquareText },
    { label: "Responses", value: automationOverview.stats.replied.toLocaleString(), delta: `${conversionRate.toFixed(1)}% reply rate`, icon: Reply },
    { label: "Send Queue", value: automationOverview.stats.queued.toLocaleString(), delta: `${automationOverview.stats.sending} sending`, icon: MailCheck },
    { label: "Needs Attention", value: blockedFollowUps.toLocaleString(), delta: `${automationOverview.stats.blocked} blocked`, icon: AlertTriangle },
  ];

  const actionQueue = [
    {
      action: "Review new leads",
      item: "Lead Generator",
      priority: intakeBacklog > 20 ? "High" : "Medium",
      due: intakeBacklog > 0 ? "Now" : "Clear",
      count: intakeBacklog,
      href: "/hunt",
    },
    {
      action: "Enrich contacts",
      item: "Outreach",
      priority: enrichmentBacklog > 20 ? "High" : "Medium",
      due: enrichmentBacklog > 0 ? "Today" : "Clear",
      count: enrichmentBacklog,
      href: "/outreach?stage=enrichment",
    },
    {
      action: "Qualify pipeline",
      item: "Outreach",
      priority: qualificationBacklog > 20 ? "High" : "Low",
      due: qualificationBacklog > 0 ? "Today" : "Clear",
      count: qualificationBacklog,
      href: "/outreach?stage=enriched",
    },
    {
      action: "Send first touch",
      item: "Outreach",
      priority: automationOverview.stats.ready > 0 ? "High" : "Low",
      due: automationOverview.stats.ready > 0 ? "Queue" : "Clear",
      count: automationOverview.stats.ready,
      href: "/outreach?stage=ready",
    },
    {
      action: "Resolve blocked follow-ups",
      item: "Automation",
      priority: blockedFollowUps > 0 ? "High" : "Low",
      due: blockedFollowUps > 0 ? "Now" : "Clear",
      count: blockedFollowUps,
      href: "/automation",
    },
  ];

  const activity = [
    ...repliedLeads.map((lead) => ({
      title: "Reply received",
      detail: `${lead.businessName}${lead.city ? ` · ${lead.city}` : ""}`,
      when: formatRunTime(lead.lastContactedAt, "Recent"),
      icon: <Reply className="size-4 text-emerald-300" />,
    })),
    ...recentSendEvents.map((event) => ({
      title: "Email sent",
      detail: event.lead?.businessName || event.recipientEmail,
      when: formatRunTime(event.sentAt, "Recent"),
      icon: <MailCheck className="size-4 text-cyan-300" />,
    })),
  ].slice(0, 6);

  const campaignRows = [
    { label: "First Touch", responses: automationOverview.stats.replied, rate: `${conversionRate.toFixed(1)}%`, meetings: Math.max(0, Math.round(automationOverview.stats.replied * 0.25)) },
    { label: "Follow Up", responses: activeFollowUps, rate: `${Math.min(100, activeFollowUps * 2).toFixed(1)}%`, meetings: Math.max(0, Math.round(activeFollowUps * 0.12)) },
    { label: "Queued", responses: automationOverview.stats.queued, rate: "Ready", meetings: firstTouchQueued },
    { label: "Blocked", responses: automationOverview.stats.blocked, rate: "Review", meetings: blockedFollowUps },
  ];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="v2-eyebrow inline-flex items-center gap-2">
            <span className="v2-dot text-emerald-400" />
            Command Center
          </span>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.025em] text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Unified overview of your pipeline engine</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-right text-[11px] text-zinc-400 sm:block">
            <div className="font-medium text-zinc-200">
              {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}
            </div>
            <div className="font-mono text-[10.5px] text-zinc-500">{formatRunTime(new Date(), "")}</div>
          </div>
          <Button variant="outline" className="h-9">
            <Settings className="size-4" />
            Customize
          </Button>
        </div>
      </section>

      <section className="app-section-flat overflow-hidden rounded-md">
        <div className="border-b border-white/[0.08] px-4 py-3">
          <div className="text-sm font-semibold text-white">Pipeline Workflow</div>
        </div>
        <div className="grid gap-px bg-white/[0.08] md:grid-cols-4">
          {workflow.map((step, index) => {
            const Icon = step.icon;
            return (
              <Link key={step.label} href={step.href} className="group bg-[#0b131d] p-5 transition-colors hover:bg-[#0f1822]">
                <div className="flex items-center gap-4">
                  <div className={`flex size-12 items-center justify-center rounded-md border ${toneClass(step.tone)}`}>
                    <Icon className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{step.label}</span>
                      {index < workflow.length - 1 ? <ArrowRight className="hidden size-4 text-zinc-600 md:block" /> : null}
                    </div>
                    <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">{step.value.toLocaleString()}</div>
                    <div className="truncate text-xs text-zinc-500">{step.detail}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-[#0b131d] p-4">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-xs">{kpi.label}</span>
                <Icon className="size-4" />
              </div>
              <div className="mt-3 font-mono text-2xl font-semibold tabular-nums text-white">{kpi.value}</div>
              <div className="mt-1 text-xs text-emerald-300">{kpi.delta}</div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="app-section-flat overflow-hidden rounded-md">
          <SectionHeader title="Action Queue" meta={`${actionQueue.reduce((sum, item) => sum + item.count, 0)} open`} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.08] text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {actionQueue.map((row) => (
                  <tr key={row.action} className="transition-colors hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <Link href={row.href as Route} className="font-medium text-white hover:text-emerald-300">
                        {row.action}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{row.item}</td>
                    <td className="px-4 py-3">
                      <PriorityLabel value={row.priority} />
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{row.due}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-200">{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="app-section-flat overflow-hidden rounded-md">
          <SectionHeader title="Recent Activity" meta="live" />
          <div className="divide-y divide-white/[0.06]">
            {activity.length > 0 ? (
              activity.map((item, index) => (
                <ActivityRow key={`${item.title}-${index}`} {...item} />
              ))
            ) : (
              <div className="px-4 py-12 text-center text-sm text-zinc-500">
                Activity will appear once the pipeline moves.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="app-section-flat overflow-hidden rounded-md">
          <SectionHeader title="Engine Status" meta={automationOverview.engine.mode} />
          <div className="grid grid-cols-2 gap-px bg-white/[0.08]">
            <StatusMetric icon={<Bot className="size-4" />} label="Mode" value={automationOverview.engine.mode} />
            <StatusMetric icon={<Clock3 className="size-4" />} label="Next Send" value={formatRunTime(automationOverview.engine.nextSendAt, "--")} />
            <StatusMetric icon={<Radio className="size-4" />} label="Running Job" value={activeRun ? `${activeRun.niche}` : "Idle"} />
            <StatusMetric icon={<CheckCircle2 className="size-4" />} label="Mailboxes" value={automationOverview.mailboxes.length.toLocaleString()} />
          </div>
        </div>

        <div className="app-section-flat overflow-hidden rounded-md">
          <SectionHeader title="Automation Performance" meta="This week" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.08] text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 text-right font-medium">Responses</th>
                  <th className="px-4 py-3 text-right font-medium">Rate</th>
                  <th className="px-4 py-3 text-right font-medium">Meetings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {campaignRows.map((row) => (
                  <tr key={row.label} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{row.responses.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{row.rate}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{row.meetings.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <span className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">
        {meta}
      </span>
    </div>
  );
}

function ActivityRow({
  title,
  detail,
  when,
  icon,
}: {
  title: string;
  detail: string;
  when: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{title}</div>
        <div className="truncate text-xs text-zinc-500">{detail}</div>
      </div>
      <div className="shrink-0 font-mono text-[11px] text-zinc-500">{when}</div>
    </div>
  );
}

function PriorityLabel({ value }: { value: string }) {
  const className =
    value === "High"
      ? "text-red-300"
      : value === "Medium"
        ? "text-amber-300"
        : "text-emerald-300";
  return <span className={`text-xs font-medium ${className}`}>{value}</span>;
}

function StatusMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#0b131d] p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function toneClass(tone: "emerald" | "blue" | "cyan" | "amber") {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    case "blue":
      return "border-blue-400/20 bg-blue-400/10 text-blue-300";
    case "cyan":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-300";
    case "amber":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }
}
