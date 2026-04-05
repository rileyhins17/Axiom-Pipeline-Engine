"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { EmailComposer } from "@/components/outreach/email-composer";
import { OutreachEditorSheet, type OutreachEditableLead } from "@/components/outreach/outreach-editor-sheet";
import { OutreachStatusBadge } from "@/components/outreach/outreach-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast-provider";
import {
  formatOutreachDate,
  getOutreachStatusMeta,
  isContactedOutreachStatus,
  OUTREACH_STATUS_OPTIONS,
} from "@/lib/outreach";

type AutomationLead = OutreachEditableLead & {
  axiomTier?: string | null;
  enrichedAt?: string | null;
  enrichmentData?: string | null;
};

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

type GmailStatus = {
  connected: boolean;
  gmailAddress?: string;
  tokenHealthy?: boolean;
  connectedAt?: string;
};

type SendResult = {
  leadId: number;
  businessName: string;
  status: "sent" | "failed";
  error?: string;
};

type ActivityTone = "emerald" | "amber" | "red" | "cyan" | "blue" | "zinc";

type ActivityEvent = {
  id: string;
  kind: "send" | "reply" | "failure" | "sync" | "enrich" | "update" | "block";
  title: string;
  detail: string;
  at: string;
  tone: ActivityTone;
};

type AutomationConsoleProps = {
  initialPipelineLeads: AutomationLead[];
  initialEnrichedLeads: EnrichedLead[];
  initialActivity: ActivityEvent[];
  dailySendLimit: number;
  initialSentToday: number;
};

type FilterState = {
  status: string;
  followUp: string;
  search: string;
};

const DEFAULT_FILTERS: FilterState = {
  status: "ALL",
  followUp: "ALL",
  search: "",
};

function isReadyToShip(lead: AutomationLead) {
  return Boolean(lead.email && lead.enrichmentData);
}

function isDueNow(lead: AutomationLead, now: number) {
  return Boolean(lead.nextFollowUpDue && new Date(lead.nextFollowUpDue).getTime() <= now);
}

function formatActivityTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toneClasses(tone: ActivityTone) {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "amber":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "red":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    case "cyan":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "blue":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    default:
      return "border-white/10 bg-white/5 text-zinc-300";
  }
}

function makeActivityEvent(event: Omit<ActivityEvent, "id">) {
  return {
    ...event,
    id: `${event.kind}-${event.at}-${event.title}`,
  };
}

