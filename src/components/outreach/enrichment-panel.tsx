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
  onLeadsUpdated: () => void;
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
  casual: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  professional: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  urgent: "text-red-400 bg-red-500/10 border-red-500/20",
};

export function EnrichmentPanel({ leads, gmailConnected, onSendRequested, onLeadsUpdated }: EnrichmentPanelProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [enriching, setEnriching] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.businessName.toLowerCase().includes(q) ||
        (l.city || "").toLowerCase().includes(q) ||
        (l.niche || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
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

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 px-6 py-16 text-center">
        <Brain className="mb-4 h-12 w-12 text-zinc-700" />
        <div className="text-sm font-semibold text-white">No Enriched Leads Yet</div>
        <div className="mt-1 max-w-sm text-xs text-zinc-500">
          Select leads from the Pipeline tab and click &quot;Enrich with AI&quot; to analyze them with DeepSeek. Enriched leads will appear here ready for automated email outreach.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search enriched leads..."
            className="border-white/10 bg-black/30 pl-10 focus:border-purple-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            className="gap-1.5 border border-white/[0.08] text-xs text-zinc-400 hover:text-white"
          >
            {allSelected ? <X className="h-3 w-3" /> : <CheckCheck className="h-3 w-3" />}
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReEnrich(Array.from(selectedIds))}
                disabled={enriching.size > 0}
                className="gap-1.5 border border-purple-500/20 bg-purple-500/5 text-xs text-purple-300 hover:bg-purple-500/10"
              >
                <RefreshCw className={`h-3 w-3 ${enriching.size > 0 ? "animate-spin" : ""}`} />
                Re-Enrich ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                onClick={handleSendSelected}
                disabled={!gmailConnected}
                className="gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" />
                Send Outreach ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Lead List */}
      <div className="space-y-2">
        {filtered.map((lead) => {
          const enrichment = parseEnrichment(lead.enrichmentData);
          const isExpanded = expandedId === lead.id;
          const isEnriching = enriching.has(lead.id);

          return (
            <div
              key={lead.id}
              className={`rounded-xl border transition-all duration-200 ${
                selectedIds.has(lead.id)
                  ? "border-purple-500/30 bg-purple-500/[0.04]"
                  : "border-white/[0.06] bg-black/20 hover:border-white/[0.1]"
              }`}
            >
              {/* Row Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleOne(lead.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                    selectedIds.has(lead.id)
                      ? "border-purple-500 bg-purple-500 text-white"
                      : "border-white/20 hover:border-purple-500/50"
                  }`}
                >
                  {selectedIds.has(lead.id) && <Check className="h-3 w-3" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{lead.businessName}</span>
                    {lead.axiomTier && (
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        lead.axiomTier === "S" ? "bg-amber-500/20 text-amber-300" :
                        lead.axiomTier === "A" ? "bg-emerald-500/20 text-emerald-300" :
                        "bg-zinc-500/20 text-zinc-400"
                      }`}>
                        {lead.axiomTier}
                      </span>
                    )}
                    {lead.outreachStatus === "OUTREACHED" && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] bg-cyan-500/20 text-cyan-300">Sent</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{lead.city}</span>
                    <span>•</span>
                    <span className="font-mono text-purple-400/80">{lead.niche}</span>
                    {lead.email && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-cyan-400/70">{lead.email}</span>
                      </>
                    )}
                  </div>
                </div>

                {enrichment && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE_COLORS[enrichment.emailTone] || TONE_COLORS.professional}`}>
                    {enrichment.emailTone}
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {isEnriching && <Loader2 className="h-4 w-4 animate-spin text-purple-400" />}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className="rounded p-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded Enrichment Detail */}
              {isExpanded && enrichment && (
                <div className="border-t border-white/[0.06] px-4 py-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
                          <Sparkles className="h-3 w-3 text-purple-400" /> Value Proposition
                        </div>
                        <p className="text-xs leading-relaxed text-zinc-300">{enrichment.valueProposition}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Pitch Angle</div>
                        <p className="text-xs leading-relaxed text-emerald-300">{enrichment.pitchAngle}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Key Pain Point</div>
                        <p className="text-xs leading-relaxed text-amber-300">{enrichment.keyPainPoint}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Competitive Edge</div>
                        <p className="text-xs leading-relaxed text-cyan-300">{enrichment.competitiveEdge}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Personalized Hook</div>
                        <p className="text-xs italic leading-relaxed text-zinc-300">&ldquo;{enrichment.personalizedHook}&rdquo;</p>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Anticipated Objections</div>
                        <ul className="space-y-1">
                          {enrichment.anticipatedObjections.map((obj, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-red-300/80">
                              <span className="mt-0.5 text-red-500">•</span>
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Recommended CTA</div>
                        <p className="text-xs leading-relaxed text-blue-300">{enrichment.recommendedCTA}</p>
                      </div>
                    </div>
                  </div>
                  {enrichment.enrichmentSummary && (
                    <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Summary</div>
                      <p className="text-xs leading-relaxed text-zinc-400">{enrichment.enrichmentSummary}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
