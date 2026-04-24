import { Database, Download, Layers, Mail } from "lucide-react";

import VaultDataTable from "@/components/VaultDataTable";
import { Badge } from "@/components/ui/badge";
import {
  OperatorHeader,
  OperatorMetric,
  OperatorMetricGrid,
  OperatorPage,
  OperatorPanel,
} from "@/components/ui/operator-page";
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
    }),
    prisma.outreachSequence
      .findMany({
        select: {
          leadId: true,
          lastSentAt: true,
          status: true,
        },
      })
      .catch(() => []),
  ]);

  const activePreSendLeadIds = new Set(
    sequences
      .filter(
        (sequence) =>
          ["QUEUED", "ACTIVE", "PAUSED", "SENDING"].includes(sequence.status) &&
          !sequence.lastSentAt,
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
  const followUpLeads = leads.filter((lead) => postSendLeadIds.has(lead.id)).length;
  const withEmail = leads.filter((lead) => hasValidPipelineEmail(lead)).length;
  const outreachReady = leads.filter((lead) => isLeadOutreachEligible(lead)).length;

  return (
    <OperatorPage>
      <OperatorHeader
        eyebrow="Master database"
        title="Vault"
        description="Browse, verify, edit, and export lead records. Vault stays database-first; Outreach and Automation own the active send workflow."
        status={
          <Badge className="border-white/10 bg-white/[0.035] px-3 py-1 font-mono text-zinc-300" variant="outline">
            {totalLeads} records
          </Badge>
        }
      />

      <OperatorMetricGrid className="md:grid-cols-3">
        <OperatorMetric
          label="Total leads"
          value={totalLeads}
          detail="records across the lifecycle"
          icon={Database}
          tone="success"
        />
        <OperatorMetric
          label="Intake and pre-send"
          value={preSendLeads}
          detail={`${intakeLeads} still in intake`}
          icon={Layers}
          tone="info"
        />
        <OperatorMetric
          label="Follow-up and contactable"
          value={followUpLeads}
          detail={`${withEmail} valid emails / ${outreachReady} outreach-ready`}
          icon={Mail}
          tone="accent"
        />
      </OperatorMetricGrid>

      <OperatorPanel
        title="Lead database"
        description="Filter, sort, review expanded records, and export the exact slice you need."
        icon={Download}
        action={
          <Badge className="border-white/10 bg-black/20 px-3 py-1 font-mono text-zinc-300" variant="outline">
            Export controls inside table
          </Badge>
        }
        contentClassName="p-4"
      >
        <ToastProvider>
          <VaultDataTable initialLeads={JSON.parse(JSON.stringify(leads))} />
        </ToastProvider>
      </OperatorPanel>
    </OperatorPage>
  );
}
