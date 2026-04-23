"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Brain,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import type { EnrichmentResult } from "@/lib/outreach-enrichment";

type EnrichedLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  contactName: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  websiteStatus: string | null;
  enrichedAt: string | null;
  enrichmentData: string | null;
  outreachStatus: string | null;
};

type EnrichmentPanelProps = {
  leads: EnrichedLead[];
  gmailConnected: boolean;
  onSendRequested: (leadIds: number[]) => void;
  onQueueRequested: (leadIds: number[], options?: { immediate?: boolean }) => Promise<void>;
  onLeadsUpdated: () => void;
  queuedLeadIds: number[];
};

function parseEnrichment(data: string | null): EnrichmentResult | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as EnrichmentResult;
  } catch {
    return null;
  }
}

const TONE_COLORS: Record<string, string> = {
  casual: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  professional: "border-purple-500/20 bg-purple-500/10 text-purple-300",
  urgent: "border-red-500/20 bg-red-500/10 text-red-300",
};

export function EnrichmentPanel({
  leads,
  gmailConnected,
  onSendRequested,
  onQueueRequested,
  onLeadsUpdated,
  queuedLeadIds,
}: EnrichmentPanelProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [enriching, setEnriching] = useState<Set<number>>(new Set());
  const [queueing, setQueueing] = useState(false);
  const queuedSet = useMemo(() => new Set(queuedLeadIds), [queuedLeadIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const query = search.toLowerCase();
    return leads.filter(
      (lead) =>
        lead.businessName.toLowerCase().includes(query) ||
        (lead.city || "").toLowerCase().includes(query) ||
        (lead.niche || "").toLowerCase().includes(query) ||
        (lead.email || "").toLowerCase().includes(query),
    );
  }, [leads, search]);

  const allSelected = filtered.length > 0 && filtered.every((lead) => selectedIds.has(lead.id));
  const selectedCount = selectedIds.size;
  const queuedCount = filtered.filter((lead) => queuedSet.has(lead.id)).length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((lead) => lead.id)));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReEnrich = useCallback(
    async (leadIds: number[]) => {
      setEnriching((prev) => new Set([...prev, ...leadIds]));
      try {
        const res = await fetch("/api/outreach/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Enrichment failed");
        }

        const data = await res.json();
        toast(`Re-enriched ${data.enriched} lead${data.enriched !== 1 ? "s" : ""}`, {
          type: "success",
          icon: "note",
        });
        onLeadsUpdated();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Enrichment failed", {
          type: "error",
          icon: "note",
        });
      } finally {
        setEnriching((prev) => {
          const next = new Set(prev);
          for (const id of leadIds) next.delete(id);
          return next;
        });
      }
    },
    [onLeadsUpdated, toast],
  );

  const handleSendSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onSendRequested(ids);
  };

  const handleQueueSelected = async () => {
    const ids = Array.from(selectedIds).filter((id) => !queuedSet.has(id));
    if (ids.length === 0) {
      toast("Selected leads are already queued", { type: "success", icon: "note" });
      return;
    }
    setQueueing(true);
    try {
      await onQueueRequested(ids);
      setSelectedIds(new Set());
    } finally {
      setQueueing(false);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[24px] border border-white/[0.06] bg-black/20 px-6 py-16 text-center">
        <Brain className="mb-4 h-12 w-12 text-zinc-700" />
        <div className="text-base font-medium text-white">No enriched leads yet</div>
        <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
          Enrich leads from the Pipeline tab and they will appear here ready for a manual send or
          automation queueing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-white">Ready for outreach</div>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Review enriched leads, queue them for automation, or launch a manual send without
                leaving this workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                {filtered.length} visible
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                {queuedCount} already queued
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                {selectedCount} selected
              </span>
            </div>
          </div>

          <div className="w-full max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search enriched leads"
                className="border-white/10 bg-black/30 pl-10"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            className="rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04]"
          >
            {allSelected ? <X className="h-3 w-3" /> : <CheckCheck className="h-3 w-3" />}
            {allSelected ? "Deselect all" : "Select all"}
          </Button>

          {selectedCount > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleReEnrich(Array.from(selectedIds))}
                disabled={enriching.size > 0}
                className="rounded-full border border-purple-500/20 bg-purple-500/5 px-3 text-xs text-purple-300 hover:bg-purple-500/10"
              >
                <RefreshCw className={`h-3 w-3 ${enriching.size > 0 ? "animate-spin" : ""}`} />
                Re-enrich
              </Button>
              <Button
                size="sm"
                onClick={() => void handleQueueSelected()}
                disabled={!gmailConnected || queueing}
                className="rounded-full bg-white px-3 text-xs text-black hover:bg-zinc-200"
              >
                {queueing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Queue automation
              </Button>
              <Button
                size="sm"
                onClick={handleSendSelected}
                disabled={!gmailConnected}
                className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 text-xs text-emerald-200 hover:bg-emerald-500/15"
              >
                <Mail className="h-3.5 w-3.5" />
                Send now
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((lead) => {
          const enrichment = parseEnrichment(lead.enrichmentData);
          const isExpanded = expandedId === lead.id;
          const isEnriching = enriching.has(lead.id);
          const isSelected = selectedIds.has(lead.id);

          return (
            <div
              key={lead.id}
              className={`rounded-[24px] border transition-all ${
                isSelected
                  ? "border-purple-500/30 bg-purple-500/[0.04]"
                  : "border-white/[0.06] bg-black/20 hover:border-white/[0.12]"
              }`}
            >
              <div className="flex items-start gap-3 px-4 py-4">
                <button
                  onClick={() => toggleOne(lead.id)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                    isSelected
                      ? "border-purple-500 bg-purple-500 text-white"
                      : "border-white/20 hover:border-purple-500/50"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white">{lead.businessName}</span>
                    {typeof lead.axiomScore === "number" && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">
                        Score {lead.axiomScore}
                      </span>
                    )}
                    {lead.axiomTier && (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">
                        Tier {lead.axiomTier}
                      </span>
                    )}
                    {queuedSet.has(lead.id) && (
                      <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300">
                        In automation
                      </span>
                    )}
                    {lead.outreachStatus === "OUTREACHED" && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                        Sent
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>{lead.city}</span>
                    <span>{lead.niche}</span>
                    <span>{lead.email || "No email available"}</span>
                  </div>

                  {enrichment && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] ${TONE_COLORS[enrichment.emailTone] || TONE_COLORS.professional}`}
                      >
                        {enrichment.emailTone}
                      </span>
                      {enrichment.pitchAngle && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400">
                          {enrichment.pitchAngle}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {isEnriching && <Loader2 className="h-4 w-4 animate-spin text-purple-400" />}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className="rounded-full border border-white/10 p-2 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && enrichment && (
                <div className="border-t border-white/[0.06] px-4 py-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Value proposition</div>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          {enrichment.valueProposition}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Pitch angle</div>
                        <p className="mt-1 text-sm leading-6 text-emerald-300">
                          {enrichment.pitchAngle}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Key pain point</div>
                        <p className="mt-1 text-sm leading-6 text-amber-300">
                          {enrichment.keyPainPoint}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Competitive edge</div>
                        <p className="mt-1 text-sm leading-6 text-cyan-300">
                          {enrichment.competitiveEdge}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Personalized hook</div>
                        <p className="mt-1 text-sm italic leading-6 text-zinc-300">
                          &ldquo;{enrichment.personalizedHook}&rdquo;
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-300">Recommended CTA</div>
                        <p className="mt-1 text-sm leading-6 text-blue-300">
                          {enrichment.recommendedCTA}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="text-xs font-medium text-zinc-300">Summary</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {enrichment.enrichmentSummary || "No summary was generated for this lead."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="text-xs font-medium text-zinc-300">Likely objections</div>
                      <ul className="mt-2 space-y-2">
                        {enrichment.anticipatedObjections.map((objection, index) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-zinc-400">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-400" />
                            <span>{objection}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
