"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  Mail,
  Search,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { EmailComposer } from "@/components/outreach/email-composer";

type Lead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  outreachStatus: string;
  outreachChannel: string | null;
  firstContactedAt: string | null;
  lastContactedAt: string | null;
  nextFollowUpDue: string | null;
  enrichedAt: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  websiteStatus: string | null;
  createdAt: string;
};

type Stats = {
  total: number;
  notContacted: number;
  enriching: number;
  enriched: number;
  readyForTouch: number;
  outreached: number;
  followUp: number;
  replied: number;
  notInterested: number;
};

type FilterId =
  | "all"
  | "not_contacted"
  | "enriching"
  | "enriched"
  | "ready"
  | "outreached"
  | "follow_up"
  | "replied"
  | "not_interested";

const FILTERS: { id: FilterId; label: string; statKey: keyof Stats }[] = [
  { id: "all", label: "All", statKey: "total" },
  { id: "not_contacted", label: "New", statKey: "notContacted" },
  { id: "enriching", label: "Enriching", statKey: "enriching" },
  { id: "enriched", label: "Enriched", statKey: "enriched" },
  { id: "ready", label: "Ready", statKey: "readyForTouch" },
  { id: "outreached", label: "Sent", statKey: "outreached" },
  { id: "follow_up", label: "Follow-up", statKey: "followUp" },
  { id: "replied", label: "Replied", statKey: "replied" },
  { id: "not_interested", label: "Declined", statKey: "notInterested" },
];

// Map ?stage= query param values to internal filter ids so Dashboard can deep-link.
const STAGE_QUERY_MAP: Record<string, FilterId> = {
  new: "not_contacted",
  "not-contacted": "not_contacted",
  enrichment: "enriching",
  enriching: "enriching",
  enriched: "enriched",
  ready: "ready",
  initial: "ready",
  "first-touch": "ready",
  sent: "outreached",
  outreached: "outreached",
  "follow-up": "follow_up",
  followup: "follow_up",
  replied: "replied",
  declined: "not_interested",
  "not-interested": "not_interested",
};

function matchFilter(status: string, filter: FilterId): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "not_contacted":
      return status === "NOT_CONTACTED";
    case "enriching":
      return status === "ENRICHING";
    case "enriched":
      return status === "ENRICHED";
    case "ready":
      return status === "READY_FOR_FIRST_TOUCH";
    case "outreached":
      return status === "OUTREACHED";
    case "follow_up":
      return status === "FOLLOW_UP_DUE";
    case "replied":
      return status === "REPLIED" || status === "INTERESTED";
    case "not_interested":
      return status === "NOT_INTERESTED";
    default:
      return true;
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    NOT_CONTACTED: "New",
    ENRICHING: "Enriching",
    ENRICHED: "Enriched",
    READY_FOR_FIRST_TOUCH: "Ready",
    OUTREACHED: "Sent",
    FOLLOW_UP_DUE: "Follow-up",
    REPLIED: "Replied",
    INTERESTED: "Interested",
    NOT_INTERESTED: "Declined",
  };
  return labels[status] || status;
}

