import { Database, Layers, Mail } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { ToastProvider } from "@/components/ui/toast-provider";
import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { getCanonicalLifecycleStage, isIntakeLead } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  await requireSession();

  const prisma = getPrisma();
  const [leads, sequences] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.outreachSequence.findMany({
      select: {
        leadId: true,
        lastSentAt: true,
        status: true,
      },
    }).catch(() => []),
  ]);

  const activePreSendLeadIds = new Set(
    sequences
      .filter((sequence) =>
        ["QUEUED", "ACTIVE", "PAUSED", "SENDING"].includes(sequence.status) && !sequence.lastSentAt,
      )
      .map((sequence) => sequence.leadId),
  );
  const postSendLeadIds = new Set(
    sequences.filter((sequence) => sequence.lastSentAt).map((sequence) => sequence.leadId),
  );

  const totalLeads = leads.length;
  const intakeLeads = leads.filter((lead) => isIntakeLead(lead)).length;
  const preSendLeads = leads.filter(
    (lead) => {
      const stage = getCanonicalLifecycleStage({
        enrichedAt: lead.enrichedAt,
        enrichmentData: lead.enrichmentData,
        hasActiveSequence: activePreSendLeadIds.has(lead.id) || postSendLeadIds.has(lead.id),
        hasSentAnyStep: postSendLeadIds.has(lead.id),
        outreachStatus: lead.outreachStatus,
        source: lead.source,
        axiomScore: lead.axiomScore,
        email: lead.email,
        emailConfidence: lead.emailConfidence,
        emailFlags: lead.emailFlags,
        emailType: lead.emailType,
        websiteStatus: lead.websiteStatus,
        isArchived: lead.isArchived,
      });
      return (
        stage === "INTAKE" ||
        stage === "ENRICHMENT" ||
        stage === "QUALIFICATION" ||
        stage === "INITIAL_OUTREACH"
      );
    },
  ).length;
  const followUpLeads = leads.filter((lead) => postSendLeadIds.has(lead.id)).length;
  const withEmail = leads.filter((lead) => hasValidPipelineEmail(lead)).length;
  const outreachReady = leads.filter((lead) => isLeadOutreachEligible(lead)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[radial-gradient(ellipse_800px_300px_at_top_left,rgba(59,130,246,0.10),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.005))] px-6 py-8 md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-300">
              <Database className="h-3 w-3" />
              Lead Vault
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {totalLeads.toLocaleString()}
              <span className="ml-2 text-base font-normal text-zinc-500">
                record{totalLeads === 1 ? "" : "s"} on file
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Browse the full database, verify records, and export filtered slices.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total Leads"
          value={totalLeads}
          subtitle="records across the full lifecycle"
          icon={<Database />}
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Intake + Pre-Send"
          value={preSendLeads}
          subtitle={`${intakeLeads} still in intake`}
          icon={<Layers />}
          iconColor="text-cyan-400"
        />
        <StatCard
          label="Follow-Up + Contactable"
          value={followUpLeads}
          subtitle={`${withEmail} valid email · ${outreachReady} outreach-ready`}
          icon={<Mail />}
          iconColor="text-purple-400"
        />
      </section>

      <Card className="overflow-hidden rounded-3xl border-white/[0.06] bg-white/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white sm:text-xl">
                <Database className="h-5 w-5 text-emerald-400" />
                Lead database
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-zinc-400">
                Filter, sort, review, and export records without turning Vault into the main operations surface.
              </CardDescription>
            </div>
            <Badge
              className="self-start border-white/10 bg-black/20 px-3 py-1 font-mono text-zinc-300"
              variant="outline"
            >
              {leads.length} records
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ToastProvider>
            <VaultDataTable initialLeads={JSON.parse(JSON.stringify(leads))} />
          </ToastProvider>
        </CardContent>
      </Card>
    </div>
  );
}
