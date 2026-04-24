"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Globe,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  UserCircle2,
  Wand2,
  X,
  XCircle,
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

type StageDef = {
  id: FilterId;
  label: string;
  shortLabel: string;
  statKey: keyof Stats;
  icon: typeof CircleDashed;
  accentFrom: string;
  accentTo: string;
  accentText: string;
  description: string;
};

// Ordered left-to-right as leads move through the funnel. "All" and the two
// terminal states (Replied / Declined) sit outside the main funnel as chips.
const FUNNEL_STAGES: StageDef[] = [
  {
    id: "not_contacted",
    label: "New",
    shortLabel: "New",
    statKey: "notContacted",
    icon: CircleDashed,
    accentFrom: "from-zinc-500/30",
    accentTo: "to-zinc-600/10",
    accentText: "text-zinc-300",
    description: "Sourced — awaiting enrichment",
  },
  {
    id: "enriching",
    label: "Enriching",
    shortLabel: "Enriching",
    statKey: "enriching",
    icon: Wand2,
    accentFrom: "from-violet-500/40",
    accentTo: "to-violet-600/10",
    accentText: "text-violet-300",
    description: "AI is filling in contact + signals",
  },
  {
    id: "enriched",
    label: "Enriched",
    shortLabel: "Enriched",
    statKey: "enriched",
    icon: Sparkles,
    accentFrom: "from-blue-500/40",
    accentTo: "to-blue-600/10",
    accentText: "text-blue-300",
    description: "Data complete — ready to qualify",
  },
  {
    id: "ready",
    label: "Ready",
    shortLabel: "Ready",
    statKey: "readyForTouch",
    icon: MailCheck,
    accentFrom: "from-emerald-500/40",
    accentTo: "to-emerald-600/10",
    accentText: "text-emerald-300",
    description: "Approved for first-touch send",
  },
  {
    id: "outreached",
    label: "Sent",
    shortLabel: "Sent",
    statKey: "outreached",
    icon: Send,
    accentFrom: "from-cyan-500/40",
    accentTo: "to-cyan-600/10",
    accentText: "text-cyan-300",
    description: "First email landed — awaiting reply",
  },
  {
    id: "follow_up",
    label: "Follow-up",
    shortLabel: "Follow-up",
    statKey: "followUp",
    icon: Mail,
    accentFrom: "from-amber-500/40",
    accentTo: "to-amber-600/10",
    accentText: "text-amber-300",
    description: "Automated follow-up due",
  },
];

const TERMINAL_CHIPS: { id: FilterId; label: string; statKey: keyof Stats; tone: string }[] = [
  {
    id: "replied",
    label: "Replied",
    statKey: "replied",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "not_interested",
    label: "Declined",
    statKey: "notInterested",
    tone: "border-red-500/30 bg-red-500/10 text-red-300",
  },
];

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