function statusColor(status: string): string {
  switch (status) {
    case "REPLIED":
    case "INTERESTED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "OUTREACHED":
    case "READY_FOR_FIRST_TOUCH":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "ENRICHING":
      return "border-violet-500/20 bg-violet-500/10 text-violet-300";
    case "ENRICHED":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "FOLLOW_UP_DUE":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "NOT_INTERESTED":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-white/[0.06] bg-white/[0.04] text-zinc-400";
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type SortKey =
  | "businessName"
  | "city"
  | "axiomScore"
  | "outreachStatus"
  | "lastContactedAt"
  | "createdAt";

const READY_STATUS = "READY_FOR_FIRST_TOUCH";
const ENRICHABLE_STATUSES = new Set(["NOT_CONTACTED", "ENRICHING"]);
const QUEUEABLE_STATUSES = new Set([READY_STATUS, "ENRICHED"]);

export function OutreachDatabase({
  initialLeads,
  stats,
}: {
  initialLeads: Lead[];
  stats: Stats;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Seed filter from ?stage= (Dashboard deep-links) on first render.
  const initialStage = searchParams.get("stage")?.toLowerCase() ?? null;
  const seededFilter: FilterId =
    initialStage && STAGE_QUERY_MAP[initialStage] ? STAGE_QUERY_MAP[initialStage] : "all";

  const [filter, setFilter] = useState<FilterId>(seededFilter);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<null | "queue" | "send-now" | "enrich">(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLeadIds, setComposerLeadIds] = useState<number[]>([]);

  // Keep URL in sync with active filter so deep-links stay canonical and
  // back/forward navigation works as expected.
  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (filter === "all") {
      params.delete("stage");
    } else {
      // Use the first key in STAGE_QUERY_MAP that points to this filter for a
      // human-readable URL. Fallback: the internal id.
      const humanKey =
        Object.entries(STAGE_QUERY_MAP).find(([, value]) => value === filter)?.[0] ?? filter;
      params.set("stage", humanKey);
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `/outreach?${next}` : "/outreach", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let results = initialLeads.filter((l) => matchFilter(l.outreachStatus, filter));
    if (q) {
      results = results.filter(
        (l) =>
          l.businessName.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.niche?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.contactName?.toLowerCase().includes(q),
      );
    }
    results.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "businessName":
          cmp = a.businessName.localeCompare(b.businessName);
          break;
        case "city":
          cmp = (a.city || "").localeCompare(b.city || "");
          break;
        case "axiomScore":
          cmp = (a.axiomScore || 0) - (b.axiomScore || 0);
          break;
        case "outreachStatus":
          cmp = a.outreachStatus.localeCompare(b.outreachStatus);
          break;
        case "lastContactedAt":
          cmp =
            new Date(a.lastContactedAt || 0).getTime() -
            new Date(b.lastContactedAt || 0).getTime();
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return results;
  }, [initialLeads, filter, search, sortKey, sortDir]);

  // Derive selection metadata so buttons know when they're actionable. We only
  // enable Queue / Send Now for leads already past enrichment, and Enrich for
  // leads that still need it.
  const selection = useMemo(() => {
    const leads = filtered.filter((l) => selectedIds.has(l.id));
    return {
      leads,
      count: leads.length,
      queueable: leads.filter((l) => QUEUEABLE_STATUSES.has(l.outreachStatus)),
      enrichable: leads.filter((l) => ENRICHABLE_STATUSES.has(l.outreachStatus)),
      sendable: leads.filter((l) => l.outreachStatus === READY_STATUS && l.email),
    };
  }, [filtered, selectedIds]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleLead = (leadId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAll = () => {
    const allVisible = filtered.every((l) => selectedIds.has(l.id));
    if (allVisible && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const queueForAutomation = async (immediate: boolean) => {
    const leadIds = selection.queueable.map((l) => l.id);
    if (leadIds.length === 0) {
      toast("Select leads that are Ready or Enriched to queue them.", {
        type: "error",
        icon: "note",
      });
      return;
    }
    setBusy(immediate ? "send-now" : "queue");
    try {
      const res = await fetch("/api/outreach/automation/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, immediate }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to queue");

      const queued = data?.queued?.length || 0;
      const skipped = data?.skipped?.length || 0;
      toast(
        queued > 0
          ? immediate
            ? `Sending ${queued} lead${queued === 1 ? "" : "s"} now${skipped ? `, skipped ${skipped}` : ""}`
            : `Queued ${queued} lead${queued === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`
          : `No leads were queued${skipped ? `, skipped ${skipped}` : ""}`,
        { type: queued > 0 ? "success" : "error", icon: "note" },
      );
      clearSelection();
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to queue", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusy(null);
    }
  };

  const enrichSelected = async () => {
    const leadIds = selection.enrichable.map((l) => l.id);
    if (leadIds.length === 0) {
      toast("Select New or Enriching leads to enrich.", { type: "error", icon: "note" });
      return;
    }
    setBusy("enrich");
    try {
      const res = await fetch("/api/outreach/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: leadIds.slice(0, 50) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to enrich");
      toast(`Enriched ${data?.enriched ?? leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`, {
        type: "success",
        icon: "note",
      });
      clearSelection();
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to enrich", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusy(null);
    }
  };

  const openManualSend = () => {
    const leadIds = selection.sendable.map((l) => l.id);
    if (leadIds.length === 0) {
      toast("Select Ready leads with an email to send manually.", {
        type: "error",
        icon: "note",
      });
      return;
    }
    setComposerLeadIds(leadIds);
    setComposerOpen(true);
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Outreach</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Lead database — {stats.total.toLocaleString()} leads
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="h-8 w-64 rounded-lg border border-white/[0.06] bg-white/[0.02] pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10"
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-3">
        {FILTERS.map((f) => {
          const count = stats[f.statKey];
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 tabular-nums ${
                    isActive ? "text-zinc-300" : "text-zinc-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] text-zinc-500">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  disabled={filtered.length === 0}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-transparent accent-cyan-400"
                />
              </th>
              <SortTh label="Business" sortKey="businessName" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="City" sortKey="city" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Contact</th>
              <SortTh label="Score" sortKey="axiomScore" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Status" sortKey="outreachStatus" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Last contact" sortKey="lastContactedAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Added" sortKey="createdAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-xs text-zinc-500" colSpan={8}>
                  {search ? "No leads match your search." : "No leads in this category."}
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const isSelected = selectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={`group transition-colors ${
                      isSelected ? "bg-cyan-500/[0.06]" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.businessName}`}
                        checked={isSelected}
                        onChange={() => toggleLead(lead.id)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-transparent accent-cyan-400"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/lead/${lead.id}`}
                        className="text-sm font-medium text-white transition-colors hover:text-cyan-300"
                      >
                        {lead.businessName}
                      </Link>
                      <div className="text-[11px] text-zinc-600">{lead.niche}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400">{lead.city}</td>
                    <td className="px-3 py-2.5">
                      {lead.email ? (
                        <div>
                          <div className="text-xs text-zinc-300">{lead.contactName || "—"}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{lead.email}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">No email</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {lead.axiomScore != null ? (
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            lead.axiomScore >= 70
                              ? "text-emerald-300"
                              : lead.axiomScore >= 50
                                ? "text-cyan-300"
                                : lead.axiomScore >= 35
                                  ? "text-amber-300"
                                  : "text-zinc-500"
                          }`}
                        >
                          {lead.axiomScore}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusColor(
                          lead.outreachStatus,
                        )}`}
                      >
                        {statusLabel(lead.outreachStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">
                      {fmtDate(lead.lastContactedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-600">
                      {fmtDate(lead.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Count */}
      <div className="text-xs tabular-nums text-zinc-600">
        Showing {filtered.length.toLocaleString()} of {stats.total.toLocaleString()} leads
      </div>

      {/* Sticky bulk-action bar. Only appears when the user has selected leads,
          so it never gets in the way of browsing. */}
      {selection.count > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-950/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur">
            <button
              type="button"
              onClick={clearSelection}
              className="cursor-pointer rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-xs text-zinc-400">
              <span className="font-semibold tabular-nums text-white">{selection.count}</span>{" "}
              selected
              <span className="ml-2 text-zinc-600">
                · {selection.sendable.length} sendable · {selection.queueable.length} queueable ·{" "}
                {selection.enrichable.length} enrichable
              </span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void enrichSelected()}
                disabled={busy !== null || selection.enrichable.length === 0}
                title="Run AI enrichment on New / Enriching leads"
                className="h-8 cursor-pointer gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
              >
                {busy === "enrich" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Enrich
                {selection.enrichable.length > 0 && ` (${selection.enrichable.length})`}
              </Button>
              <Button
                type="button"
                onClick={openManualSend}
                disabled={busy !== null || selection.sendable.length === 0}
                title="Send personalized emails manually via Gmail"
                className="h-8 cursor-pointer gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                <Mail className="h-3.5 w-3.5" />
                Send manually
                {selection.sendable.length > 0 && ` (${selection.sendable.length})`}
              </Button>
              <Button
                type="button"
                onClick={() => void queueForAutomation(false)}
                disabled={busy !== null || selection.queueable.length === 0}
                title="Queue for the automation scheduler (respects daily caps + min-delay)"
                className="h-8 cursor-pointer gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
              >
                {busy === "queue" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Queue
                {selection.queueable.length > 0 && ` (${selection.queueable.length})`}
              </Button>
              <Button
                type="button"
                onClick={() => void queueForAutomation(true)}
                disabled={busy !== null || selection.queueable.length === 0}
                title="Queue and fast-forward step 1 — dispatches on the next cron tick (within 60s)"
                className="h-8 cursor-pointer gap-1.5 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-400 to-orange-500 px-3 text-xs font-semibold text-black hover:from-amber-300 hover:to-orange-400 disabled:opacity-40"
              >
                {busy === "send-now" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Send now
              </Button>
            </div>
          </div>
        </div>
      )}

      {composerOpen && (
        <EmailComposer
          leadIds={composerLeadIds}
          onClose={() => setComposerOpen(false)}
          onComplete={() => {
            setComposerOpen(false);
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SortTh({
  label,
  sortKey: key,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = active === key;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left font-medium transition-colors hover:text-zinc-300"
      onClick={() => onClick(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <ChevronDown
            className={`h-3 w-3 transition-transform ${dir === "asc" ? "rotate-180" : ""}`}
          />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40" />
        )}
      </span>
    </th>
  );
}
