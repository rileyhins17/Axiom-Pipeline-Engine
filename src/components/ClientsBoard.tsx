"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Globe,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";

import {
  CLIENT_PRIORITY_OPTIONS,
  DEAL_HEALTH_META,
  DEAL_KANBAN_COLUMNS,
  DEAL_STAGE_OPTIONS,
  ENGAGEMENT_TYPE_OPTIONS,
  computeDealHealth,
  getDealStageMeta,
  getDaysUntilRenewal,
  getEngagementTypeLabel,
  isActionOverdue,
  type DealStage,
} from "@/lib/crm";
import type { LeadRecord } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type CrmLead = LeadRecord;

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatDueDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  if (date < today) {
    const days = Math.ceil((today.getTime() - date.getTime()) / 86400000);
    return days === 1 ? "Yesterday" : `${days}d overdue`;
  }
  if (date < tomorrow) return "Today";
  const days = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `${days}d`;
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function toInputDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// ---------- Deal Card ----------

function DealCard({ lead, onEdit }: { lead: CrmLead; onEdit: (lead: CrmLead) => void }) {
  const stageMeta = getDealStageMeta(lead.dealStage);
  const daysUntilRenewal = getDaysUntilRenewal(lead.renewalDate);
  const renewalWarning = daysUntilRenewal !== null && daysUntilRenewal <= 30;
  const overdue = isActionOverdue(lead.nextActionDueAt);
  const health = lead.dealStage ? computeDealHealth(lead) : null;
  const healthMeta = health ? DEAL_HEALTH_META[health] : null;

  return (
    <button
      type="button"
      onClick={() => onEdit(lead)}
      className="group w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all p-3.5 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate leading-tight">
            {lead.businessName}
          </div>
          <div className="text-[11px] text-zinc-500 truncate mt-0.5">
            {lead.city} · {lead.niche}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {healthMeta && health !== "WON" && health !== "LOST" && (
            <span className={cn(
              "inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
              healthMeta.pillClasses,
            )}>
              {healthMeta.label}
            </span>
          )}
          <Pencil className="size-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        </div>
      </div>

      {lead.engagementType && (
        <div className="text-[10.5px] font-medium text-zinc-400 mb-1.5">
          {getEngagementTypeLabel(lead.engagementType)}
        </div>
      )}

      {/* Next action */}
      {lead.nextAction && (
        <div className="flex items-start gap-1 mb-1.5">
          {overdue ? (
            <Clock className="size-3 text-red-400 shrink-0 mt-px" />
          ) : (
            <Clock className="size-3 text-zinc-600 shrink-0 mt-px" />
          )}
          <div className="min-w-0">
            <span className={cn(
              "text-[10.5px] truncate block",
              overdue ? "text-red-300" : "text-zinc-400",
            )}>
              {lead.nextAction}
            </span>
            {lead.nextActionDueAt && (
              <span className={cn(
                "text-[10px]",
                overdue ? "text-red-400/70" : "text-zinc-600",
              )}>
                {formatDueDate(lead.nextActionDueAt)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-0.5">
        {lead.monthlyValue ? (
          <span className="font-mono text-xs font-semibold text-emerald-300">
            ${lead.monthlyValue.toLocaleString()}/mo
          </span>
        ) : (
          <span className="font-mono text-xs text-zinc-600">—</span>
        )}
        {renewalWarning && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
            <AlertCircle className="size-3" />
            {daysUntilRenewal === 0 ? "Today" : `${daysUntilRenewal}d`}
          </span>
        )}
      </div>

      {lead.outreachStatus === "REPLIED" && !lead.dealStage && (
        <div className="mt-2 text-[10px] text-cyan-400 font-medium flex items-center gap-1">
          <MessageSquare className="size-3" />
          Replied — needs stage
        </div>
      )}

      {stageMeta && !lead.dealStage && (
        <div className={cn("mt-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", stageMeta.classes)}>
          {stageMeta.shortLabel}
        </div>
      )}
    </button>
  );
}

// ---------- Kanban Column ----------

function KanbanColumn({
  stage,
  label,
  description,
  leads,
  onEdit,
  onAddFromInbox,
}: {
  stage: DealStage;
  label: string;
  description: string;
  leads: CrmLead[];
  onEdit: (lead: CrmLead) => void;
  onAddFromInbox?: () => void;
}) {
  const stageMeta = getDealStageMeta(stage);
  const columnMrr = leads.reduce((s, l) => s + (l.monthlyValue ?? 0), 0);

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{label}</span>
            {leads.length > 0 && (
              <span className="font-mono text-[10px] text-zinc-500 border border-white/[0.09] bg-black/30 rounded px-1 py-0.5">
                {leads.length}
              </span>
            )}
          </div>
          <div className="text-[10.5px] text-zinc-600 mt-0.5">{description}</div>
        </div>
        {columnMrr > 0 && (
          <span className="font-mono text-[10.5px] text-emerald-400 shrink-0">
            ${columnMrr.toLocaleString()}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex-1 rounded-xl border p-2.5 flex flex-col gap-2 min-h-[120px]",
          stageMeta ? `${stageMeta.classes.split(" ").find((c) => c.startsWith("border-")) ?? "border-white/[0.06]"} bg-black/20` : "border-white/[0.06] bg-black/20",
        )}
      >
        {leads.map((lead) => (
          <DealCard key={lead.id} lead={lead} onEdit={onEdit} />
        ))}
        {leads.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[11px] text-zinc-700">Empty</span>
          </div>
        )}
        {onAddFromInbox && leads.length === 0 && (
          <button
            type="button"
            onClick={onAddFromInbox}
            className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
          >
            <Plus className="size-3" />
            Add from inbox
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Deal Drawer ----------

function DealDrawer({
  lead,
  onClose,
  onSave,
  saving,
}: {
  lead: CrmLead;
  onClose: () => void;
  onSave: (leadId: number, update: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [dealStage, setDealStage] = useState<string>(lead.dealStage ?? "");
  const [engagementType, setEngagementType] = useState<string>(lead.engagementType ?? "");
  const [monthlyValue, setMonthlyValue] = useState<string>(lead.monthlyValue ? String(lead.monthlyValue) : "");
  const [clientPriority, setClientPriority] = useState<string>(lead.clientPriority ?? "");
  const [nextAction, setNextAction] = useState<string>(lead.nextAction ?? "");
  const [nextActionDueAt, setNextActionDueAt] = useState<string>(toInputDate(lead.nextActionDueAt));
  const [dealLostReason, setDealLostReason] = useState<string>(lead.dealLostReason ?? "");
  const [projectStartDate, setProjectStartDate] = useState<string>(toInputDate(lead.projectStartDate));
  const [renewalDate, setRenewalDate] = useState<string>(toInputDate(lead.renewalDate));
  const [proposalSentAt, setProposalSentAt] = useState<string>(toInputDate(lead.proposalSentAt));
  const [signedAt, setSignedAt] = useState<string>(toInputDate(lead.signedAt));
  const [projectNotes, setProjectNotes] = useState<string>(lead.projectNotes ?? "");

  // Auto-set date fields when stage first moves to relevant stage
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (dealStage === "PROPOSAL_SENT" && !proposalSentAt) {
      setProposalSentAt(today);
    }
    if (dealStage === "SIGNED" && !signedAt) {
      setSignedAt(today);
    }
  }, [dealStage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    await onSave(lead.id, {
      dealStage: dealStage || null,
      engagementType: engagementType || null,
      monthlyValue: monthlyValue ? Number(monthlyValue) : null,
      clientPriority: clientPriority || null,
      nextAction: nextAction || null,
      nextActionDueAt: nextActionDueAt || null,
      dealLostReason: dealLostReason || null,
      projectStartDate: projectStartDate || null,
      renewalDate: renewalDate || null,
      proposalSentAt: proposalSentAt || null,
      signedAt: signedAt || null,
      projectNotes: projectNotes || null,
    });
  };

  const daysUntilRenewal = getDaysUntilRenewal(renewalDate || null);
  const isLost = dealStage === "LOST";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-md bg-[#070d14] border-l border-white/[0.08] shadow-2xl flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{lead.businessName}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{lead.city} · {lead.niche}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-zinc-500 hover:text-white transition-colors mt-0.5"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Contact info */}
        <div className="px-6 py-3 border-b border-white/[0.06] flex flex-col gap-1.5">
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <Mail className="size-3.5 shrink-0 text-zinc-600" />
              {lead.email}
            </a>
          )}
          {lead.websiteUrl && (
            <a
              href={lead.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <Globe className="size-3.5 shrink-0 text-zinc-600" />
              {lead.websiteDomain ?? lead.websiteUrl}
              <ExternalLink className="size-3 text-zinc-700" />
            </a>
          )}
        </div>

        {/* Deal fields */}
        <div className="flex flex-col gap-4 px-6 py-5 flex-1">

          {/* Stage + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Stage
              </label>
              <select
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer"
              >
                <option value="">— None —</option>
                {DEAL_STAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Priority
              </label>
              <select
                value={clientPriority}
                onChange={(e) => setClientPriority(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer"
              >
                <option value="">— None —</option>
                {CLIENT_PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Engagement Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Engagement Type
            </label>
            <select
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value)}
              className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer"
            >
              <option value="">— Select type —</option>
              {ENGAGEMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Monthly Value */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Monthly Value ($/mo)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="number"
                min={0}
                step={50}
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                placeholder="150"
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] pl-8 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.05]" />

          {/* Next Action */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Next Action
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Follow up on proposal"
              className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
            />
          </div>

          {/* Next Action Due */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Due Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="date"
                value={nextActionDueAt}
                onChange={(e) => setNextActionDueAt(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Lost reason — only when stage is LOST */}
          {isLost && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Lost Reason
              </label>
              <input
                type="text"
                value={dealLostReason}
                onChange={(e) => setDealLostReason(e.target.value)}
                placeholder="e.g. Budget, went with competitor…"
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/[0.05]" />

          {/* Proposal Sent / Signed dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Proposal Sent
              </label>
              <input
                type="date"
                value={proposalSentAt}
                onChange={(e) => setProposalSentAt(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Signed
              </label>
              <input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Project Start / Renewal dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Project Start
              </label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                <input
                  type="date"
                  value={projectStartDate}
                  onChange={(e) => setProjectStartDate(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] pl-7 pr-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
                Renewal
              </label>
              <div className="relative">
                <RefreshCw className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none" />
                <input
                  type="date"
                  value={renewalDate}
                  onChange={(e) => setRenewalDate(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] pl-7 pr-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 [color-scheme:dark]"
                />
              </div>
              {daysUntilRenewal !== null && (
                <p className={cn(
                  "text-[11px] flex items-center gap-1",
                  daysUntilRenewal <= 0 ? "text-red-400" : daysUntilRenewal <= 30 ? "text-amber-400" : "text-zinc-500",
                )}>
                  <AlertCircle className="size-3" />
                  {daysUntilRenewal <= 0 ? "Overdue" : daysUntilRenewal === 1 ? "Tomorrow" : `In ${daysUntilRenewal}d`}
                </p>
              )}
            </div>
          </div>

          {/* Project Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
              Notes
            </label>
            <textarea
              value={projectNotes}
              onChange={(e) => setProjectNotes(e.target.value)}
              rows={3}
              placeholder="Scope, deliverables, special requirements…"
              className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
            />
          </div>

          {/* TODO: Activity timeline — log calls, emails, stage changes per lead */}
          {/* TODO: Client profile route — /clients/[id] with full context */}
          {/* TODO: Proposal builder — attach a proposal draft / link */}
          {/* TODO: Discovery notes — structured intake from first call */}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.06] bg-[#070d14]">
          <div className="text-[10.5px] text-zinc-600">
            {lead.firstContactedAt ? `First contact ${formatDate(lead.firstContactedAt)}` : "Not yet contacted"}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Inbox (replied / interested, no stage yet) ----------

function InboxSection({
  leads,
  onEdit,
}: {
  leads: CrmLead[];
  onEdit: (lead: CrmLead) => void;
}) {
  if (leads.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="size-4 text-cyan-400" />
        <span className="text-sm font-semibold text-white">Inbox</span>
        <span className="font-mono text-[10px] text-zinc-500 border border-white/[0.09] bg-black/30 rounded px-1 py-0.5">
          {leads.length}
        </span>
        <span className="text-xs text-zinc-500">Replied or interested — move to a stage to track</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {leads.map((lead) => (
          <button
            key={lead.id}
            type="button"
            onClick={() => onEdit(lead)}
            className="group flex items-center gap-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 px-3 py-2 transition-all cursor-pointer"
          >
            <Building2 className="size-3.5 text-cyan-400/70" />
            <div className="text-left">
              <div className="text-xs font-medium text-white">{lead.businessName}</div>
              <div className="text-[10px] text-zinc-500">{lead.city}</div>
            </div>
            <ChevronRight className="size-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Main Board ----------

export function ClientsBoard({ initialLeads }: { initialLeads: CrmLead[] }) {
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inboxLeads = useMemo(
    () => leads.filter((l) => !l.dealStage && (l.outreachStatus === "REPLIED" || l.outreachStatus === "INTERESTED")),
    [leads],
  );

  const leadsByStage = useMemo(() => {
    const map = new Map<string, CrmLead[]>();
    for (const col of DEAL_KANBAN_COLUMNS) {
      map.set(col.stage, []);
    }
    for (const lead of leads) {
      if (lead.dealStage && map.has(lead.dealStage)) {
        map.get(lead.dealStage)!.push(lead);
      }
    }
    return map;
  }, [leads]);

  const handleSave = useCallback(async (leadId: number, update: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/deal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to save");
      }
      const updated = await res.json() as CrmLead;
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, []);

  const totalMrr = useMemo(
    () => leads
      .filter((l) => l.dealStage === "ACTIVE" || l.dealStage === "RETAINED")
      .reduce((s, l) => s + (l.monthlyValue ?? 0), 0),
    [leads],
  );

  const renewalsSoon = useMemo(
    () => leads.filter((l) => {
      const d = getDaysUntilRenewal(l.renewalDate);
      return d !== null && d <= 30 && d >= 0;
    }),
    [leads],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Stats bar */}
      {totalMrr > 0 || renewalsSoon.length > 0 ? (
        <div className="flex items-center gap-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3.5">
          {totalMrr > 0 && (
            <div className="flex items-center gap-2.5">
              <DollarSign className="size-4 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">Monthly Recurring</div>
                <div className="text-sm font-semibold font-mono text-emerald-300">${totalMrr.toLocaleString()}/mo</div>
              </div>
            </div>
          )}
          {renewalsSoon.length > 0 && (
            <div className="flex items-center gap-2.5">
              <AlertCircle className="size-4 text-amber-400" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">Renewals Due Soon</div>
                <div className="text-sm font-semibold text-amber-300">
                  {renewalsSoon.length} client{renewalsSoon.length !== 1 ? "s" : ""} within 30 days
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <InboxSection leads={inboxLeads} onEdit={setEditing} />

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.stage}
            stage={col.stage}
            label={col.label}
            description={col.description}
            leads={leadsByStage.get(col.stage) ?? []}
            onEdit={setEditing}
          />
        ))}
      </div>

      {leads.length === 0 && inboxLeads.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
          <Building2 className="size-8 text-zinc-700" />
          <div className="text-sm font-medium text-zinc-400">No clients yet</div>
          <p className="text-xs text-zinc-600 max-w-xs">
            Leads that reply or get marked Interested will appear here. Move them through deal stages as you close them.
          </p>
        </div>
      )}

      {editing && (
        <DealDrawer
          lead={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}