function statusDotColor(status: string): string {
  switch (status) {
    case "REPLIED":
    case "INTERESTED":
      return "bg-emerald-400";
    case "OUTREACHED":
      return "bg-cyan-400";
    case "READY_FOR_FIRST_TOUCH":
      return "bg-emerald-400";
    case "ENRICHING":
      return "bg-violet-400";
    case "ENRICHED":
      return "bg-blue-400";
    case "FOLLOW_UP_DUE":
      return "bg-amber-400";
    case "NOT_INTERESTED":
      return "bg-red-400";
    default:
      return "bg-zinc-500";
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const day = 86400000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function tierColor(tier: string | null): string {
  switch (tier) {
    case "A":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
    case "B":
      return "border-cyan-500/40 bg-cyan-500/15 text-cyan-200";
    case "C":
      return "border-amber-500/40 bg-amber-500/15 text-amber-200";
    case "D":
      return "border-red-500/40 bg-red-500/15 text-red-200";
    default:
      return "border-white/[0.08] bg-white/[0.04] text-zinc-400";
  }
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-zinc-600";
  if (score >= 70) return "text-emerald-300";
  if (score >= 50) return "text-cyan-300";
  if (score >= 35) return "text-amber-300";
  return "text-zinc-500";
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

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (filter === "all") {
      params.delete("stage");
    } else {
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
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
    if (allVisible && filtered.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const queueForAutomation = async (immediate: boolean) => {
    const leadIds = selection.queueable.map((l) => l.id);
    if (leadIds.length === 0) {
      toast("Select Ready or Enriched leads to queue.", { type: "error", icon: "note" });
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
      toast(
        `Enriched ${data?.enriched ?? leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`,
        { type: "success", icon: "note" },
      );
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

  // Compute max stage count for proportional bar heights in the funnel.
  const maxStageValue = Math.max(1, ...FUNNEL_STAGES.map((s) => stats[s.statKey]));

  return (
    <div className="space-y-6 pb-28">
      {/* Hero: page title + total + primary action */}
      <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.10),transparent_50%),radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.08),transparent_50%)] px-6 py-7 md:px-8 md:py-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-emerald-400/80">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Outreach Pipeline
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {stats.total.toLocaleString()}
              <span className="ml-3 text-lg font-normal text-zinc-500">
                lead{stats.total === 1 ? "" : "s"} across {FUNNEL_STAGES.length} stages
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Move leads from sourced to sent. Click any stage to filter, select rows to enrich or
              dispatch, or hit{" "}
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200">
                Send now
              </span>{" "}
              to fast-forward the queue.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search business, city, email, contact…"
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 backdrop-blur-xl focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 lg:w-96"
            />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="app-panel-quiet rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Total leads</div>
            <div className="mt-2 text-2xl font-semibold text-white">{stats.total.toLocaleString()}</div>
          </div>
          <div className="app-panel-quiet rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Needs prep</div>
            <div className="mt-2 text-2xl font-semibold text-violet-200">{(stats.notContacted + stats.enriching).toLocaleString()}</div>
          </div>
          <div className="app-panel-quiet rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Ready</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200">{stats.readyForTouch.toLocaleString()}</div>
          </div>
          <div className="app-panel-quiet rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Follow-ups</div>
            <div className="mt-2 text-2xl font-semibold text-amber-200">{stats.followUp.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Stage funnel — the main visual landmark of the page. Each column is a
          click-to-filter button with a proportional height bar, a big count,
          and a caption. Terminal chips (Replied / Declined) + All sit below. */}
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Funnel</div>
            <div className="mt-0.5 text-sm font-medium text-white">Click a stage to filter</div>
          </div>
          <button
            onClick={() => setFilter("all")}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "all"
                ? "border-white/20 bg-white/10 text-white"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            All · {stats.total.toLocaleString()}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {FUNNEL_STAGES.map((stage, idx) => {
            const value = stats[stage.statKey];
            const isActive = filter === stage.id;
            const heightPct = Math.max(8, Math.round((value / maxStageValue) * 100));
            const Icon = stage.icon;
            return (
              <button
                key={stage.id}
                onClick={() => setFilter(stage.id)}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-white/20 bg-white/[0.06] shadow-[0_0_40px_rgba(255,255,255,0.04)]"
                    : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.03]"
                } cursor-pointer`}
              >
                {/* Background bar representing proportional volume. */}
                <div
                  className={`absolute inset-x-0 bottom-0 bg-gradient-to-t ${stage.accentFrom} ${stage.accentTo} transition-all duration-500`}
                  style={{ height: `${heightPct}%` }}
                  aria-hidden
                />
                <div className="relative flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${stage.accentText}`} />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                        {stage.shortLabel}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600">0{idx + 1}</span>
                  </div>
                  <div
                    className={`text-3xl font-semibold tabular-nums ${isActive ? "text-white" : stage.accentText}`}
                  >
                    {value.toLocaleString()}
                  </div>
                  <div className="text-[11px] leading-4 text-zinc-500">{stage.description}</div>
                </div>
                {isActive && (
                  <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-black">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Terminal states as chips below the funnel. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-600">Terminal</span>
          {TERMINAL_CHIPS.map((chip) => {
            const value = stats[chip.statKey];
            const isActive = filter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setFilter(chip.id)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? chip.tone
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {chip.label}
                <span className="ml-1.5 tabular-nums">{value.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Leads list — card-style rows with avatar, contact stack, score ring,
          and status ribbon. More scannable than a dense table. */}
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
              checked={allVisibleSelected}
              onChange={toggleAll}
              disabled={filtered.length === 0}
              className="h-4 w-4 cursor-pointer rounded border-white/20 bg-transparent accent-emerald-400"
            />
            <span className="text-xs text-zinc-500">
              {filtered.length.toLocaleString()} shown
              {selection.count > 0 && (
                <span className="ml-2 text-emerald-300">· {selection.count} selected</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <SortButton label="Score" k="axiomScore" current={sortKey} dir={sortDir} onClick={toggleSort} />
            <SortButton label="Added" k="createdAt" current={sortKey} dir={sortDir} onClick={toggleSort} />
            <SortButton label="Last contact" k="lastContactedAt" current={sortKey} dir={sortDir} onClick={toggleSort} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02]">
              <Search className="h-5 w-5 text-zinc-600" />
            </div>
            <div className="mt-4 text-sm text-zinc-400">
              {search ? "No leads match your search." : "No leads in this stage."}
            </div>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="mt-3 cursor-pointer text-xs text-emerald-400 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((lead) => {
              const isSelected = selectedIds.has(lead.id);
              return (
                <li
                  key={lead.id}
                  className={`group relative flex items-center gap-4 px-5 py-3.5 transition-colors ${
                    isSelected ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Left rail: vertical accent strip when selected */}
                  {isSelected && (
                    <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-emerald-400" />
                  )}

                  <input
                    type="checkbox"
                    aria-label={`Select ${lead.businessName}`}
                    checked={isSelected}
                    onChange={() => toggleLead(lead.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-transparent accent-emerald-400"
                  />

                  {/* Avatar initial */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold tracking-wide ${tierColor(lead.axiomTier)}`}
                    title={lead.axiomTier ? `Tier ${lead.axiomTier}` : "No tier"}
                  >
                    {initials(lead.businessName)}
                  </div>

                  {/* Business + niche */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/lead/${lead.id}`}
                      className="block truncate text-sm font-semibold text-white transition-colors hover:text-emerald-300"
                    >
                      {lead.businessName}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                      <Globe className="h-3 w-3" />
                      <span className="truncate">
                        {lead.niche} · {lead.city || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="hidden min-w-0 flex-1 md:block">
                    {lead.email ? (
                      <>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                          <UserCircle2 className="h-3.5 w-3.5 text-zinc-500" />
                          <span className="truncate">{lead.contactName || "No name"}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded border border-zinc-700/60 bg-zinc-800/40 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        <XCircle className="h-3 w-3" />
                        No email
                      </span>
                    )}
                  </div>

                  {/* Score */}
                  <div className="hidden shrink-0 text-right md:block">
                    <div className={`text-xl font-bold tabular-nums ${scoreColor(lead.axiomScore)}`}>
                      {lead.axiomScore ?? "—"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">score</div>
                  </div>

                  {/* Status */}
                  <div className="hidden shrink-0 items-center gap-2 md:flex">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotColor(lead.outreachStatus)}`} />
                    <span className="text-xs font-medium text-zinc-300">
                      {statusLabel(lead.outreachStatus)}
                    </span>
                  </div>

                  {/* Last contact */}
                  <div className="hidden w-20 shrink-0 text-right text-[11px] text-zinc-500 lg:block">
                    {fmtDate(lead.lastContactedAt)}
                  </div>

                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400 md:block" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky bulk-action bar */}
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
                {busy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
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
                {busy === "queue" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
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
                {busy === "send-now" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
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

function SortButton({
  label,
  k,
  current,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = current === k;
  return (
    <button
      onClick={() => onClick(k)}
      className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors ${
        isActive
          ? "bg-white/[0.06] text-white"
          : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
      }`}
    >
      {label}
      {isActive ? (
        <ChevronDown className={`h-3 w-3 transition-transform ${dir === "asc" ? "rotate-180" : ""}`} />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
      )}
    </button>
  );
}
