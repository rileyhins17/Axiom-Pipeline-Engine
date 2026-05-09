"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
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

function formatCompactMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value.toLocaleString()}`;
}

function defaultDueDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(17, 0, 0, 0);
  return date.toISOString();
}

function toInputDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// ---------- Deal Card ----------

function DealCard({
  lead,
  onEdit,
  onDragStart,
  onDragEnd,
}: {
  lead: CrmLead;
  onEdit: (lead: CrmLead) => void;
  onDragStart?: (e: React.DragEvent, leadId: number) => void;
  onDragEnd?: () => void;
}) {
  const stageMeta = getDealStageMeta(lead.dealStage);
  const daysUntilRenewal = getDaysUntilRenewal(lead.renewalDate);
  const renewalWarning = daysUntilRenewal !== null && daysUntilRenewal <= 30;
  const overdue = isActionOverdue(lead.nextActionDueAt);
  const health = lead.dealStage ? computeDealHealth(lead) : null;
  const healthMeta = health ? DEAL_HEALTH_META[health] : null;

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart?.(e, lead.id)}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onEdit(lead)}
      className="group w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all p-3.5 cursor-grab active:cursor-grabbing"
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
  onDragStart,
  onDragEnd,
  onDrop,
  isDragOver,
  onDragOver,
  onDragLeave,
}: {
  stage: DealStage;
  label: string;
  description: string;
  leads: CrmLead[];
  onEdit: (lead: CrmLead) => void;
  onAddFromInbox?: () => void;
  onDragStart?: (e: React.DragEvent, leadId: number) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent, stage: DealStage) => void;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent, stage: DealStage) => void;
  onDragLeave?: () => void;
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
        onDragOver={(e) => { e.preventDefault(); onDragOver?.(e, stage); }}
        onDragLeave={() => onDragLeave?.()}
        onDrop={(e) => { e.preventDefault(); onDrop?.(e, stage); }}
        className={cn(
          "flex-1 rounded-xl border p-2.5 flex flex-col gap-2 min-h-[120px] transition-colors",
          isDragOver
            ? "border-emerald-500/40 bg-emerald-500/5"
            : stageMeta ? `${stageMeta.classes.split(" ").find((c) => c.startsWith("border-")) ?? "border-white/[0.06]"} bg-black/20` : "border-white/[0.06] bg-black/20",
        )}
      >
        {leads.map((lead) => (
          <DealCard key={lead.id} lead={lead} onEdit={onEdit} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        {leads.length === 0 && !isDragOver && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[11px] text-zinc-700">Empty</span>
          </div>
        )}
        {isDragOver && (
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-emerald-500/30 rounded-lg">
            <span className="text-[11px] text-emerald-400 font-medium">Drop here</span>
          </div>
        )}
        {onAddFromInbox && leads.length === 0 && !isDragOver && (
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

  const handleDealStageChange = (nextStage: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setDealStage(nextStage);
    if (nextStage === "PROPOSAL_SENT" && !proposalSentAt) {
      setProposalSentAt(today);
    }
    if (nextStage === "SIGNED" && !signedAt) {
      setSignedAt(today);
    }
  };

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
                onChange={(e) => handleDealStageChange(e.target.value)}
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
          <div className="flex flex-col gap-1">
            <div className="text-[10.5px] text-zinc-600">
              {lead.firstContactedAt ? `First contact ${formatDate(lead.firstContactedAt)}` : "Not yet contacted"}
            </div>
            <Link
              href={`/clients/${lead.id}` as Route}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Open full profile
              <ExternalLink className="size-3" />
            </Link>
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
  onQuickUpdate,
  saving,
}: {
  leads: CrmLead[];
  onEdit: (lead: CrmLead) => void;
  onQuickUpdate: (leadId: number, update: Record<string, unknown>) => Promise<void>;
  saving: boolean;
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
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/10"
          >
            <button
              type="button"
              onClick={() => onEdit(lead)}
              className="group flex w-full items-start gap-2.5 text-left cursor-pointer"
            >
              <Building2 className="mt-0.5 size-3.5 shrink-0 text-cyan-400/70" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-white">{lead.businessName}</div>
                <div className="mt-0.5 truncate text-[10px] text-zinc-500">{lead.city} / {lead.niche}</div>
              </div>
              <ChevronRight className="size-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400" />
            </button>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void onQuickUpdate(lead.id, {
                    dealStage: "NEGOTIATING",
                    nextAction: "Schedule 30-minute discovery call",
                    nextActionDueAt: defaultDueDate(1),
                  })
                }
                className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10.5px] font-medium text-zinc-400 transition hover:border-orange-500/30 hover:text-orange-300 disabled:pointer-events-none disabled:opacity-50"
              >
                Discovery
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onQuickUpdate(lead.id, { dealStage: "PROPOSAL_SENT" })}
                className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10.5px] font-medium text-zinc-400 transition hover:border-amber-500/30 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-50"
              >
                Proposal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void onQuickUpdate(lead.id, {
                    dealStage: "LOST",
                    dealLostReason: "Not qualified from CRM inbox",
                  })
                }
                className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10.5px] font-medium text-zinc-500 transition hover:border-red-500/30 hover:text-red-300 disabled:pointer-events-none disabled:opacity-50"
              >
                Lost
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  detail,
  tone = "zinc",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: "emerald" | "amber" | "cyan" | "red" | "zinc";
}) {
  const toneClasses = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    cyan: "text-cyan-300",
    red: "text-red-300",
    zinc: "text-zinc-200",
  }[tone];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={cn("font-mono text-lg font-semibold tabular-nums", toneClasses)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-zinc-600">{detail}</div>
    </div>
  );
}

// ---------- Main Board ----------

function exportClientsCsv(leads: CrmLead[]) {
  const headers = [
    "Business Name", "City", "Niche", "Stage", "Engagement", "Monthly Value",
    "Priority", "Contact", "Email", "Phone", "Website", "Next Action",
    "Due Date", "Health", "Proposal Sent", "Signed", "Project Start",
    "Renewal", "Notes",
  ];
  const escCsv = (v: string | null | undefined) => {
    if (!v) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map((l) => [
    l.businessName, l.city, l.niche, l.dealStage ?? "", l.engagementType ?? "",
    l.monthlyValue ?? "", l.clientPriority ?? "", l.contactName ?? "",
    l.email ?? "", l.phone ?? "", l.websiteUrl ?? "", l.nextAction ?? "",
    l.nextActionDueAt ? new Date(l.nextActionDueAt as string).toISOString().slice(0, 10) : "",
    l.dealStage ? computeDealHealth(l) : "",
    l.proposalSentAt ? new Date(l.proposalSentAt as string).toISOString().slice(0, 10) : "",
    l.signedAt ? new Date(l.signedAt as string).toISOString().slice(0, 10) : "",
    l.projectStartDate ? new Date(l.projectStartDate as string).toISOString().slice(0, 10) : "",
    l.renewalDate ? new Date(l.renewalDate as string).toISOString().slice(0, 10) : "",
    l.projectNotes ?? "",
  ].map((v) => escCsv(String(v ?? ""))).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `axiom-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ClientsBoard({ initialLeads }: { initialLeads: CrmLead[] }) {
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

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

  const handleDragStart = useCallback((e: React.DragEvent, leadId: number) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(leadId));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedLeadId(null);
    setDragOverStage(null);
  }, []);

  const handleColumnDrop = useCallback(async (_e: React.DragEvent, stage: DealStage) => {
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    if (!lead || lead.dealStage === stage) {
      setDraggedLeadId(null);
      setDragOverStage(null);
      return;
    }
    setDragOverStage(null);
    setDraggedLeadId(null);
    await handleSave(lead.id, { dealStage: stage });
  }, [draggedLeadId, leads, handleSave]);

  const activeMrr = useMemo(
    () => leads
      .filter((l) => l.dealStage === "ACTIVE" || l.dealStage === "RETAINED")
      .reduce((s, l) => s + (l.monthlyValue ?? 0), 0),
    [leads],
  );

  const openPipelineValue = useMemo(
    () => leads
      .filter((l) => l.dealStage === "PROPOSAL_SENT" || l.dealStage === "NEGOTIATING" || l.dealStage === "SIGNED")
      .reduce((s, l) => s + (l.monthlyValue ?? 0), 0),
    [leads],
  );

  const proposalCount = useMemo(
    () => leads.filter((l) => l.dealStage === "PROPOSAL_SENT").length,
    [leads],
  );

  const actionDueCount = useMemo(
    () => leads.filter((l) => l.dealStage && l.dealStage !== "LOST" && isActionOverdue(l.nextActionDueAt)).length,
    [leads],
  );

  const renewalsSoon = useMemo(
    () => leads.filter((l) => {
      const d = getDaysUntilRenewal(l.renewalDate);
      return d !== null && d <= 30 && d >= 0;
    }),
    [leads],
  );

  const upcomingRenewals = useMemo(
    () => leads
      .filter((l) => {
        const d = getDaysUntilRenewal(l.renewalDate);
        return d !== null && d >= -7 && d <= 90;
      })
      .sort((a, b) => {
        const da = new Date(a.renewalDate as string).getTime();
        const db = new Date(b.renewalDate as string).getTime();
        return da - db;
      }),
    [leads],
  );

  const clientLeads = useMemo(
    () => leads.filter((l) => l.dealStage || l.outreachStatus === "REPLIED" || l.outreachStatus === "INTERESTED"),
    [leads],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Stats bar + export */}
      <div className="flex items-start justify-between gap-4">
        <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatTile
            icon={<MessageSquare className="size-3.5" />}
            label="Review Inbox"
            value={inboxLeads.length}
            detail="replied or interested"
            tone={inboxLeads.length > 0 ? "cyan" : "zinc"}
          />
          <StatTile
            icon={<DollarSign className="size-3.5" />}
            label="Open Pipeline"
            value={formatCompactMoney(openPipelineValue)}
            detail={`${proposalCount} proposal${proposalCount === 1 ? "" : "s"} pending`}
            tone={openPipelineValue > 0 ? "amber" : "zinc"}
          />
          <StatTile
            icon={<DollarSign className="size-3.5" />}
            label="Active MRR"
            value={`${formatCompactMoney(activeMrr)}/mo`}
            detail="active and retained"
            tone={activeMrr > 0 ? "emerald" : "zinc"}
          />
          <StatTile
            icon={<Clock className="size-3.5" />}
            label="Due Actions"
            value={actionDueCount}
            detail="overdue follow-ups"
            tone={actionDueCount > 0 ? "red" : "zinc"}
          />
          <StatTile
            icon={<RefreshCw className="size-3.5" />}
            label="Renewals"
            value={renewalsSoon.length}
            detail="within 30 days"
            tone={renewalsSoon.length > 0 ? "amber" : "zinc"}
          />
        </div>
        {clientLeads.length > 0 && (
          <button
            type="button"
            onClick={() => exportClientsCsv(clientLeads)}
            className="shrink-0 mt-1 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <InboxSection leads={inboxLeads} onEdit={setEditing} onQuickUpdate={handleSave} saving={saving} />

      {/* Kanban board with drag-and-drop */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.stage}
            stage={col.stage}
            label={col.label}
            description={col.description}
            leads={leadsByStage.get(col.stage) ?? []}
            onEdit={setEditing}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleColumnDrop}
            isDragOver={dragOverStage === col.stage}
            onDragOver={(_e, stage) => setDragOverStage(stage)}
            onDragLeave={() => setDragOverStage(null)}
          />
        ))}
      </div>

      {/* Renewal Calendar */}
      {upcomingRenewals.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="size-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Renewal Calendar</span>
            <span className="font-mono text-[10px] text-zinc-500 border border-white/[0.09] bg-black/30 rounded px-1 py-0.5">
              {upcomingRenewals.length}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {upcomingRenewals.map((lead) => {
              const days = getDaysUntilRenewal(lead.renewalDate)!;
              const isOverdue = days < 0;
              const isUrgent = days >= 0 && days <= 7;
              const isSoon = days > 7 && days <= 30;
              return (
                <Link
                  key={lead.id}
                  href={`/clients/${lead.id}` as Route}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all hover:bg-white/[0.04]",
                    isOverdue ? "border-red-500/20 bg-red-500/5" :
                    isUrgent ? "border-amber-500/20 bg-amber-500/5" :
                    isSoon ? "border-amber-500/10 bg-amber-500/[0.02]" :
                    "border-white/[0.06]"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{lead.businessName}</div>
                    <div className="text-[10.5px] text-zinc-500 mt-0.5">
                      {lead.monthlyValue ? `${formatCompactMoney(lead.monthlyValue)}/mo` : lead.niche}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      "text-xs font-semibold",
                      isOverdue ? "text-red-300" : isUrgent ? "text-amber-300" : isSoon ? "text-amber-400" : "text-zinc-400"
                    )}>
                      {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      {formatDate(lead.renewalDate)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

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
