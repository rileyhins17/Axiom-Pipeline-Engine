import { MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ToastProvider } from "@/components/ui/toast-provider";
import { OutreachClient } from "@/components/outreach/outreach-client";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export default async function OutreachPage() {
  await requireSession();

  const prisma = getPrisma();
  const leads = await prisma.lead.findMany({
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
    },
  });

  const now = Date.now();
  const followUpDue = leads.filter((lead) => lead.nextFollowUpDue && new Date(lead.nextFollowUpDue).getTime() <= now).length;
  const openConversations = leads.filter((lead) => lead.outreachStatus === "OUTREACHED" || lead.outreachStatus === "FOLLOW_UP_DUE" || lead.outreachStatus === "REPLIED").length;
  const interested = leads.filter((lead) => lead.outreachStatus === "INTERESTED").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-4xl font-extrabold tracking-tight">
          <span className="gradient-text">Outreach Pipeline</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Operate follow-ups, channel tracking, and contacted lead notes in one place.
        </p>
      </div>

      <div className="grid animate-slide-up grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: "100ms" }}>
        <StatCard
          glowClass="glow-cyan"
          icon={<MessageSquareText />}
          iconColor="text-cyan-400"
          label="Contacted"
          subtitle="active outreach records"
          value={leads.length}
        />
        <StatCard
          glowClass="glow-amber"
          icon={<MessageSquareText />}
          iconColor="text-amber-400"
          label="Follow-Up Due"
          subtitle="needs action now"
          value={followUpDue}
        />
        <StatCard
          glowClass="glow-cyan"
          icon={<MessageSquareText />}
          iconColor="text-blue-400"
          label="Open Threads"
          subtitle="outreached or replied"
          value={openConversations}
        />
        <StatCard
          glowClass="glow-emerald"
          icon={<MessageSquareText />}
          iconColor="text-emerald-400"
          label="Interested"
          subtitle="positive responses"
          value={interested}
        />
      </div>

      <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
        <Card className="glass-strong overflow-hidden rounded-xl glow-cyan">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
                  <MessageSquareText className="h-5 w-5 text-cyan-400" />
                  Contacted Lead Operations
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Filter by status, channel, follow-up timing, city, and niche without leaving the workflow.
                </CardDescription>
              </div>
              <Badge
                className="self-start border-cyan-900 bg-cyan-950/30 px-3 py-1 font-mono text-cyan-400"
                variant="outline"
              >
                {leads.length} Contacted Leads
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ToastProvider>
              <OutreachClient initialLeads={JSON.parse(JSON.stringify(leads))} />
            </ToastProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