export function AutomationConsole({
  initialPipelineLeads,
  initialEnrichedLeads,
  initialActivity,
  dailySendLimit,
  initialSentToday,
}: AutomationConsoleProps) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<AutomationLead[]>(initialPipelineLeads);
  const [, setEnrichedLeads] = useState<EnrichedLead[]>(initialEnrichedLeads);
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [mailboxLoading, setMailboxLoading] = useState(true);
  const [sentToday, setSentToday] = useState(initialSentToday);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [enriching, setEnriching] = useState(false);
  const [sendingLeadIds, setSendingLeadIds] = useState<number[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshMailboxStatus = useCallback(async () => {
    setMailboxLoading(true);
    try {
      const [statusRes, emailsRes] = await Promise.all([
        fetch("/api/outreach/gmail/status"),
        fetch("/api/outreach/emails"),
      ]);

      if (statusRes.ok) {
        setGmailStatus(await statusRes.json());
      }

      if (emailsRes.ok) {
        const data = await emailsRes.json();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setSentToday(
          (data.emails || []).filter(
            (email: { sentAt?: string; status?: string }) =>
              email.status === "sent" && new Date(email.sentAt || "").getTime() >= today.getTime(),
          ).length,
        );
      }
    } catch {
      // Keep the previous snapshot when the refresh fails.
    } finally {
      setMailboxLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMailboxStatus();
  }, [refreshMailboxStatus]);

  const updateActivity = useCallback((nextItems: ActivityEvent[]) => {
    setActivity((prev) => [...nextItems, ...prev].slice(0, 24));
  }, []);

  const handleSavedLead = useCallback(
    (updatedLead: AutomationLead) => {
      setLeads((prev) => {
        const existing = prev.some((lead) => lead.id === updatedLead.id);
        const next = existing
          ? prev.map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead))
          : [updatedLead, ...prev];

        return updatedLead.outreachStatus === "NOT_CONTACTED"
          ? next.filter((lead) => lead.id !== updatedLead.id)
          : next;
      });

      updateActivity([
        makeActivityEvent({
          kind: "update",
          title: `${updatedLead.businessName} updated`,
          detail: `${getOutreachStatusMeta(updatedLead.outreachStatus).shortLabel} · ${updatedLead.outreachChannel || "No channel"}`,
          at: new Date().toISOString(),
          tone: "zinc",
        }),
      ]);
    },
    [updateActivity],
  );

  const handleSendComplete = useCallback(
    (results: SendResult[]) => {
      const now = new Date().toISOString();
      const sentResults = results.filter((result) => result.status === "sent");

      setLeads((prev) =>
        prev.map((lead) => {
          const matched = results.find((result) => result.leadId === lead.id);
          if (!matched || matched.status !== "sent") return lead;

          return {
            ...lead,
            outreachStatus: "OUTREACHED",
            outreachChannel: "EMAIL",
            firstContactedAt: lead.firstContactedAt || now,
            lastContactedAt: now,
          };
        }),
      );

      if (sentResults.length > 0) {
        setSentToday((prev) => prev + sentResults.length);
      }

      updateActivity(
        results.map((result) =>
          makeActivityEvent({
            kind: result.status === "sent" ? "send" : "failure",
            title: result.status === "sent" ? `${result.businessName} shipped` : `${result.businessName} failed`,
            detail:
              result.status === "sent"
                ? "Delivered through Gmail with the current sequence draft."
                : result.error || "Gmail delivery failed before send confirmation.",
            at: now,
            tone: result.status === "sent" ? "emerald" : "red",
          }),
        ),
      );

      void refreshMailboxStatus();
    },
    [refreshMailboxStatus, updateActivity],
  );

  const handleEnrichRequested = useCallback(
    async (leadIds: number[]) => {
      if (leadIds.length === 0) return;
      setEnriching(true);
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
        const enrichedBatch: EnrichedLead[] = data.leads || [];
        const enrichedIds = new Set(enrichedBatch.map((lead) => lead.id));

        setEnrichedLeads((prev) => {
          const next = [...enrichedBatch, ...prev.filter((lead) => !enrichedIds.has(lead.id))];
          return next.slice(0, 50);
        });

        setLeads((prev) =>
          prev.map((lead) => {
            const enriched = enrichedBatch.find((item) => item.id === lead.id);
            return enriched
              ? {
                  ...lead,
                  enrichedAt: enriched.enrichedAt,
                  enrichmentData: enriched.enrichmentData,
                }
              : lead;
          }),
        );

        updateActivity([
          makeActivityEvent({
            kind: "enrich",
            title: `Enriched ${data.enriched} lead${data.enriched === 1 ? "" : "s"}`,
            detail:
              data.skipped > 0
                ? `${data.skipped} lead${data.skipped === 1 ? "" : "s"} skipped by validation.`
                : "Batch enrichment completed cleanly.",
            at: new Date().toISOString(),
            tone: "cyan",
          }),
        ]);

        toast(`Enriched ${data.enriched} lead${data.enriched === 1 ? "" : "s"}`, {
          type: "success",
          icon: "note",
        });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Enrichment failed", {
          type: "error",
          icon: "note",
        });
      } finally {
        setEnriching(false);
      }
    },
    [toast, updateActivity],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleSendSingle = useCallback((lead: AutomationLead) => {
    if (!isReadyToShip(lead)) return;
    setSendingLeadIds([lead.id]);
  }, []);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await refreshMailboxStatus();
      updateActivity([
        makeActivityEvent({
          kind: "sync",
          title: "Mailbox snapshot synced",
          detail: "Refreshed Gmail status and delivery history.",
          at: new Date().toISOString(),
          tone: "blue",
        }),
      ]);
      toast("Mailbox snapshot refreshed", { type: "success", icon: "note" });
    } finally {
      setSyncing(false);
    }
  }, [refreshMailboxStatus, toast, updateActivity]);

  const now = Date.now();

  const filteredLeads = useMemo(() => {
    return [...leads]
      .filter((lead) => isContactedOutreachStatus(lead.outreachStatus))
      .filter((lead) => {
        if (filters.status !== "ALL" && lead.outreachStatus !== filters.status) return false;

        if (filters.followUp === "DUE_NOW") {
          if (!isDueNow(lead, now)) return false;
        }
        if (filters.followUp === "UPCOMING") {
          if (!lead.nextFollowUpDue || new Date(lead.nextFollowUpDue).getTime() <= now) return false;
        }
        if (filters.followUp === "NONE" && lead.nextFollowUpDue) return false;

        if (filters.search.trim()) {
          const q = filters.search.toLowerCase();
          const haystack = [
            lead.businessName,
            lead.contactName || "",
            lead.city,
            lead.niche,
            lead.email || "",
            lead.phone || "",
            lead.outreachNotes || "",
            lead.outreachStatus || "",
            lead.outreachChannel || "",
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aDue = a.nextFollowUpDue ? new Date(a.nextFollowUpDue).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.nextFollowUpDue ? new Date(b.nextFollowUpDue).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;

        const aLast = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
        const bLast = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
        return bLast - aLast;
      });
  }, [filters.followUp, filters.search, filters.status, leads, now]);

  const uniqueStatuses = useMemo(
    () => OUTREACH_STATUS_OPTIONS.filter((option) => option.value !== "NOT_CONTACTED"),
    [],
  );

  const allSelected = filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.has(lead.id));
  const selectedLeads = filteredLeads.filter((lead) => selectedIds.has(lead.id));
  const sendableSelectedIds = selectedLeads.filter(isReadyToShip).map((lead) => lead.id);
  const readyCount = leads.filter(isReadyToShip).length;
  const dueNowCount = leads.filter((lead) => isDueNow(lead, now)).length;
  const repliedCount = leads.filter((lead) => lead.outreachStatus === "REPLIED" || lead.outreachStatus === "INTERESTED").length;
  const remainingDaily = Math.max(dailySendLimit - sentToday, 0);
  const engineOnline = gmailStatus?.connected === true;
  const engineState =
    mailboxLoading
      ? "Checking mailbox"
      : !engineOnline
        ? "Mailbox offline"
        : remainingDaily <= 0
          ? "Throttle engaged"
          : readyCount > 0
            ? "Armed"
            : "Standing by";

  const blockers = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      tone: ActivityTone;
    }> = [];

    if (!engineOnline && !mailboxLoading) {
      items.push({
        title: "Mailbox offline",
        detail: "Connect Gmail before shipping the next sequence.",
        tone: "amber",
      });
    }

    if (remainingDaily <= 0) {
      items.push({
        title: "Daily cap reached",
        detail: `${sentToday}/${dailySendLimit} messages sent today.`,
        tone: "red",
      });
    }

    if (dueNowCount > 0) {
      items.push({
        title: `${dueNowCount} follow-ups due`,
        detail: "These rows are ready to be worked from the table.",
        tone: "cyan",
      });
    }

    if (selectedIds.size > 0 && sendableSelectedIds.length === 0) {
      items.push({
        title: "Selected rows need enrichment",
        detail: "They cannot be shipped until email and enrichment are present.",
        tone: "amber",
      });
    }

    return items.slice(0, 3);
  }, [
    dailySendLimit,
    dueNowCount,
    engineOnline,
    mailboxLoading,
    remainingDaily,
    selectedIds.size,
    sendableSelectedIds.length,
    sentToday,
  ]);

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(filteredLeads.map((lead) => lead.id)));
  }, [allSelected, filteredLeads]);

  const handleSendSelected = useCallback(() => {
    if (sendableSelectedIds.length === 0) return;
    setSendingLeadIds(sendableSelectedIds);
  }, [sendableSelectedIds]);

  const totalSelected = selectedIds.size;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${
              engineOnline ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {engineState}
          </span>
          <span className="text-zinc-400">
            <strong className="text-white">{dueNowCount}</strong> due now
          </span>
          <span className="text-zinc-400">
            <strong className="text-white">{readyCount}</strong> ready to ship
          </span>
          <span className="text-zinc-400">
            <strong className="text-white">{sentToday}</strong> sent today
          </span>
          <span className="text-zinc-400">
            <strong className="text-white">{remainingDaily}</strong> remaining
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <section className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white">Active sequences</div>
                <div className="text-xs text-zinc-500">
                  The primary truth surface for live touches, follow-up timing, and shipping readiness.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {totalSelected > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-400">
                    {totalSelected} selected
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void handleEnrichRequested(selectedLeads.map((lead) => lead.id))}
                  disabled={selectedIds.size === 0 || enriching}
                  className="border border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/10"
                >
                  {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                  Enrich selected
                </Button>
                <Button
                  type="button"
                  size="xs"
                  onClick={handleSendSelected}
                  disabled={sendableSelectedIds.length === 0}
                  className="bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500"
                >
                  <Send className="h-3 w-3" />
                  Ship ready ({sendableSelectedIds.length})
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleClearSelection}
                    className="border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleToggleAll}
                  className="border border-white/10 text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                >
                  {allSelected ? <X className="h-3 w-3" /> : <CheckCheck className="h-3 w-3" />}
                  {allSelected ? "Deselect all" : "Select all"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,0.75fr))]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <Input
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Search company, contact, notes, or email"
                  className="border-white/10 bg-black/30 pl-10 focus:border-cyan-500/50"
                />
              </div>

              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
              >
                <option value="ALL">All states</option>
                {uniqueStatuses.map((option) => (
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
                <option value="ALL">All timing</option>
                <option value="DUE_NOW">Due now</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="NONE">No follow-up</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
            <Table>
              <TableHeader className="bg-black/35">
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="w-10 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    <button
                      type="button"
                      onClick={handleToggleAll}
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        allSelected
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-white/20 hover:border-emerald-500/50"
                      }`}
                    >
                      {allSelected && <Check className="h-3 w-3" />}
                    </button>
                  </TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Sequence
                  </TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Next send
                  </TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    State
                  </TableHead>
                  <TableHead className="hidden text-[10px] font-semibold uppercase tracking-widest text-zinc-500 md:table-cell">
                    Channel
                  </TableHead>
                  <TableHead className="hidden text-[10px] font-semibold uppercase tracking-widest text-zinc-500 xl:table-cell">
                    Notes
                  </TableHead>
                  <TableHead className="text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 ? (
                  <TableRow className="border-white/[0.04]">
                    <TableCell colSpan={7} className="px-6 py-14 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <Clock3 className="h-8 w-8 text-zinc-700" />
                        <div className="text-sm font-semibold text-white">No sequences match these filters</div>
                        <div className="text-xs text-zinc-500">
                          Narrow the search or change the state filter to pull more rows into view.
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead) => {
                    const ready = isReadyToShip(lead);
                    const selected = selectedIds.has(lead.id);

                    return (
                      <TableRow
                        key={lead.id}
                        className={`border-white/[0.04] transition-colors hover:bg-white/[0.02] ${
                          selected ? "bg-white/[0.03]" : ""
                        }`}
                      >
                        <TableCell className="align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(lead.id)) next.delete(lead.id);
                                else next.add(lead.id);
                                return next;
                              })
                            }
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              selected
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-white/20 hover:border-emerald-500/50"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </button>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-medium text-white">{lead.businessName}</div>
                              {lead.axiomTier && (
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                  {lead.axiomTier}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                              {lead.contactName && <span className="text-amber-300">{lead.contactName}</span>}
                              <span>{lead.city}</span>
                              <span>-</span>
                              <span className="font-mono text-purple-400/80">{lead.niche}</span>
                              {lead.email && (
                                <>
                                  <span>-</span>
                                  <span className="font-mono text-cyan-400/80">{lead.email}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-xs text-zinc-300">
                          <div className="space-y-1">
                            <div className="font-medium text-zinc-100">{formatOutreachDate(lead.nextFollowUpDue, true)}</div>
                            <div className="text-[11px] text-zinc-500">
                              Last touch {formatOutreachDate(lead.lastContactedAt, true)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <OutreachStatusBadge status={lead.outreachStatus} />
                        </TableCell>
                        <TableCell className="hidden align-top text-xs text-zinc-300 md:table-cell">
                          <div className="space-y-1">
                            <div className="font-mono text-zinc-100">{lead.outreachChannel || "-"}</div>
                            <div className="text-[11px] text-zinc-500">
                              {ready ? "Ready to ship" : lead.email ? "Awaiting enrichment" : "Missing email"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden align-top xl:table-cell">
                          <div className="max-w-[280px] text-xs leading-relaxed text-zinc-300">
                            {lead.outreachNotes ? lead.outreachNotes : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex justify-end gap-2">
                            <OutreachEditorSheet
                              lead={lead}
                              onSaved={handleSavedLead}
                              buttonLabel="Review"
                              buttonVariant="ghost"
                              buttonSize="xs"
                              buttonClassName="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                            />
                            {ready ? (
                              <Button
                                type="button"
                                size="xs"
                                onClick={() => handleSendSingle(lead)}
                                className="bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500"
                              >
                                <Send className="h-3 w-3" />
                                Ship
                              </Button>
                            ) : lead.email ? (
                              <Button
                                type="button"
                                size="xs"
                                onClick={() => void handleEnrichRequested([lead.id])}
                                disabled={enriching}
                                className="border border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/10"
                              >
                                <Sparkles className="h-3 w-3" />
                                Enrich
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <div className="text-sm font-semibold text-white">Blockers</div>
                <div className="text-xs text-zinc-500">Only the items that currently need operator attention.</div>
              </div>
              <ShieldAlert className="h-4 w-4 text-zinc-500" />
            </div>

            <div className="mt-3 space-y-2">
              {blockers.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="text-xs font-medium text-emerald-300">No active blockers</div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Mailbox is online and the current send window is clear.
                  </div>
                </div>
              ) : (
                blockers.map((blocker) => (
                  <div key={blocker.title} className={`rounded-lg border p-3 ${toneClasses(blocker.tone)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-white">{blocker.title}</div>
                        <div className="text-[11px] text-zinc-400">{blocker.detail}</div>
                      </div>
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-current opacity-60" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <div className="text-sm font-semibold text-white">Mailbox engine</div>
                <div className="text-xs text-zinc-500">Connection status, send budget, and throttle state.</div>
              </div>
              <Mail className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Connection</span>
                <span className={engineOnline ? "text-emerald-300" : "text-amber-300"}>
                  {mailboxLoading ? "Checking..." : engineOnline ? gmailStatus?.gmailAddress || "Connected" : "Offline"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Daily send</span>
                <span className="text-zinc-100">
                  {sentToday}/{dailySendLimit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Remaining</span>
                <span className="text-zinc-100">{remainingDaily}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Ready to ship</span>
                <span className="text-cyan-300">{readyCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Reply pressure</span>
                <span className="text-zinc-100">{repliedCount}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!engineOnline ? (
                <Button
                  type="button"
                  size="xs"
                  onClick={() => {
                    window.location.href = "/api/outreach/gmail/connect";
                  }}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500"
                >
                  <Mail className="h-3 w-3" />
                  Connect Gmail
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    try {
                      await fetch("/api/outreach/gmail/disconnect", { method: "POST" });
                      setGmailStatus({ connected: false });
                      updateActivity([
                        makeActivityEvent({
                          kind: "sync",
                          title: "Mailbox disconnected",
                          detail: "Gmail was disconnected from this workspace.",
                          at: new Date().toISOString(),
                          tone: "amber",
                        }),
                      ]);
                      toast("Gmail disconnected", { type: "success", icon: "note" });
                    } catch {
                      toast("Failed to disconnect Gmail", { type: "error", icon: "note" });
                    }
                  }}
                  className="border border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                >
                  Disconnect
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleSyncNow}
                disabled={syncing}
                className="border border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-white"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Check now
              </Button>
            </div>
          </div>
        </aside>

        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 xl:col-span-2">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <div className="text-sm font-semibold text-white">Recent activity</div>
              <div className="text-xs text-zinc-500">Actual sends, replies, failures, syncs, and sequence updates.</div>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live stream
            </div>
          </div>

          <div className="mt-3 divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
            {activity.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-500">No activity has been recorded yet.</div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="font-mono text-[11px] text-zinc-500">{formatActivityTime(entry.at)}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wider ${toneClasses(entry.tone)}`}
                      >
                        {entry.kind}
                      </span>
                      <div className="truncate text-sm text-white">{entry.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">{entry.detail}</div>
                  </div>
                  <div className="text-right text-[11px] text-zinc-500">{entry.kind}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {sendingLeadIds && (
        <EmailComposer
          leadIds={sendingLeadIds}
          onClose={() => setSendingLeadIds(null)}
          onComplete={handleSendComplete}
        />
      )}
    </div>
  );
}
