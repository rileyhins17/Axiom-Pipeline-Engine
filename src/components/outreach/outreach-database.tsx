"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, Search, ChevronDown, ArrowUpDown } from "lucide-react";

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

type FilterId = "all" | "not_contacted" | "enriching" | "enriched" | "ready" | "outreached" | "follow_up" | "replied" | "not_interested";

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

function matchFilter(status: string, filter: FilterId): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "not_contacted": return status === "NOT_CONTACTED";
    case "enriching": return status === "ENRICHING";
    case "enriched": return status === "ENRICHED";
    case "ready": return status === "READY_FOR_FIRST_TOUCH";
    case "outreached": return status === "OUTREACHED";
    case "follow_up": return status === "FOLLOW_UP_DUE";
    case "replied": return status === "REPLIED" || status === "INTERESTED";
    case "not_interested": return status === "NOT_INTERESTED";
    default: return true;
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
      return "border-white/10 bg-white/5 text-zinc-400";
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type SortKey = "businessName" | "city" | "axiomScore" | "outreachStatus" | "lastContactedAt" | "createdAt";

export function OutreachDatabase({ initialLeads, stats }: { initialLeads: Lead[]; stats: Stats }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let results = initialLeads.filter((l) => matchFilter(l.outreachStatus, filter));
    if (q) {
      results = results.filter((l) =>
        l.businessName.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.niche?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.contactName?.toLowerCase().includes(q)
      );
    }
    results.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "businessName":
          cmp = a.businessName.localeCompare(b.businessName); break;
        case "city":
          cmp = (a.city || "").localeCompare(b.city || ""); break;
        case "axiomScore":
          cmp = (a.axiomScore || 0) - (b.axiomScore || 0); break;
        case "outreachStatus":
          cmp = a.outreachStatus.localeCompare(b.outreachStatus); break;
        case "lastContactedAt":
          cmp = new Date(a.lastContactedAt || 0).getTime() - new Date(b.lastContactedAt || 0).getTime(); break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return results;
  }, [initialLeads, filter, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Outreach</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Lead database — {stats.total} leads</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 w-64"
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
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`ml-1.5 tabular-nums ${isActive ? "text-zinc-300" : "text-zinc-600"}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.015]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-[11px] text-zinc-500">
              <SortTh label="Business" sortKey="businessName" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="City" sortKey="city" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Contact</th>
              <SortTh label="Score" sortKey="axiomScore" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Status" sortKey="outreachStatus" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Last contact" sortKey="lastContactedAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortTh label="Added" sortKey="createdAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-xs text-zinc-500" colSpan={7}>
                  {search ? "No leads match your search." : "No leads in this category."}
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr key={lead.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <Link href={`/lead/${lead.id}`} className="text-sm font-medium text-white hover:text-cyan-300 transition-colors">
                      {lead.businessName}
                    </Link>
                    <div className="text-[11px] text-zinc-600">{lead.niche}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{lead.city}</td>
                  <td className="px-3 py-2.5">
                    {lead.email ? (
                      <div>
                        <div className="text-xs text-zinc-300">{lead.contactName || "—"}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{lead.email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">No email</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {lead.axiomScore != null ? (
                      <span className={`tabular-nums text-xs font-medium ${
                        lead.axiomScore >= 70 ? "text-emerald-300" :
                        lead.axiomScore >= 50 ? "text-cyan-300" :
                        lead.axiomScore >= 35 ? "text-amber-300" :
                        "text-zinc-500"
                      }`}>{lead.axiomScore}</span>
                    ) : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusColor(lead.outreachStatus)}`}>
                      {statusLabel(lead.outreachStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500">{fmtDate(lead.lastContactedAt)}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600">{fmtDate(lead.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Count */}
      <div className="text-xs text-zinc-600 tabular-nums">
        Showing {filtered.length} of {stats.total} leads
      </div>
    </div>
  );
}

function SortTh({ label, sortKey: key, active, dir, onClick }: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = active === key;
  return (
    <th
      className="px-3 py-2 text-left font-medium cursor-pointer hover:text-zinc-300 transition-colors select-none"
      onClick={() => onClick(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <ChevronDown className={`h-3 w-3 transition-transform ${dir === "asc" ? "rotate-180" : ""}`} />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40" />
        )}
      </span>
    </th>
  );
}
