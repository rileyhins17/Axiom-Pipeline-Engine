import { Database, Layers, Mail } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { Badge } from "@/components/ui/badge";
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
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Records</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Browse, filter, and export the lead database</p>
        </div>
        <Badge
          className="self-start border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-zinc-400"
          variant="outline"
        >
          {leads.length} records
        </Badge>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Total Leads"
          value={totalLeads}
          subtitle="full lifecycle"
          icon={<Database />}
          iconColor="text-zinc-400"
        />
        <StatCard
          label="Intake + Pre-Send"
          value={preSendLeads}
          subtitle={`${intakeLeads} still in intake`}
          icon={<Layers />}
          iconColor="text-zinc-400"
        />
        <StatCard
          label="Follow-Up + Contactable"
          value={followUpLeads}
          subtitle={`${withEmail} valid email · ${outreachReady} outreach-ready`}
          icon={<Mail />}
          iconColor="text-zinc-400"
        />
      </section>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <ToastProvider>
          <VaultDataTable initialLeads={JSON.parse(JSON.stringify(leads))} />
        </ToastProvider>
      </div>
    </div>
  );
}
