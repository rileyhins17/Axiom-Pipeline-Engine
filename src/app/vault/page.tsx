import { Database, Download, Search, ShieldCheck } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { ToastProvider } from "@/components/ui/toast-provider";
import { hasValidPipelineEmail, isLeadOutreachEligible } from "@/lib/lead-qualification";
import { getCanonicalLifecycleStage, isIntakeLead } from "@/lib/pipeline-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  await requireSession();

  const prisma = getPrisma();
  const [leads, sequences] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 2000, // Hard cap — Vault renders all rows client-side; protect from runaway loads.
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
  const preSendLeads = leads.filter((lead) => {
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
  }).length;
  const withEmail = leads.filter((lead) => hasValidPipelineEmail(lead)).length;
  const outreachReady = leads.filter((lead) => isLeadOutreachEligible(lead)).length;
  const missingWebsite = leads.filter((lead) => lead.websiteStatus === "MISSING").length;
  const verifiedWebsite = leads.filter((lead) => lead.websiteStatus && lead.websiteStatus !== "MISSING").length;

  const metrics = [
    { label: "Records", value: totalLeads, detail: "all leads", icon: Database, tone: "text-zinc-300" },
    { label: "Pre-send", value: preSendLeads, detail: `${intakeLeads} intake`, icon: Search, tone: "text-cyan-300" },
    { label: "Verified", value: verifiedWebsite, detail: `${missingWebsite} no site`, icon: ShieldCheck, tone: "text-emerald-300" },
    { label: "Exportable", value: withEmail, detail: `${outreachReady} ready`, icon: Download, tone: "text-amber-300" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="border-b border-white/[0.06] pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              Vault
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Lead database
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Search, verify, segment, and export lead records. Outreach stays secondary here; Vault is the source of truth.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[680px]">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="min-w-0 border-l border-white/[0.08] bg-white/[0.015] px-3 py-2.5"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  <metric.icon className={`h-3.5 w-3.5 ${metric.tone}`} />
                  {metric.label}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums text-white">
                    {metric.value.toLocaleString()}
                  </span>
                  <span className="truncate text-[11px] text-zinc-500">{metric.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ToastProvider>
        <VaultDataTable initialLeads={JSON.parse(JSON.stringify(leads))} />
      </ToastProvider>
    </div>
  );
}
