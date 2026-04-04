"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";
import {
  getCanonicalLifecycleStage,
  getMissingDataSummary,
  getReadinessChecklist,
  getReadinessLabel,
  getReadinessState,
  getReadinessTone,
  type PipelineReadinessState,
} from "@/lib/pipeline-lifecycle";
import { READY_FOR_FIRST_TOUCH_STATUS } from "@/lib/outreach";
import { formatAppDateTime } from "@/lib/time";

export type PreSendLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  phone: string | null;
  email: string | null;
  emailConfidence?: number | null;
  emailFlags?: string | null;
  emailType?: string | null;
  contactName: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  websiteStatus: string | null;
  enrichedAt: string | null;
  enrichmentData: string | null;
  outreachStatus: string | null;
  source?: string | null;
  createdAt?: string | null;
  lastUpdated?: string | null;
  outreachNotes?: string | null;
};

export type PreSendSequence = {
  id: string;
  state: "QUEUED" | "SENDING" | "WAITING" | "BLOCKED" | "STOPPED" | "COMPLETED";
  currentStep: string;
  nextSendAt: string | null;
  nextScheduledAt: string | null;
  blockerLabel: string | null;
  blockerDetail: string | null;
  hasSentAnyStep: boolean;
  lead?: PreSendLead | null;
  mailbox?: {
    gmailAddress: string;
    label: string | null;
  } | null;
};

function parseEnrichment(data: string | null) {
  if (!data) return null;
  try {
    return JSON.parse(data) as EnrichmentResult;
  } catch {
    return null;
  }
}

