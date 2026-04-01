import { Brain, MessageSquareText, Send } from "lucide-react";

import { StatCard } from "@/components/ui/stat-card";
import { ToastProvider } from "@/components/ui/toast-provider";
import { OutreachHub } from "@/components/outreach/outreach-hub";
import { getPrisma } from "@/lib/prisma";
import { getOutreachHubLeadWhere, OUTREACH_AUTO_INCLUDE_MIN_SCORE } from "@/lib/outreach";
import { requireSession } from "@/lib/session";

export default async function OutreachPage() {
  await requireSession();

  const prisma = getPrisma();

  // Fetch the outreach pool: active conversations plus every lead above the auto-include score.
  const pipelineLeads = await prisma.lead.findMany({
    where: getOutreachHubLeadWhere(),
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
      axiomScore: true,
      axiomTier: true,
      outreachStatus: true,
      outreachChannel: true,
      firstContactedAt: true,
      lastContactedAt: true,
      nextFollowUpDue: true,
      outreachNotes: true,
    },
  });

  // Fetch enriched leads
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

  // Email send count today
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
    // Table may not exist yet
  }

  // Stats
  const now = Date.now();
  const followUpDue = pipelineLeads.filter(
    (lead) => lead.nextFollowUpDue && new Date(lead.nextFollowUpDue).getTime() <= now,
  ).length;
  const openConversations = pipelineLeads.filter(
    (lead) =>
      lead.outreachStatus === "OUTREACHED" ||
      lead.outreachStatus === "FOLLOW_UP_DUE" ||
      lead.outreachStatus === "REPLIED",
  ).length;
  const interested = pipelineLeads.filter((lead) => lead.outreachStatus === "INTERESTED").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="gradient-text">Outreach Hub</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          AI-powered lead enrichment, personalized email generation, and autonomous sending — all in one place.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Leads scoring above {OUTREACH_AUTO_INCLUDE_MIN_SCORE} are auto-included in the outreach pool.
        </p>
      </div>

      <div className="grid animate-slide-up grid-cols-2 gap-4 lg:grid-cols-6" style={{ animationDelay: "100ms" }}>
        <StatCard
          glowClass="glow-cyan"
          icon={<MessageSquareText />}
          iconColor="text-cyan-400"
          label="Outreach Pool"
          subtitle={`score > ${OUTREACH_AUTO_INCLUDE_MIN_SCORE} + active threads`}
          value={pipelineLeads.length}
        />
        <StatCard
          glowClass="glow-amber"
          icon={<MessageSquareText />}
          iconColor="text-amber-400"
          label="Follow-Up Due"
          subtitle="needs action"
          value={followUpDue}
        />
        <StatCard
          glowClass="glow-cyan"
          icon={<MessageSquareText />}
          iconColor="text-blue-400"
          label="Open Threads"
          subtitle="in progress"
          value={openConversations}
        />
        <StatCard
          glowClass="glow-emerald"
          icon={<MessageSquareText />}
          iconColor="text-emerald-400"
          label="Interested"
          subtitle="positive signals"
          value={interested}
        />
        <StatCard
          glowClass="glow-purple"
          icon={<Brain />}
          iconColor="text-purple-400"
          label="Enriched"
          subtitle="AI-analyzed"
          value={enrichedLeads.length}
        />
        <StatCard
          glowClass="glow-emerald"
          icon={<Send />}
          iconColor="text-emerald-400"
          label="Sent Today"
          subtitle="emails delivered"
          value={emailsSentToday}
        />
      </div>

      <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
        <ToastProvider>
          <OutreachHub
            initialPipelineLeads={JSON.parse(JSON.stringify(pipelineLeads))}
            initialEnrichedLeads={JSON.parse(JSON.stringify(enrichedLeads))}
          />
        </ToastProvider>
      </div>
    </div>
  );
}
