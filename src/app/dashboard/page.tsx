import {
  Check,
  CheckCircle2,
  Clock3,
  Cog,
  Database,
  Folder,
  Info,
  Send,
  Settings2,
  UserRoundPlus,
} from "lucide-react";

import { hasValidPipelineEmail } from "@/lib/lead-qualification";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { isContactedOutreachStatus, READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { partitionPreSendLeads } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { listScrapeJobs } from "@/lib/scrape-jobs";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Tone = "green" | "blue" | "cyan" | "amber";
type PriorityLevel = "High" | "Medium" | "Low";

type Kpi = {
  color: string;
  delta: string;
  deltaTone: "good" | "bad" | "neutral";
  label: string;
  period: string;
  points: string;
  value: string;
};

type ActionRow = {
  action: string;
  count: number;
  detail: string;
  due: string;
  item: string;
  priority: PriorityLevel;
};

type ActivityRow = {
  date: Date;
  detail: string;
  icon: typeof UserRoundPlus;
  time: string;
  title: string;
  tone: Tone;
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(numerator: number, denominator: number, decimals = 0) {
  if (denominator <= 0) return decimals === 0 ? "0%" : "0.0%";
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysAgo(days: number) {
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - days);
  return date;
}

function isBetween(date: Date | string | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function calcDelta(current: number, previous: number, suffix = "%") {
  if (previous === 0 && current === 0) return { label: `0${suffix}`, tone: "neutral" as const };
  if (previous === 0) return { label: `+${current}${suffix}`, tone: "good" as const };
  const change = ((current - previous) / previous) * 100;
  return {
    label: `${change >= 0 ? "+" : ""}${change.toFixed(0)}${suffix}`,
    tone: change > 0 ? "good" as const : change < 0 ? "bad" as const : "neutral" as const,
  };
}

function calcPointDelta(currentRate: number, previousRate: number) {
  const change = currentRate - previousRate;
  return {
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}pp`,
    tone: change > 0 ? "good" as const : change < 0 ? "bad" as const : "neutral" as const,
  };
}

function shortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDashboardDate(date: Date) {
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(date: Date | string | null | undefined) {
  if (!date) return "Live";
  return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function seriesByDay<T>(items: T[], getDate: (item: T) => Date | string | null | undefined, days = 14) {
  const starts = Array.from({ length: days }, (_, index) => daysAgo(days - index - 1));
  return starts.map((start) => {
    const end = new Date(start.getTime() + MS_PER_DAY);
    return items.filter((item) => isBetween(getDate(item), start, end)).length;
  });
}

function buildSparkline(values: number[]) {
  const width = 274;
  const height = 18;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const spread = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / spread) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function priorityFor(count: number): PriorityLevel {
  if (count >= 25) return "High";
  if (count >= 5) return "Medium";
  return "Low";
}

function dueFor(count: number, urgent = false) {
  if (count <= 0) return "-";
  if (urgent || count >= 25) return "1h";
  if (count >= 5) return "3h";
  return "1d";
}

function duplicateCount(leads: Array<{ businessName: string; city: string; dedupeKey?: string | null }>) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key = (lead.dedupeKey || `${lead.businessName}:${lead.city}`).trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.values()).reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function IconTile({
  children,
  tone,
  size = "lg",
}: {
  children: React.ReactNode;
  tone: Tone;
  size?: "sm" | "lg";
}) {
  const styles = {
    green: "border-[#245f48] bg-[#123a32] text-[#62e79f]",
    blue: "border-[#20517d] bg-[#102d50] text-[#53a8ff]",
    cyan: "border-[#1e5b67] bg-[#102f3a] text-[#55c6dc]",
    amber: "border-[#6b4b13] bg-[#4a3412] text-[#f59e0b]",
  };
  return (
    <div
      className={`flex items-center justify-center border ${styles[tone]} ${
        size === "lg" ? "h-[60px] w-[60px] rounded-xl" : "h-9 w-9 rounded-md"
      }`}
    >
      {children}
    </div>
  );
}

function KpiCard({ item }: { item: Kpi }) {
  const deltaClass =
    item.deltaTone === "bad"
      ? "text-[#ff6666]"
      : item.deltaTone === "neutral"
        ? "text-[#9da8b4]"
        : "text-[#62e79f]";

  return (
    <div className="rounded-md border border-[#24313c] bg-[#121b25] p-4">
      <div className="flex items-center justify-between text-sm text-[#9da8b4]">
        <span>{item.label}</span>
        <Info className="h-3.5 w-3.5" />
      </div>
      <div className="mt-5 flex items-end gap-3">
        <div className="text-[28px] font-semibold leading-none text-[#f2f5f8]">{item.value}</div>
        <div className={`text-sm font-semibold ${deltaClass}`}>{item.delta}</div>
      </div>
      <div className="mt-2 text-[13px] text-[#98a3af]">{item.period}</div>
      <svg className="mt-4 h-[22px] w-full overflow-visible" viewBox="0 0 276 18" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" points={item.points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Priority({ value }: { value: PriorityLevel }) {
  const color = value === "High" ? "text-[#ff6666]" : value === "Medium" ? "text-[#f59e0b]" : "text-[#62e79f]";
  return <span className={`text-[13px] font-medium ${color}`}>{value}</span>;
}

export default async function DashboardPage() {
  await requireSession();

  const prisma = getPrisma();
  const now = new Date();
  const thisWeekStart = daysAgo(7);
  const previousWeekStart = daysAgo(14);
  const period = `vs ${shortDate(previousWeekStart)} - ${shortDate(thisWeekStart)}`;

  const [automationOverview, scrapeJobs, leads, sentEmails, sentTotal] = await Promise.all([
    listAutomationOverview().catch(() => null),
    listScrapeJobs(8).catch(() => []),
    prisma.lead.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        businessName: true,
        city: true,
        createdAt: true,
        dedupeKey: true,
        email: true,
        emailConfidence: true,
        emailFlags: true,
        emailType: true,
        enrichedAt: true,
        enrichmentData: true,
        axiomScore: true,
        outreachStatus: true,
        source: true,
        lastContactedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.outreachEmail.findMany({
      where: { status: "sent" },
      orderBy: { sentAt: "desc" },
      take: 500,
    }).catch(() => []),
    prisma.outreachEmail.count({ where: { status: "sent" } }).catch(() => 0),
  ]);

  const preSendStages = partitionPreSendLeads(
    leads.filter((lead) => {
      if (isContactedOutreachStatus(lead.outreachStatus)) return false;
      if (lead.outreachStatus === READY_FOR_FIRST_TOUCH_STATUS) return false;
      return true;
    }),
  );

  const totalLeads = leads.length;
  const contactableLeads = leads.filter((lead) => hasValidPipelineEmail(lead)).length;
  const responses = leads.filter((lead) => lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED").length;
  const interested = leads.filter((lead) => lead.outreachStatus === "INTERESTED").length;
  const activeOutreach =
    (automationOverview?.stats.active ?? 0) +
    (automationOverview?.stats.queued ?? 0) +
    (automationOverview?.stats.ready ?? 0);
  const activeWorkflows = automationOverview?.sequences.length ?? 0;
  const runningWorkflows = (automationOverview?.stats.sending ?? 0) + (automationOverview?.stats.waiting ?? 0);
  const responseRate = sentTotal > 0 ? (responses / sentTotal) * 100 : 0;
  const captureRate = totalLeads > 0 ? (contactableLeads / totalLeads) * 100 : 0;
  const duplicates = duplicateCount(leads);

  const thisWeekLeads = leads.filter((lead) => isBetween(lead.createdAt, thisWeekStart, now)).length;
  const previousWeekLeads = leads.filter((lead) => isBetween(lead.createdAt, previousWeekStart, thisWeekStart)).length;
  const thisWeekContacts = leads.filter((lead) => hasValidPipelineEmail(lead) && isBetween(lead.createdAt, thisWeekStart, now)).length;
  const previousWeekContacts = leads.filter((lead) => hasValidPipelineEmail(lead) && isBetween(lead.createdAt, previousWeekStart, thisWeekStart)).length;
  const thisWeekSent = sentEmails.filter((email) => isBetween(email.sentAt, thisWeekStart, now)).length;
  const previousWeekSent = sentEmails.filter((email) => isBetween(email.sentAt, previousWeekStart, thisWeekStart)).length;
  const thisWeekResponses = leads.filter((lead) => (lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED") && isBetween(lead.lastContactedAt, thisWeekStart, now)).length;
  const previousWeekResponses = leads.filter((lead) => (lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED") && isBetween(lead.lastContactedAt, previousWeekStart, thisWeekStart)).length;
  const thisWeekInterested = leads.filter((lead) => lead.outreachStatus === "INTERESTED" && isBetween(lead.lastContactedAt, thisWeekStart, now)).length;
  const previousWeekInterested = leads.filter((lead) => lead.outreachStatus === "INTERESTED" && isBetween(lead.lastContactedAt, previousWeekStart, thisWeekStart)).length;
  const currentConversion = thisWeekSent > 0 ? (thisWeekResponses / thisWeekSent) * 100 : 0;
  const previousConversion = previousWeekSent > 0 ? (previousWeekResponses / previousWeekSent) * 100 : 0;

  const leadDelta = calcDelta(thisWeekLeads, previousWeekLeads);
  const contactDelta = calcDelta(thisWeekContacts, previousWeekContacts);
  const outreachDelta = calcDelta(thisWeekSent, previousWeekSent);
  const responseDelta = calcDelta(thisWeekResponses, previousWeekResponses);
  const interestedDelta = calcDelta(thisWeekInterested, previousWeekInterested);
  const conversionDelta = calcPointDelta(currentConversion, previousConversion);

  const leadSeries = seriesByDay(leads, (lead) => lead.createdAt);
  const contactSeries = seriesByDay(leads.filter((lead) => hasValidPipelineEmail(lead)), (lead) => lead.createdAt);
  const sentSeries = seriesByDay(sentEmails, (email) => email.sentAt);
  const responseSeries = seriesByDay(
    leads.filter((lead) => lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED"),
    (lead) => lead.lastContactedAt,
  );
  const interestedSeries = seriesByDay(leads.filter((lead) => lead.outreachStatus === "INTERESTED"), (lead) => lead.lastContactedAt);

  const kpis: Kpi[] = [
    { label: "Total Leads", value: formatNumber(totalLeads), delta: leadDelta.label, deltaTone: leadDelta.tone, period, color: "#62e79f", points: buildSparkline(leadSeries) },
    { label: "Contacts in Vault", value: formatNumber(contactableLeads), delta: contactDelta.label, deltaTone: contactDelta.tone, period, color: "#55c6dc", points: buildSparkline(contactSeries) },
    { label: "Active Outreach", value: formatNumber(activeOutreach), delta: outreachDelta.label, deltaTone: outreachDelta.tone, period, color: "#55c6dc", points: buildSparkline(sentSeries) },
    { label: "Responses", value: formatNumber(responses), delta: responseDelta.label, deltaTone: responseDelta.tone, period, color: "#62e79f", points: buildSparkline(responseSeries) },
    { label: "Meetings Booked", value: formatNumber(interested), delta: interestedDelta.label, deltaTone: interestedDelta.tone, period, color: "#f59e0b", points: buildSparkline(interestedSeries) },
    { label: "Conversion Rate", value: `${responseRate.toFixed(2)}%`, delta: conversionDelta.label, deltaTone: conversionDelta.tone, period, color: "#62e79f", points: buildSparkline(responseSeries) },
  ];

  const actionQueue: ActionRow[] = [
    {
      action: "Review New Leads",
      count: preSendStages.intake.length,
      detail: `${formatNumber(preSendStages.intake.length)} sourced leads require review`,
      item: "Lead Generator",
      priority: priorityFor(preSendStages.intake.length),
      due: dueFor(preSendStages.intake.length),
    },
    {
      action: "Enrich Contacts",
      count: (automationOverview?.pipeline.needsEnrichment ?? 0) + (automationOverview?.pipeline.enriching ?? 0),
      detail: `${formatNumber((automationOverview?.pipeline.needsEnrichment ?? 0) + (automationOverview?.pipeline.enriching ?? 0))} contacts need enrichment`,
      item: "Vault",
      priority: priorityFor((automationOverview?.pipeline.needsEnrichment ?? 0) + (automationOverview?.pipeline.enriching ?? 0)),
      due: dueFor((automationOverview?.pipeline.needsEnrichment ?? 0) + (automationOverview?.pipeline.enriching ?? 0)),
    },
    {
      action: "Follow Up",
      count: automationOverview?.stats.waiting ?? 0,
      detail: `${formatNumber(automationOverview?.stats.waiting ?? 0)} contacts waiting for follow up`,
      item: "Outreach",
      priority: priorityFor(automationOverview?.stats.waiting ?? 0),
      due: automationOverview?.engine.nextSendAt ? formatTime(automationOverview.engine.nextSendAt) : dueFor(automationOverview?.stats.waiting ?? 0),
    },
    {
      action: "Workflow Alerts",
      count: automationOverview?.stats.blocked ?? 0,
      detail: `${formatNumber(automationOverview?.stats.blocked ?? 0)} workflows need attention`,
      item: "Automation",
      priority: ((automationOverview?.stats.blocked ?? 0) > 0 ? "High" : "Low") as PriorityLevel,
      due: dueFor(automationOverview?.stats.blocked ?? 0, true),
    },
    {
      action: "Data Quality",
      count: duplicates,
      detail: `${formatNumber(duplicates)} duplicates detected`,
      item: "Data Quality",
      priority: priorityFor(duplicates),
      due: dueFor(duplicates),
    },
  ].filter((row) => row.count > 0);

  const visibleActions =
    actionQueue.length > 0
      ? actionQueue.slice(0, 5)
      : [{
          action: "No Action Required",
          count: 0,
          detail: "Live pipeline checks are clean",
          due: "-",
          item: "System",
          priority: "Low" as PriorityLevel,
        }];

  const recentLeadActivities: ActivityRow[] = leads.slice(0, 2).map((lead) => ({
    date: lead.createdAt,
    detail: `${lead.city || "Unknown city"} - ${lead.source || "lead source"}`,
    icon: UserRoundPlus,
    time: formatTime(lead.createdAt),
    title: `${lead.businessName} added`,
    tone: "green",
  }));
  const recentSentActivities: ActivityRow[] = (automationOverview?.recentSent ?? []).slice(0, 2).map((email) => ({
    date: email.sentAt,
    detail: email.lead?.businessName || email.recipientEmail,
    icon: Send,
    time: formatTime(email.sentAt),
    title: "Outreach email sent",
    tone: "cyan",
  }));
  const recentRunActivities: ActivityRow[] = scrapeJobs.slice(0, 1).map((job) => ({
    date: job.updatedAt,
    detail: `${job.niche} in ${job.city}`,
    icon: Cog,
    time: formatTime(job.updatedAt),
    title: `Lead Generator ${job.status}`,
    tone: job.status === "failed" ? "amber" : "blue",
  }));
  const recentResponseActivities: ActivityRow[] = leads
    .filter((lead) => lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED")
    .slice(0, 2)
    .map((lead) => ({
      date: lead.lastContactedAt || lead.createdAt,
      detail: lead.businessName,
      icon: Database,
      time: formatTime(lead.lastContactedAt || lead.createdAt),
      title: lead.outreachStatus === "INTERESTED" ? "Interested response received" : "Reply received",
      tone: "green",
    }));

  const activity = [...recentLeadActivities, ...recentSentActivities, ...recentResponseActivities, ...recentRunActivities]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  const campaignRows = [
    ["Ready First Touch", formatNumber(automationOverview?.stats.ready ?? 0), formatPercent(automationOverview?.stats.ready ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(interested)],
    ["Queued Automation", formatNumber(automationOverview?.stats.queued ?? 0), formatPercent(automationOverview?.stats.queued ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(automationOverview?.stats.sending ?? 0)],
    ["Active Follow Up", formatNumber(automationOverview?.stats.active ?? 0), formatPercent(responses, Math.max(activeOutreach, 1), 1), formatNumber(responses)],
    ["Completed Sequences", formatNumber(automationOverview?.stats.completed ?? 0), formatPercent(automationOverview?.stats.completed ?? 0, Math.max(activeWorkflows, 1), 1), formatNumber(automationOverview?.stats.replied ?? 0)],
    ["Blocked Workflows", formatNumber(automationOverview?.stats.blocked ?? 0), formatPercent(automationOverview?.stats.blocked ?? 0, Math.max(activeWorkflows, 1), 1), "0"],
  ];

  return (
    <div className="min-h-[calc(100vh-163px)] text-[#d9e0e8]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-white">Dashboard</h1>
          <p className="mt-1 text-[15px] text-[#b7c0cb]">Unified overview of your pipeline engine</p>
        </div>
        <div className="text-right">
          <div className="mb-3 text-sm text-[#9aa5b1]">{formatDashboardDate(now)}</div>
          <div className="flex gap-3">
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#2a3644] bg-[#182231] px-4 text-sm font-medium text-white" type="button">
              <Settings2 className="h-4 w-4" />
              Customize
            </button>
            <button className="flex h-9 min-w-[173px] items-center justify-between rounded-md border border-[#2a3644] bg-[#182231] px-4 text-sm font-medium text-white" type="button">
              This Week
              <span className="text-[#9aa5b1]">v</span>
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#24313c] bg-[#121b25] p-5">
        <h2 className="text-base font-semibold text-white">Pipeline Workflow</h2>
        <div className="mt-6 flex items-center justify-center gap-5">
          <div className="flex items-center gap-4">
            <IconTile tone="green"><UserRoundPlus className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Lead Generator</div>
              <div className="mt-2 text-sm text-[#62e79f]">{formatNumber(totalLeads)} <span className="text-[#dce3ea]">Leads</span></div>
              <div className="text-sm text-[#62e79f]">{leadDelta.label} <span className="text-[#9aa5b1]">vs last week</span></div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <CheckCircle2 className="h-6 w-6 text-[#62e79f]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="blue"><Folder className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Vault</div>
              <div className="mt-2 text-sm text-white">{formatNumber(contactableLeads)} <span className="text-[#dce3ea]">Contacts</span></div>
              <div className="text-sm text-[#9aa5b1]">{captureRate.toFixed(0)}% of leads captured</div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <CheckCircle2 className="h-6 w-6 text-[#62e79f]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="cyan"><Send className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Outreach</div>
              <div className="mt-2 text-sm text-white">{formatNumber(activeOutreach)} <span className="text-[#dce3ea]">Active</span></div>
              <div className="text-sm text-[#9aa5b1]">{responseRate.toFixed(0)}% response rate</div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <Clock3 className="h-6 w-6 text-[#f59e0b]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="amber"><Cog className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Automation</div>
              <div className="mt-2 text-sm text-white">{formatNumber(activeWorkflows)} <span className="text-[#dce3ea]">Workflows</span></div>
              <div className="text-sm text-[#9aa5b1]">{formatNumber(runningWorkflows)} running now</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-6 gap-4">
        {kpis.map((item) => <KpiCard key={item.label} item={item} />)}
      </section>

      <section className="mt-4 grid grid-cols-[1.15fr_0.9fr_1.03fr] gap-4">
        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center justify-between border-b border-[#24313c] px-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">Action Queue</h2>
              <span className="rounded-md bg-[#26313d] px-2 py-0.5 text-sm font-semibold text-[#c7d0da]">{actionQueue.length}</span>
            </div>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>
          <div className="grid grid-cols-[36px_1.6fr_0.72fr_0.7fr_44px] border-b border-[#24313c] px-4 py-3 text-[12px] text-[#9aa5b1]">
            <span className="h-3 w-3 rounded-sm bg-[#202b36]" />
            <span>Action</span>
            <span>Item</span>
            <span>Priority</span>
            <span>Due</span>
          </div>
          {visibleActions.map((item) => (
            <div key={item.action} className="grid grid-cols-[36px_1.6fr_0.72fr_0.7fr_44px] items-center border-b border-[#24313c] px-4 py-[9px] text-sm">
              <span className="h-4 w-4 rounded border border-[#53606d]" />
              <div>
                <div className="font-medium text-white">{item.action}</div>
                <div className="text-[12px] text-[#8f9aa6]">{item.detail}</div>
              </div>
              <span className="text-[13px] text-[#a9b3bf]">{item.item}</span>
              <Priority value={item.priority} />
              <span className="text-[13px] text-[#a9b3bf]">{item.due}</span>
            </div>
          ))}
          <div className="flex h-[69px] items-center justify-between px-4">
            <span className="text-sm text-[#a9b3bf]">{actionQueue.length} actions</span>
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#364253] bg-[#17212d] px-4 text-sm font-medium text-white" type="button">
              <Check className="h-4 w-4" />
              Mark All Complete
            </button>
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center px-4">
            <h2 className="text-base font-semibold text-white">Recent Activity</h2>
          </div>
          <div className="space-y-0 px-4">
            {activity.length > 0 ? activity.map((item) => (
              <div key={`${item.title}:${item.time}`} className="flex items-center gap-3 border-b border-[#24313c] py-[13px]">
                <IconTile tone={item.tone} size="sm">
                  <item.icon className="h-5 w-5" />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{item.title}</div>
                  <div className="text-sm text-[#8f9aa6]">{item.detail}</div>
                </div>
                <div className="text-[13px] text-[#9aa5b1]">{item.time}</div>
              </div>
            )) : (
              <div className="py-10 text-sm text-[#8f9aa6]">No recent pipeline activity yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center justify-between border-b border-[#24313c] px-5">
            <h2 className="text-base font-semibold text-white">Top Performing Campaigns</h2>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>
          <div className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-3 text-[12px] text-[#9aa5b1]">
            <span>Campaign</span>
            <span>Responses</span>
            <span>Rate</span>
            <span>Meetings</span>
          </div>
          {campaignRows.map((row) => (
            <div key={row[0]} className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-[15px] text-sm">
              <span className="font-medium text-white">{row[0]}</span>
              <span className="text-[#d9e0e8]">{row[1]}</span>
              <span className="text-[#d9e0e8]">{row[2]}</span>
              <span className="text-[#d9e0e8]">{row[3]}</span>
            </div>
          ))}
          <div className="p-4">
            <button className="flex h-9 w-full items-center justify-between rounded-md border border-[#2a3644] bg-[#151f2b] px-3 text-sm font-medium text-white" type="button">
              View All Campaigns
              <span className="text-lg leading-none">-&gt;</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