function formatWhen(value: string | null | undefined, fallback = "No timestamp") {
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

function readinessCopy(state: PipelineReadinessState) {
  switch (state) {
    case "READY":
      return "This lead has enough signal to move into Initial Outreach.";
    case "ALMOST_READY":
      return "The lead is close, but one or two key gaps still need attention.";
    default:
      return "This record still needs core enrichment before it should advance.";
  }
}

function getPrepStageBadge(lead: PreSendLead) {
  const stage = getCanonicalLifecycleStage(lead);
  if (stage === "INTAKE") {
    return {
      label: "Intake",
      classes: "border-cyan-500/20 bg-cyan-500/10 text-cyan-200",
    };
  }

  return {
    label: "Enrichment",
    classes: "border-white/10 bg-white/[0.04] text-zinc-300",
  };
}

function statusTone(state: PreSendSequence["state"]) {
  switch (state) {
    case "QUEUED":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-200";
    case "SENDING":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    case "BLOCKED":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200";
    default:
      return "border-white/10 bg-white/[0.04] text-zinc-300";
  }
}

function stateLabel(state: PreSendSequence["state"]) {
  switch (state) {
    case "QUEUED":
      return "Queued for First Touch";
    case "SENDING":
      return "Sending First Touch";
    case "BLOCKED":
      return "Blocked Before First Send";
    default:
      return state;
  }
}

function SectionHeader({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
      </div>
      {typeof count === "number" && (
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400">
          {count} item{count === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

export function EnrichmentWorkspace({
  leads,
  onEnrichRequested,
  onRefresh,
}: {
  leads: PreSendLead[];
  onEnrichRequested: (leadIds: number[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(leads[0]?.id ?? null);
  const [busyLeadId, setBusyLeadId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = !query
      ? leads
      : leads.filter(
          (lead) =>
            lead.businessName.toLowerCase().includes(query) ||
            lead.city.toLowerCase().includes(query) ||
            lead.niche.toLowerCase().includes(query) ||
            (lead.email || "").toLowerCase().includes(query),
        );

    const stageWeight = (lead: PreSendLead) =>
      getCanonicalLifecycleStage(lead) === "INTAKE" ? 0 : 1;

    return [...visible].sort((a, b) => {
      const stageDiff = stageWeight(a) - stageWeight(b);
      if (stageDiff !== 0) return stageDiff;
      return (new Date(b.lastUpdated || b.createdAt || 0).getTime() || 0) - (new Date(a.lastUpdated || a.createdAt || 0).getTime() || 0);
    });
  }, [leads, search]);

  useEffect(() => {
    if (!filtered.some((lead) => lead.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const currentLead = filtered.find((lead) => lead.id === selectedId) ?? filtered[0] ?? null;

  const handleEnrich = async (leadId: number) => {
    setBusyLeadId(leadId);
    try {
      await onEnrichRequested([leadId]);
    } finally {
      setBusyLeadId(null);
    }
  };

  const approveLead = async (leadId: number) => {
    setBusyAction(`${leadId}:approve`);
    try {
      const response = await fetch(`/api/leads/${leadId}/outreach`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachStatus: READY_FOR_FIRST_TOUCH_STATUS }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to approve lead");
      }

      toast("Lead moved into Initial Outreach", { type: "success", icon: "note" });
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to approve lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const archiveLead = async (leadId: number) => {
    setBusyAction(`${leadId}:archive`);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to archive lead");
      }
      toast("Lead archived", { type: "success", icon: "note" });
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to archive lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="rounded-[24px] border border-white/[0.06] bg-black/20 px-6 py-16 text-center">
        <Brain className="mx-auto h-10 w-10 text-zinc-700" />
        <div className="mt-4 text-lg font-medium text-white">No enrichment backlog</div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Intake is clear right now. Launch a new market in Lead Generator or revisit Prep if something needs another pass.
        </p>
      </div>
    );
  }

  const readinessState = currentLead ? getReadinessState(currentLead) : "NOT_READY";
  const missing = currentLead ? getMissingDataSummary(currentLead) : [];
  const checklist = currentLead ? getReadinessChecklist(currentLead) : [];
  const enrichment = parseEnrichment(currentLead?.enrichmentData || null);
  const currentLeadStage = currentLead ? getPrepStageBadge(currentLead) : null;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Prep"
        description="Handle the minimum prep needed to either approve a lead for first-touch or fix the blocker holding it back."
        count={leads.length}
      />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search intake and enrichment backlog"
                className="border-white/10 bg-black/30 pl-10"
              />
            </div>

            <div className="space-y-3">
              {filtered.map((lead, index) => {
                const state = getReadinessState(lead);
                const isActive = lead.id === currentLead?.id;
                const stage = getCanonicalLifecycleStage(lead);
                const stageBadge = getPrepStageBadge(lead);
                const previousStage = index > 0 ? getCanonicalLifecycleStage(filtered[index - 1]) : null;
                const showStageHeader = index === 0 || stage !== previousStage;

                return (
                  <div key={lead.id} className="space-y-3">
                    {showStageHeader ? (
                      <div className="px-1 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                        {stage === "INTAKE" ? "Incoming intake" : "Needs enrichment"}
                      </div>
                    ) : null}
                    <button
                    type="button"
                    onClick={() => setSelectedId(lead.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all ${
                      isActive
                        ? "border-cyan-500/20 bg-cyan-500/[0.08] shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                        : "border-white/[0.06] bg-black/20 hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{lead.businessName}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {lead.city} · {lead.niche}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${stageBadge.classes}`}>
                          {stageBadge.label}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getReadinessTone(state)}`}>
                          {getReadinessLabel(state)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {lead.websiteStatus ? `Website ${lead.websiteStatus.toLowerCase()}` : "Website pending"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {lead.email ? "Email found" : "No email"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {stage === "INTAKE" ? lead.source || "Source pending" : lead.enrichedAt ? "Reviewed" : "Awaiting review"}
                      </span>
                    </div>
                  </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-5">
          {currentLead ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Current lead</div>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{currentLead.businessName}</h3>
                  <div className="mt-2 text-sm text-zinc-400">
                    {currentLead.city} · {currentLead.niche}
                    {currentLead.source ? ` · ${currentLead.source}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {currentLeadStage ? (
                    <span className={`rounded-full border px-3 py-1.5 text-xs ${currentLeadStage.classes}`}>
                      {currentLeadStage.label}
                    </span>
                  ) : null}
                  <span className={`rounded-full border px-3 py-1.5 text-xs ${getReadinessTone(readinessState)}`}>
                    {getReadinessLabel(readinessState)}
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  What this lead needs next
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{readinessCopy(readinessState)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {missing.length > 0 ? (
                    missing.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
                      >
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
                      No missing prerequisites
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-5">
                  <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">Readiness checklist</div>
                    <div className="mt-3 space-y-2">
                      {checklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                        >
                          <span className="text-sm text-zinc-300">{item.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${
                              item.complete
                                ? "bg-emerald-500/10 text-emerald-200"
                                : "bg-white/[0.06] text-zinc-400"
                            }`}
                          >
                            {item.complete ? "Done" : "Open"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">Business snapshot</div>
                    <div className="mt-3 space-y-2 text-sm text-zinc-400">
                      <div>Email: <span className="text-zinc-200">{currentLead.email || "Missing"}</span></div>
                      <div>Contact: <span className="text-zinc-200">{currentLead.contactName || "Unknown"}</span></div>
                      <div>Website: <span className="text-zinc-200">{currentLead.websiteStatus || "Pending"}</span></div>
                      <div>Score: <span className="text-zinc-200">{typeof currentLead.axiomScore === "number" ? currentLead.axiomScore : "Pending"}</span></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">Context</div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {enrichment?.enrichmentSummary ||
                        "Run enrichment to pull a clearer read on contact quality, site quality, and fit before approving this lead."}
                    </p>
                    {enrichment?.keyPainPoint ? (
                      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-sm text-amber-200">
                        {enrichment.keyPainPoint}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">History</div>
                    <div className="mt-3 space-y-2 text-sm text-zinc-400">
                      <div>Created {formatWhen(currentLead.createdAt, "Unknown creation time")}</div>
                      <div>Last touched {formatWhen(currentLead.lastUpdated || currentLead.enrichedAt, "No updates yet")}</div>
                      <div>{currentLead.enrichedAt ? `Enriched ${formatWhen(currentLead.enrichedAt)}` : "Still waiting for first enrichment pass"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                <div className="text-sm font-medium text-white">Next move</div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {readinessState === "READY"
                    ? "This lead is ready to move straight into Initial Outreach."
                    : "Keep this in Prep and fix the missing pieces first. If the current read feels stale, refresh enrichment."}
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:flex-wrap">
                {readinessState === "READY" ? (
                  <Button
                    type="button"
                    onClick={() => void approveLead(currentLead.id)}
                    disabled={busyLeadId !== null || busyAction !== null}
                    className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200"
                  >
                    {busyAction === `${currentLead.id}:approve` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Approve for First Touch
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleEnrich(currentLead.id)}
                    disabled={busyLeadId === currentLead.id || busyAction !== null}
                    className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200"
                  >
                    {busyLeadId === currentLead.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {currentLead.enrichedAt ? "Refresh Prep" : "Run Enrichment"}
                  </Button>
                )}
                {readinessState === "READY" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleEnrich(currentLead.id)}
                    disabled={busyLeadId === currentLead.id || busyAction !== null}
                    className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Prep
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void archiveLead(currentLead.id)}
                  disabled={busyLeadId !== null || busyAction !== null}
                  className="rounded-full border border-rose-500/20 px-4 text-sm text-rose-200 hover:bg-rose-500/10"
                >
                  {busyAction === `${currentLead.id}:archive` ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  )}
                  Disqualify
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function QualificationPanel({
  leads,
  onRefresh,
  onReEnrich,
  onOpenEnrichment,
}: {
  leads: PreSendLead[];
  onRefresh: () => Promise<void>;
  onReEnrich: (leadIds: number[]) => Promise<void>;
  onOpenEnrichment: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(leads[0]?.id ?? null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const query = search.toLowerCase();
    return leads.filter(
      (lead) =>
        lead.businessName.toLowerCase().includes(query) ||
        lead.city.toLowerCase().includes(query) ||
        lead.niche.toLowerCase().includes(query) ||
        (lead.email || "").toLowerCase().includes(query),
    );
  }, [leads, search]);

  useEffect(() => {
    if (!filtered.some((lead) => lead.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const currentLead = filtered.find((lead) => lead.id === selectedId) ?? filtered[0] ?? null;
  const readinessState = currentLead ? getReadinessState(currentLead) : "NOT_READY";
  const missing = currentLead ? getMissingDataSummary(currentLead) : [];
  const enrichment = parseEnrichment(currentLead?.enrichmentData || null);

  const updateLeadStatus = async (leadId: number, outreachStatus: string) => {
    setBusyAction(`${leadId}:${outreachStatus}`);
    try {
      const response = await fetch(`/api/leads/${leadId}/outreach`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachStatus }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update lead status");
      }

      toast(
        outreachStatus === READY_FOR_FIRST_TOUCH_STATUS
          ? "Lead moved into Initial Outreach"
          : "Lead returned to pre-send review",
        { type: "success", icon: "note" },
      );
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const archiveLead = async (leadId: number) => {
    setBusyAction(`${leadId}:archive`);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to archive lead");
      }
      toast("Lead archived", { type: "success", icon: "note" });
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to archive lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="rounded-[24px] border border-white/[0.06] bg-black/20 px-6 py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-zinc-700" />
        <div className="mt-4 text-lg font-medium text-white">No leads waiting on qualification</div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Once enrichment has produced enough context, records will land here for explicit first-touch approval.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Qualification"
        description="Review enriched leads, make the pre-send decision explicit, and move only approved records into Initial Outreach."
        count={leads.length}
      />

      <div className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search qualification queue"
                className="border-white/10 bg-black/30 pl-10"
              />
            </div>

            <div className="space-y-3">
              {filtered.map((lead) => {
                const state = getReadinessState(lead);
                const isActive = lead.id === currentLead?.id;
                const missingCount = getMissingDataSummary(lead).length;

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedId(lead.id)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all ${
                      isActive
                        ? "border-purple-500/20 bg-purple-500/[0.08]"
                        : "border-white/[0.06] bg-black/20 hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{lead.businessName}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {lead.city} · {lead.niche}
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getReadinessTone(state)}`}>
                        {state === "READY" ? "Ready" : state === "ALMOST_READY" ? "Almost" : "Needs Work"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {typeof lead.axiomScore === "number" ? `Score ${lead.axiomScore}` : "Score pending"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {lead.email ? "Email found" : "No email"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                        {missingCount} blocker{missingCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-5">
          {currentLead ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Qualification review</div>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{currentLead.businessName}</h3>
                  <div className="mt-2 text-sm text-zinc-400">
                    {currentLead.city} · {currentLead.niche}
                  </div>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-xs ${getReadinessTone(readinessState)}`}>
                  {readinessState === "READY" ? "Ready for First Touch" : getReadinessLabel(readinessState)}
                </span>
              </div>

              <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  Decision summary
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {readinessState === "READY"
                    ? "This lead is strong enough to move into Initial Outreach now. The first-touch queue will take over from there."
                    : "This lead still needs more prep before it should enter first-touch execution. The blockers below should be cleared first."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {missing.length > 0 ? missing.map((item) => (
                    <span key={item} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                      {item}
                    </span>
                  )) : (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
                      Qualification clear
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">Why it looks ready</div>
                  <div className="mt-3 space-y-2 text-sm text-zinc-400">
                    <div>Email: <span className="text-zinc-200">{currentLead.email || "Missing"}</span></div>
                    <div>Website: <span className="text-zinc-200">{currentLead.websiteStatus || "Pending"}</span></div>
                    <div>Score: <span className="text-zinc-200">{typeof currentLead.axiomScore === "number" ? currentLead.axiomScore : "Pending"}</span></div>
                    <div>Hook: <span className="text-zinc-200">{enrichment?.pitchAngle || "Not generated yet"}</span></div>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">Recommended next move</div>
                  <div className="mt-3 text-sm leading-6 text-zinc-400">
                    {readinessState === "READY"
                      ? "Approve this lead for first-touch and let Initial Outreach own the pre-send execution."
                      : "Re-open enrichment to improve contact quality, website reading, or fit confidence before approving it."}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  onClick={() => void updateLeadStatus(currentLead.id, READY_FOR_FIRST_TOUCH_STATUS)}
                  disabled={readinessState !== "READY" || busyAction !== null}
                  className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200"
                >
                  {busyAction === `${currentLead.id}:${READY_FOR_FIRST_TOUCH_STATUS}` ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Mark Ready for First Touch
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void onReEnrich([currentLead.id])}
                  disabled={busyAction !== null}
                  className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-run enrichment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onOpenEnrichment}
                  disabled={busyAction !== null}
                  className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]"
                >
                  Back to Enrichment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void archiveLead(currentLead.id)}
                  disabled={busyAction !== null}
                  className="rounded-full border border-rose-500/20 px-4 text-sm text-rose-200 hover:bg-rose-500/10"
                >
                  {busyAction === `${currentLead.id}:archive` ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  )}
                  Disqualify
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function InitialOutreachPanel({
  leads,
  sequences,
  gmailConnected,
  onSendRequested,
  onQueueRequested,
  onRefresh,
}: {
  leads: PreSendLead[];
  sequences: PreSendSequence[];
  gmailConnected: boolean;
  onSendRequested: (leadIds: number[]) => void;
  onQueueRequested: (leadIds: number[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [queueing, setQueueing] = useState(false);

  const queuedOrSending = sequences.filter((sequence) => sequence.state === "QUEUED" || sequence.state === "SENDING");
  const blocked = sequences.filter((sequence) => sequence.state === "BLOCKED");
  const selectedCount = selectedIds.size;

  const toggleLead = (leadId: number) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(leads.map((lead) => lead.id)));
  };

  const queueSelected = async () => {
    const leadIds = Array.from(selectedIds);
    if (leadIds.length === 0) return;
    setQueueing(true);
    try {
      await onQueueRequested(leadIds);
      setSelectedIds(new Set());
      await onRefresh();
    } finally {
      setQueueing(false);
    }
  };

  const moveBackToQualification = async (leadId: number) => {
    try {
      const response = await fetch(`/api/leads/${leadId}/outreach`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachStatus: "NOT_CONTACTED" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to move lead back to Prep");
      }
      toast("Lead moved back to Prep", { type: "success", icon: "note" });
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to move lead", {
        type: "error",
        icon: "note",
      });
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Initial Outreach"
        description="This stage owns only unsent first-touch work. Once a first send succeeds, the lead leaves this page and moves into Follow-Up."
        count={leads.length + sequences.length}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[22px] border border-emerald-500/10 bg-emerald-500/[0.04] px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Ready</div>
          <div className="mt-1 text-2xl font-semibold text-white">{leads.length}</div>
          <div className="mt-1 text-xs text-zinc-500">qualified leads still waiting on first-touch</div>
        </div>
        <div className="rounded-[22px] border border-cyan-500/10 bg-cyan-500/[0.04] px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80">Queued</div>
          <div className="mt-1 text-2xl font-semibold text-white">{queuedOrSending.length}</div>
          <div className="mt-1 text-xs text-zinc-500">first-touch work already scheduled or sending</div>
        </div>
        <div className="rounded-[22px] border border-amber-500/10 bg-amber-500/[0.04] px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Blocked</div>
          <div className="mt-1 text-2xl font-semibold text-white">{blocked.length}</div>
          <div className="mt-1 text-xs text-zinc-500">pre-send blockers that need intervention</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-5">
          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-medium text-white">Ready for First Touch</div>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Qualified leads that have never been sent. Queue them for automatic first-touch or send them manually.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={toggleAll}
                  className="rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"
                >
                  {selectedIds.size === leads.length && leads.length > 0 ? "Deselect all" : "Select all"}
                </Button>
                <Button
                  type="button"
                  onClick={() => onSendRequested(Array.from(selectedIds))}
                  disabled={!gmailConnected || selectedIds.size === 0}
                  className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm text-emerald-200 hover:bg-emerald-500/15"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Send manually
                </Button>
                <Button
                  type="button"
                  onClick={() => void queueSelected()}
                  disabled={!gmailConnected || selectedIds.size === 0 || queueing}
                  className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200"
                >
                  {queueing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Queue Initial Send
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-3 text-sm text-zinc-400">
              {selectedCount > 0
                ? `${selectedCount} lead${selectedCount === 1 ? "" : "s"} selected. Send manually for hands-on first-touch, or queue them so automation handles first-touch timing.`
                : "Select one or more leads, then choose between manual sending and queued first-touch automation."}
            </div>

            <div className="mt-4 space-y-3">
              {leads.length === 0 ? (
                <div className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-10 text-center text-sm text-zinc-500">
                  No leads are approved for first-touch right now. Finish Prep first, then come back here to launch them.
                </div>
              ) : (
                leads.map((lead) => (
                  <div key={lead.id} className="flex items-start gap-3 rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <button
                      type="button"
                      onClick={() => toggleLead(lead.id)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selectedIds.has(lead.id)
                          ? "border-cyan-500 bg-cyan-500 text-white"
                          : "border-white/20 hover:border-cyan-500/50"
                      }`}
                    >
                      {selectedIds.has(lead.id) ? <CheckCircle2 className="h-3 w-3" /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{lead.businessName}</span>
                        {typeof lead.axiomScore === "number" && (
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">
                            Score {lead.axiomScore}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {lead.city} · {lead.niche} · {lead.email || "No email"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void moveBackToQualification(lead.id)}
                      className="rounded-full border border-white/10 px-3 text-xs text-white hover:bg-white/[0.04]"
                    >
                      Move to Prep
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-sm font-medium text-white">Queued and Sending First Touch</div>
            <div className="mt-4 space-y-3">
              {queuedOrSending.length === 0 ? (
                <div className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-8 text-sm text-zinc-500">
                  Nothing is scheduled for first-touch yet.
                </div>
              ) : (
                queuedOrSending.map((sequence) => (
                  <div key={sequence.id} className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{sequence.lead?.businessName || "Unknown lead"}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {sequence.lead?.city} · {sequence.mailbox?.label || sequence.mailbox?.gmailAddress || "Mailbox pending"}
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(sequence.state)}`}>
                        {stateLabel(sequence.state)}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-zinc-400">
                      {sequence.nextSendAt ? `Next send ${formatWhen(sequence.nextSendAt)}` : "Send time pending"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-sm font-medium text-white">Blocked Before First Send</div>
            <div className="mt-4 space-y-3">
              {blocked.length === 0 ? (
                <div className="rounded-[20px] border border-white/[0.06] bg-black/20 px-4 py-8 text-sm text-zinc-500">
                  No pre-send blockers are active.
                </div>
              ) : (
                blocked.map((sequence) => (
                  <div key={sequence.id} className="rounded-[20px] border border-amber-500/10 bg-amber-500/[0.04] px-4 py-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{sequence.lead?.businessName || "Unknown lead"}</div>
                        <div className="mt-1 text-xs text-amber-100/80">{sequence.blockerLabel || "Blocked"}</div>
                        <div className="mt-2 text-xs leading-5 text-zinc-400">{sequence.blockerDetail || "This sequence needs operator attention before first-touch can send."}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4">
              <Button asChild variant="ghost" className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]">
                <Link href="/automation">
                  Open Follow-Up Console
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
