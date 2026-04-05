import { MessageSquareText } from "lucide-react";

import { AutomationConsole } from "@/components/outreach/automation-console";
import { ToastProvider } from "@/components/ui/toast-provider";
import { getServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getOutreachStatusMeta } from "@/lib/outreach";
import { requireSession } from "@/lib/session";

type ActivityTone = "emerald" | "amber" | "red" | "cyan" | "blue" | "zinc";

type ActivityEvent = {
  id: string;
  kind: "send" | "reply" | "failure" | "sync" | "enrich" | "update" | "block";
  title: string;
  detail: string;
  at: string;
  tone: ActivityTone;
};

function parseMetadata(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatLeadLabel(
  leadById: Map<number, { businessName: string }>,
  targetId: string | null,
  fallbackPrefix = "Lead",
) {
  const id = Number(targetId);
  if (Number.isFinite(id)) {
    const lead = leadById.get(id);
    if (lead) return lead.businessName;
    return `${fallbackPrefix} #${id}`;
  }

  return `${fallbackPrefix} update`;
}

function toneForStatus(status: string | null | undefined): ActivityTone {
  switch (status) {
    case "REPLIED":
    case "INTERESTED":
      return "emerald";
    case "FOLLOW_UP_DUE":
      return "amber";
    case "NOT_INTERESTED":
      return "red";
    case "OUTREACHED":
      return "cyan";
    default:
      return "zinc";
  }
}

export default async function OutreachPage() {
  const session = await requireSession();
  const prisma = getPrisma();
  const env = getServerEnv();

  const pipelineLeads = await prisma.lead.findMany({
    where: {
      outreachStatus: { not: "NOT_CONTACTED" },
    },
    orderBy: {
      lastContactedAt: "desc",
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      niche: true,
      contactName: true,
      phone: true,
      email: true,
      outreachStatus: true,
      outreachChannel: true,
      firstContactedAt: true,
      lastContactedAt: true,
      nextFollowUpDue: true,
      outreachNotes: true,
      enrichedAt: true,
      enrichmentData: true,
    },
  });

  const enrichedLeads = await prisma.lead.findMany({
    where: {
      enrichedAt: { not: null },
    },
    orderBy: {
      enrichedAt: "desc",
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      niche: true,
      email: true,
      contactName: true,
      axiomScore: true,
      axiomTier: true,
      websiteStatus: true,
      enrichedAt: true,
      enrichmentData: true,
      outreachStatus: true,
    },
  });

  let emailsSentToday = 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    emailsSentToday = await prisma.outreachEmail.count({
      where: {
        senderUserId: session.user.id,
        sentAt: { gte: today },
        status: "sent",
      },
    });
  } catch {
    // The email log table may not be available in every environment.
  }

  const recentEmails = await prisma.outreachEmail.findMany({
    where: {
      senderUserId: session.user.id,
    },
    orderBy: {
      sentAt: "desc",
    },
    take: 12,
    select: {
      id: true,
      leadId: true,
      senderEmail: true,
      recipientEmail: true,
      subject: true,
      status: true,
      errorMessage: true,
      sentAt: true,
    },
  });

  const recentAuditEvents = await prisma.auditEvent.findMany({
    where: {
      actorUserId: session.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
    select: {
      id: true,
      action: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const leadById = new Map<number, { businessName: string }>();
  for (const lead of pipelineLeads) {
    leadById.set(lead.id, { businessName: lead.businessName });
  }
  for (const lead of enrichedLeads) {
    leadById.set(lead.id, { businessName: lead.businessName });
  }

  const activity: ActivityEvent[] = [];

  for (const email of recentEmails) {
    activity.push({
      id: `email-${email.id}`,
      kind: email.status === "sent" ? "send" : "failure",
      title:
        email.status === "sent"
          ? `Sent to ${email.recipientEmail}`
          : `Delivery failed for ${email.recipientEmail}`,
      detail:
        email.status === "sent"
          ? email.subject
          : email.errorMessage || "Gmail rejected the message before delivery.",
      at: email.sentAt.toISOString(),
      tone: email.status === "sent" ? "emerald" : "red",
    });
  }

  for (const event of recentAuditEvents) {
    if (event.action !== "lead.outreach_update") continue;

    const metadata = parseMetadata(event.metadata);
    const status = typeof metadata?.outreachStatus === "string" ? metadata.outreachStatus : null;
    const channel = typeof metadata?.outreachChannel === "string" ? metadata.outreachChannel : null;

    activity.push({
      id: `audit-${event.id}`,
      kind: "update",
      title: `${formatLeadLabel(leadById, event.targetId)} updated`,
      detail: `${getOutreachStatusMeta(status).shortLabel}${channel ? ` - ${channel}` : ""}`,
      at: event.createdAt.toISOString(),
      tone: toneForStatus(status),
    });
  }

  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="space-y-1 animate-slide-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
          <MessageSquareText className="h-3 w-3 text-emerald-400" />
          Axiom outbound control
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Automation</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          Operator view for active sequences, mailbox pressure, and reply handling. Built to surface the work that
          matters without the extra dashboard noise.
        </p>
      </div>

      <div className="animate-slide-up" style={{ animationDelay: "100ms" }}>
        <ToastProvider>
          <AutomationConsole
            initialPipelineLeads={JSON.parse(JSON.stringify(pipelineLeads))}
            initialEnrichedLeads={JSON.parse(JSON.stringify(enrichedLeads))}
            initialActivity={JSON.parse(JSON.stringify(activity))}
            dailySendLimit={env.OUTREACH_DAILY_SEND_LIMIT}
            initialSentToday={emailsSentToday}
          />
        </ToastProvider>
      </div>
    </div>
  );
}
