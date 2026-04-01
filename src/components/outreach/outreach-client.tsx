"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Brain,
  CalendarClock,
  Check,
  CheckCheck,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { OutreachEditorSheet, type OutreachEditableLead } from "@/components/outreach/outreach-editor-sheet";
import { OutreachStatusBadge } from "@/components/outreach/outreach-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast-provider";
import {
  formatOutreachDate,
  OUTREACH_CHANNEL_OPTIONS,
  OUTREACH_STATUS_OPTIONS,
} from "@/lib/outreach";

type OutreachFilter = {
  status: string;
  channel: string;
  followUp: string;
  niche: string;
  city: string;
  search: string;
};

const DEFAULT_FILTERS: OutreachFilter = {
  status: "ALL",
  channel: "ALL",
  followUp: "ALL",
  niche: "ALL",
  city: "ALL",
  search: "",
};

function notePreview(notes: string | null) {
  if (!notes) return "—";
  return notes;
}

type OutreachClientProps = {
  initialLeads: OutreachEditableLead[];
  enableSelection?: boolean;
  onEnrichRequested?: (leadIds: number[]) => void;
};

export function OutreachClient({ initialLeads, enableSelection = false, onEnrichRequested }: OutreachClientProps) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<OutreachEditableLead[]>(initialLeads);
  const [filters, setFilters] = useState<OutreachFilter>(DEFAULT_FILTERS);
  const [savingLeadId, setSavingLeadId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [enriching, setEnriching] = useState(false);

  const uniqueCities = useMemo(
    () => [...new Set(leads.map((lead) => lead.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [leads],
  );
  const uniqueNiches = useMemo(
    () => [...new Set(leads.map((lead) => lead.niche).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [leads],
  );

  const filteredLeads = useMemo(() => {
    const now = Date.now();

    return [...leads]
      .filter((lead) => lead.outreachStatus && lead.outreachStatus !== "NOT_CONTACTED")
      .filter((lead) => {
        if (filters.status !== "ALL" && lead.outreachStatus !== filters.status) return false;
        if (filters.channel !== "ALL" && (lead.outreachChannel || "") !== filters.channel) return false;
        if (filters.niche !== "ALL" && lead.niche !== filters.niche) return false;
        if (filters.city !== "ALL" && lead.city !== filters.city) return false;

        if (filters.followUp === "DUE_NOW") {
          if (!lead.nextFollowUpDue || new Date(lead.nextFollowUpDue).getTime() > now) return false;
        }
        if (filters.followUp === "UPCOMING") {
          if (!lead.nextFollowUpDue || new Date(lead.nextFollowUpDue).getTime() <= now) return false;
        }
        if (filters.followUp === "NONE" && lead.nextFollowUpDue) {
          return false;
        }

        if (filters.search.trim()) {
          const query = filters.search.toLowerCase();
          const haystack = [
            lead.businessName,
            lead.city,
            lead.niche,
            lead.contactName || "",
            lead.phone || "",
            lead.email || "",
            lead.outreachNotes || "",
            lead.outreachStatus || "",
            lead.outreachChannel || "",
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aFollowUp = a.nextFollowUpDue ? new Date(a.nextFollowUpDue).getTime() : Number.MAX_SAFE_INTEGER;
        const bFollowUp = b.nextFollowUpDue ? new Date(b.nextFollowUpDue).getTime() : Number.MAX_SAFE_INTEGER;

        if (aFollowUp !== bFollowUp) {
          return aFollowUp - bFollowUp;
        }

        const aLastContact = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
        const bLastContact = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
        return bLastContact - aLastContact;
      });
  }, [filters, leads]);

  const handleSavedLead = useCallback((updatedLead: OutreachEditableLead) => {
    setLeads((prev) => {
      const existing = prev.some((lead) => lead.id === updatedLead.id);
      const next = existing
        ? prev.map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead))
        : [updatedLead, ...prev];

      return updatedLead.outreachStatus === "NOT_CONTACTED"
        ? next.filter((lead) => lead.id !== updatedLead.id)
        : next;
    });
  }, []);

  const updateLeadInline = useCallback(
    async (lead: OutreachEditableLead, payload: { outreachStatus?: string; outreachChannel?: string | null }) => {
      setSavingLeadId(lead.id);
      try {
        const response = await fetch(`/api/leads/${lead.id}/outreach`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...payload,
            touchLastContacted: payload.outreachStatus !== undefined || payload.outreachChannel !== undefined,
          }),
        });

        if (!response.ok) {
          const message = await response.json().catch(() => null);
          throw new Error(message?.error || "Failed to save outreach update");
        }

        const updatedLead = (await response.json()) as OutreachEditableLead;
        handleSavedLead(updatedLead);
        toast("Outreach updated", { type: "success", icon: "note" });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Failed to save outreach update", { type: "error", icon: "note" });
      } finally {
        setSavingLeadId(null);
      }
    },
    [handleSavedLead, toast],
  );

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
  };

  const handleEnrich = async () => {
    if (selectedIds.size === 0 || !onEnrichRequested) return;
    setEnriching(true);
    try {
      onEnrichRequested(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,0.8fr))]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <Input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search business, contact, notes, status..."
            className="border-white/10 bg-black/30 pl-10 focus:border-cyan-500/50"
          />
        </div>

        <select
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
        >
          <option value="ALL">All Statuses</option>
          {OUTREACH_STATUS_OPTIONS.filter((option) => option.value !== "NOT_CONTACTED").map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.channel}
          onChange={(event) => setFilters((prev) => ({ ...prev, channel: event.target.value }))}
          className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
        >
          <option value="ALL">All Channels</option>
          {OUTREACH_CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.followUp}
          onChange={(event) => setFilters((prev) => ({ ...prev, followUp: event.target.value }))}
          className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
        >
          <option value="ALL">All Follow-Ups</option>
          <option value="DUE_NOW">Due Now</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="NONE">No Follow-Up Set</option>
        </select>

        <select
          value={filters.niche}
          onChange={(event) => setFilters((prev) => ({ ...prev, niche: event.target.value }))}
          className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
        >
          <option value="ALL">All Niches</option>
          {uniqueNiches.map((niche) => (
            <option key={niche} value={niche}>
              {niche}
            </option>
          ))}
        </select>

        <select
          value={filters.city}
          onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
          className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
        >
          <option value="ALL">All Cities</option>
          {uniqueCities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-4 py-2 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-cyan-400" />
          <span>{filteredLeads.length} outreach lead{filteredLeads.length === 1 ? "" : "s"} in view</span>
        </div>
        <div className="flex items-center gap-2">
          {enableSelection && selectedIds.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleEnrich}
              disabled={enriching}
              className="h-7 gap-1.5 border border-purple-500/20 bg-purple-500/5 text-[11px] text-purple-300 hover:bg-purple-500/10"
            >
              {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              Enrich Selected ({selectedIds.size})
            </Button>
          )}
          {enableSelection && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="h-7 gap-1 text-[11px] text-zinc-500 hover:text-white"
            >
              {allSelected ? <X className="h-3 w-3" /> : <CheckCheck className="h-3 w-3" />}
              {allSelected ? "Deselect" : "Select All"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="h-7 text-[11px] text-zinc-500 hover:text-white"
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filteredLeads.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-10 text-center">
            <div className="mx-auto flex max-w-md flex-col items-center gap-2">
              <CalendarClock className="h-8 w-8 text-zinc-700" />
              <div className="text-sm font-semibold text-white">No outreach leads match these filters</div>
              <div className="text-xs text-zinc-500">Adjust the status, channel, niche, city, or follow-up filter to widen the view.</div>
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div key={lead.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {enableSelection && (
                    <button
                      onClick={() => toggleOne(lead.id)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                        selectedIds.has(lead.id)
                          ? "border-purple-500 bg-purple-500 text-white"
                          : "border-white/20 hover:border-purple-500/50"
                      }`}
                    >
                      {selectedIds.has(lead.id) && <Check className="h-3 w-3" />}
                    </button>
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-semibold text-white">{lead.businessName}</div>
                    <div className="text-[11px] text-zinc-500">
                      {lead.city} • {lead.niche}
                    </div>
                  </div>
                </div>
                <OutreachStatusBadge status={lead.outreachStatus} />
              </div>

              <div className="mt-3 space-y-1 text-xs">
                {lead.contactName ? <div className="text-amber-300">{lead.contactName}</div> : null}
                {lead.email ? <div className="break-all font-mono text-cyan-300">{lead.email}</div> : null}
                {lead.phone ? <div className="font-mono text-zinc-300">{lead.phone}</div> : null}
                {!lead.contactName && !lead.email && !lead.phone ? <div className="italic text-zinc-600">No contact info</div> : null}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Status</span>
                  <select
                    value={lead.outreachStatus || "NOT_CONTACTED"}
                    onChange={(event) => void updateLeadInline(lead, { outreachStatus: event.target.value })}
                    disabled={savingLeadId === lead.id}
                    className="h-9 w-full rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white outline-none disabled:opacity-50 focus:border-cyan-500/50"
                  >
                    {OUTREACH_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Channel</span>
                  <select
                    value={lead.outreachChannel || ""}
                    onChange={(event) => void updateLeadInline(lead, { outreachChannel: event.target.value || null })}
                    disabled={savingLeadId === lead.id}
                    className="h-9 w-full rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white outline-none disabled:opacity-50 focus:border-cyan-500/50"
                  >
                    <option value="">No channel</option>
                    {OUTREACH_CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">First Contacted</div>
                  <div className="mt-1 text-zinc-200">{formatOutreachDate(lead.firstContactedAt, true)}</div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Last Contacted</div>
                  <div className="mt-1 text-zinc-200">{formatOutreachDate(lead.lastContactedAt, true)}</div>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-[11px] text-zinc-300">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Next Follow-Up</div>
                <div className="mt-1 text-zinc-200">{formatOutreachDate(lead.nextFollowUpDue)}</div>
              </div>

              <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Notes</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  {notePreview(lead.outreachNotes)}
                </p>
              </div>

              <div className="mt-4 flex justify-end">
                <OutreachEditorSheet
                  lead={lead}
                  onSaved={handleSavedLead}
                  buttonLabel="Edit"
                  buttonVariant="ghost"
                  buttonSize="sm"
                  buttonClassName="border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10"
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-lg border border-white/[0.06] bg-black/20 md:block">
        <Table>
          <TableHeader className="bg-black/40">
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              {enableSelection && (
                <TableHead className="w-10">
                  <button
                    onClick={toggleAll}
                    className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                      allSelected
                        ? "border-purple-500 bg-purple-500 text-white"
                        : "border-white/20 hover:border-purple-500/50"
                    }`}
                  >
                    {allSelected && <Check className="h-3 w-3" />}
                  </button>
                </TableHead>
              )}
              <TableHead className="text-xs font-bold text-zinc-400">Business</TableHead>
              <TableHead className="text-xs font-bold text-zinc-400">Contact</TableHead>
              <TableHead className="text-xs font-bold text-zinc-400">Status</TableHead>
              <TableHead className="text-xs font-bold text-zinc-400">Channel</TableHead>
              <TableHead className="hidden text-xs font-bold text-zinc-400 md:table-cell">First Contacted</TableHead>
              <TableHead className="hidden text-xs font-bold text-zinc-400 md:table-cell">Last Contacted</TableHead>
              <TableHead className="hidden text-xs font-bold text-zinc-400 md:table-cell">Next Follow-Up</TableHead>
              <TableHead className="hidden text-xs font-bold text-zinc-400 md:table-cell">Notes</TableHead>
              <TableHead className="text-xs font-bold text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow className="border-white/[0.04]">
                <TableCell colSpan={enableSelection ? 10 : 9} className="whitespace-normal px-6 py-12 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                    <CalendarClock className="h-8 w-8 text-zinc-700" />
                    <div className="text-sm font-semibold text-white">No outreach leads match these filters</div>
                    <div className="text-xs text-zinc-500">Adjust the status, channel, niche, city, or follow-up filter to widen the view.</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                  {enableSelection && (
                    <TableCell className="align-top">
                      <button
                        onClick={() => toggleOne(lead.id)}
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                          selectedIds.has(lead.id)
                            ? "border-purple-500 bg-purple-500 text-white"
                            : "border-white/20 hover:border-purple-500/50"
                        }`}
                      >
                        {selectedIds.has(lead.id) && <Check className="h-3 w-3" />}
                      </button>
                    </TableCell>
                  )}
                  <TableCell className="whitespace-normal align-top">
                    <div className="min-w-[180px] space-y-1">
                      <div className="font-medium text-white">{lead.businessName}</div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        <span>{lead.city}</span>
                        <span>•</span>
                        <span className="font-mono text-purple-400/80">{lead.niche}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <div className="min-w-[180px] space-y-1 text-xs">
                      {lead.contactName ? <div className="text-amber-300">{lead.contactName}</div> : null}
                      {lead.email ? <div className="break-all font-mono text-cyan-300">{lead.email}</div> : null}
                      {lead.phone ? <div className="font-mono text-zinc-300">{lead.phone}</div> : null}
                      {!lead.contactName && !lead.email && !lead.phone ? (
                        <div className="italic text-zinc-600">No contact info</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <select
                      value={lead.outreachStatus || "NOT_CONTACTED"}
                      onChange={(event) => void updateLeadInline(lead, { outreachStatus: event.target.value })}
                      disabled={savingLeadId === lead.id}
                      className="h-8 w-full min-w-[142px] rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white outline-none disabled:opacity-50 focus:border-cyan-500/50"
                    >
                      {OUTREACH_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="align-top">
                    <select
                      value={lead.outreachChannel || ""}
                      onChange={(event) => void updateLeadInline(lead, { outreachChannel: event.target.value || null })}
                      disabled={savingLeadId === lead.id}
                      className="h-8 w-full min-w-[118px] rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white outline-none disabled:opacity-50 focus:border-cyan-500/50"
                    >
                      <option value="">No channel</option>
                      {OUTREACH_CHANNEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="hidden align-top text-xs text-zinc-300 md:table-cell">
                    {formatOutreachDate(lead.firstContactedAt, true)}
                  </TableCell>
                  <TableCell className="hidden align-top text-xs text-zinc-300 md:table-cell">
                    {formatOutreachDate(lead.lastContactedAt, true)}
                  </TableCell>
                  <TableCell className="hidden align-top text-xs text-zinc-300 md:table-cell">
                    {formatOutreachDate(lead.nextFollowUpDue)}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal align-top md:table-cell">
                    <div className="max-w-[260px] truncate text-xs leading-relaxed text-zinc-300" title={lead.outreachNotes || ""}>
                      {notePreview(lead.outreachNotes)}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <OutreachEditorSheet
                      lead={lead}
                      onSaved={handleSavedLead}
                      buttonLabel="Edit"
                      buttonVariant="ghost"
                      buttonSize="sm"
                      buttonClassName="border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
