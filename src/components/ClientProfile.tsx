"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Globe,
  ListChecks,
  Loader2Icon,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontalIcon,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2Icon,
  Users,
  X,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  CRM_ACTIVITY_TYPE_OPTIONS,
  DEAL_HEALTH_META,
  computeDealHealth,
  getClientPriorityMeta,
  getCrmActivityTypeLabel,
  getDealStageMeta,
  getDealStageLabel,
  getDaysUntilRenewal,
  getEngagementTypeLabel,
  isActionOverdue,
  type CrmActivityType,
} from "@/lib/crm";
import type { CrmActivityRecord, LeadRecord, OutreachEmailRecord } from "@/lib/prisma";
import { getProjectMilestoneChecks } from "@/lib/ui/data-accuracy";
import { cn } from "@/lib/utils";

type ProfileOutreachEmail = Pick<
  OutreachEmailRecord,
  "id" | "leadId" | "senderEmail" | "recipientEmail" | "subject" | "status" | "errorMessage" | "sentAt" | "gmailThreadId"
>;

type SequenceInfo = {
  id: string; status: string; currentStep: string;
  nextScheduledAt: string | null; lastSentAt: string | null;
  replyDetectedAt: string | null; stopReason: string | null; createdAt: string;
} | null;

type SequenceStepInfo = {
  id: string; stepType: string; status: string;
  scheduledFor: string | null; sentAt: string | null;
  subject: string | null; bodyPlain: string | null;
};

type ClientProfileProps = {
  lead: LeadRecord;
  initialActivities: CrmActivityRecord[];
  outreachEmails: ProfileOutreachEmail[];
  sequence?: SequenceInfo;
  sequenceSteps?: SequenceStepInfo[];
};

const MANUAL_ACTIVITY_TYPES = CRM_ACTIVITY_TYPE_OPTIONS.filter((type) =>
  ["NOTE", "CALL", "MEETING", "EMAIL"].includes(type.value),
);

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Not set";
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return "Not set";
  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value: number | null | undefined) {
  if (!value) return "Not set";
  return `$${value.toLocaleString()}/mo`;
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">{label}</dt>
      <dd className="max-w-[68%] text-right text-sm text-zinc-300">{value || <span className="text-zinc-600">Not set</span>}</dd>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="v2-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{icon}</span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "EMAIL") return <Mail className="size-3.5" />;
  if (type === "CALL") return <Phone className="size-3.5" />;
  if (type === "MEETING") return <Users className="size-3.5" />;
  if (type === "PROPOSAL_SENT") return <FileText className="size-3.5" />;
  if (type === "SIGNED") return <CheckCircle2 className="size-3.5" />;
  if (type === "RENEWAL") return <RefreshCw className="size-3.5" />;
  if (type === "STAGE_CHANGE") return <BriefcaseBusiness className="size-3.5" />;
  return <MessageSquare className="size-3.5" />;
}

function ContactLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs font-medium text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
    >
      {icon}
      <span className="max-w-[220px] truncate">{label}</span>
      {href.startsWith("http") ? <ExternalLink className="size-3 text-zinc-600" /> : null}
    </a>
  );
}

export function ClientProfile({ lead, initialActivities, outreachEmails, sequence, sequenceSteps = [] }: ClientProfileProps) {
  const [activities, setActivities] = useState(initialActivities);
  const [activityType, setActivityType] = useState<CrmActivityType>("NOTE");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityBody, setActivityBody] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>("ALL");
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editingActivity, setEditingActivity] = useState<CrmActivityRecord | null>(null);
  const [editActivityTitle, setEditActivityTitle] = useState("");
  const [editActivityBody, setEditActivityBody] = useState("");
  const [savingEditActivity, setSavingEditActivity] = useState(false);
  const [deleteActivity, setDeleteActivity] = useState<CrmActivityRecord | null>(null);
  const [deletingActivity, setDeletingActivity] = useState(false);

  const stageMeta = getDealStageMeta(lead.dealStage);
  const health = lead.dealStage ? computeDealHealth(lead) : null;
  const healthMeta = health ? DEAL_HEALTH_META[health] : null;
  const priorityMeta = getClientPriorityMeta(lead.clientPriority);
  const overdue = isActionOverdue(lead.nextActionDueAt);
  const renewalDays = getDaysUntilRenewal(lead.renewalDate);
  const sentEmails = outreachEmails.filter((email) => email.status === "sent").length;

  const sortedActivities = useMemo(() => {
    const sorted = [...activities].sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
    if (activityFilter === "ALL") return sorted;
    return sorted.filter((a) => a.type === activityFilter);
  }, [activities, activityFilter]);

  const toggleEmailExpand = (emailId: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  const handleQuickEdit = async (field: string, value: string) => {
    setSavingField(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/deal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditingField(null);
    } catch {
      // silently fail — field stays editable
    } finally {
      setSavingField(false);
    }
  };

  const handleAddActivity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingActivity(true);
    setActivityError(null);

    try {
      const res = await fetch(`/api/clients/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activityType,
          title: activityTitle || undefined,
          body: activityBody,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to log activity");
      }

      const data = await res.json() as { activity: CrmActivityRecord };
      setActivities((current) => [data.activity, ...current]);
      setActivityTitle("");
      setActivityBody("");
      setActivityType("NOTE");
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Failed to log activity");
    } finally {
      setSavingActivity(false);
    }
  };

  const handleEditActivity = async () => {
    if (!editingActivity) return;
    setSavingEditActivity(true);
    try {
      const res = await fetch(`/api/clients/${lead.id}/activities/${editingActivity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editActivityTitle, body: editActivityBody }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json() as { activity: CrmActivityRecord };
      setActivities((prev) => prev.map((a) => (a.id === data.activity.id ? data.activity : a)));
      setEditingActivity(null);
    } catch {
      // stay in edit mode on failure
    } finally {
      setSavingEditActivity(false);
    }
  };

  const handleDeleteActivity = async () => {
    if (!deleteActivity) return;
    setDeletingActivity(true);
    try {
      const res = await fetch(`/api/clients/${lead.id}/activities/${deleteActivity.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setActivities((prev) => prev.filter((a) => a.id !== deleteActivity.id));
      setDeleteActivity(null);
    } catch {
      // stay open on failure
    } finally {
      setDeletingActivity(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDialog
        open={!!deleteActivity}
        onOpenChange={(v) => { if (!v) setDeleteActivity(null); }}
        title="Delete Activity"
        description={`Delete "${deleteActivity?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deletingActivity}
        onConfirm={handleDeleteActivity}
      />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/clients"
            className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
          >
            <ArrowLeft className="size-3.5" />
            Client board
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-white">{lead.businessName}</h1>
            {stageMeta ? (
              <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", stageMeta.classes)}>
                {stageMeta.label}
              </span>
            ) : (
              <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300">
                Reply inbox
              </span>
            )}
            {healthMeta && health !== "WON" && health !== "LOST" ? (
              <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", healthMeta.pillClasses)}>
                {healthMeta.label}
              </span>
            ) : null}
            {priorityMeta ? (
              <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", priorityMeta.classes)}>
                {priorityMeta.label} priority
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {lead.city} / {lead.niche}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {lead.email ? <ContactLink href={`mailto:${lead.email}`} icon={<Mail className="size-3.5" />} label={lead.email} /> : null}
          {lead.phone ? <ContactLink href={`tel:${lead.phone}`} icon={<Phone className="size-3.5" />} label={lead.phone} /> : null}
          {lead.websiteUrl ? (
            <ContactLink href={lead.websiteUrl} icon={<Globe className="size-3.5" />} label={lead.websiteDomain ?? lead.websiteUrl} />
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="v2-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <Clock className="size-3.5" />
            Next Action
          </div>
          <div className={cn("text-sm font-semibold", overdue ? "text-red-200" : "text-white")}>
            {lead.nextAction ?? "No action set"}
          </div>
          <div className={cn("mt-1 text-xs", overdue ? "text-red-400" : "text-zinc-500")}>
            {lead.nextActionDueAt ? formatDate(lead.nextActionDueAt) : "No due date"}
          </div>
        </div>
        <div className="v2-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <DollarSign className="size-3.5" />
            Value
          </div>
          <div className="font-mono text-lg font-semibold text-emerald-300">{formatMoney(lead.monthlyValue)}</div>
          <div className="mt-1 text-xs text-zinc-500">{getEngagementTypeLabel(lead.engagementType)}</div>
        </div>
        <div className="v2-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <Send className="size-3.5" />
            Outreach
          </div>
          <div className="text-sm font-semibold text-white">{sentEmails} sent</div>
          <div className="mt-1 text-xs text-zinc-500">{lead.outreachStatus ?? "No status"}</div>
        </div>
        <div className="v2-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            <RefreshCw className="size-3.5" />
            Renewal
          </div>
          <div className={cn("text-sm font-semibold", renewalDays !== null && renewalDays <= 30 ? "text-amber-300" : "text-white")}>
            {lead.renewalDate ? formatDate(lead.renewalDate) : "Not set"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {renewalDays === null ? "No renewal tracked" : renewalDays < 0 ? "Overdue" : `${renewalDays}d remaining`}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="flex flex-col gap-6">
          <Section title="Deal Record" icon={<BriefcaseBusiness className="size-4" />}>
            <dl>
              <FieldRow label="Stage" value={getDealStageLabel(lead.dealStage)} />
              <FieldRow label="Engagement" value={getEngagementTypeLabel(lead.engagementType)} />
              <FieldRow label="Monthly value" value={formatMoney(lead.monthlyValue)} />
              <FieldRow label="Proposal sent" value={formatDate(lead.proposalSentAt)} />
              <FieldRow label="Signed" value={formatDate(lead.signedAt)} />
              <FieldRow label="Project start" value={formatDate(lead.projectStartDate)} />
              <FieldRow label="Lost reason" value={lead.dealLostReason} />
            </dl>
          </Section>

          <Section title="Business Context" icon={<BuildingContextIcon />} action={
            <span className="text-[10px] text-zinc-600">Click field to edit</span>
          }>
            <dl>
              {(
                [
                  { label: "Contact", field: "contactName", value: lead.contactName },
                  { label: "Email", field: "email", value: lead.email },
                  { label: "Phone", field: "phone", value: lead.phone },
                  { label: "Website", field: "websiteUrl", value: lead.websiteDomain ?? lead.websiteUrl },
                  { label: "Website status", field: null, value: lead.websiteStatus },
                  { label: "Source", field: null, value: lead.source },
                  { label: "Address", field: "address", value: lead.address },
                ] as const
              ).map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0">
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">{row.label}</dt>
                  <dd className="max-w-[68%] text-right text-sm text-zinc-300">
                    {editingField === row.field ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full rounded border border-emerald-500/30 bg-black/40 px-2 py-1 text-xs text-white focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && row.field) void handleQuickEdit(row.field, editValue);
                            if (e.key === "Escape") setEditingField(null);
                          }}
                        />
                        <button type="button" disabled={savingField} onClick={() => row.field && void handleQuickEdit(row.field, editValue)} className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
                          <Check className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditingField(null)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={cn(row.field && "cursor-pointer hover:text-white transition-colors group")}
                        onClick={() => {
                          if (row.field) {
                            setEditingField(row.field);
                            setEditValue((row.value as string) ?? "");
                          }
                        }}
                      >
                        {row.value || <span className="text-zinc-600">Not set</span>}
                        {row.field && <Pencil className="inline-block ml-1.5 size-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Project Notes" icon={<FileText className="size-4" />}>
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {lead.projectNotes || "No project notes yet."}
            </p>
          </Section>

          <MilestoneChecklist
            dealStage={lead.dealStage}
            proposalSentAt={lead.proposalSentAt}
            signedAt={lead.signedAt}
            projectStartDate={lead.projectStartDate}
          />

          {/* Outreach Sequence Status */}
          {sequence && (
            <Section title="Outreach Sequence" icon={<Bot className="size-4" />}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Status</span>
                  <span className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    sequence.status === "COMPLETED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                    sequence.status === "BLOCKED" ? "border-red-500/20 bg-red-500/10 text-red-300" :
                    sequence.replyDetectedAt ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" :
                    "border-amber-500/20 bg-amber-500/10 text-amber-300"
                  )}>
                    {sequence.replyDetectedAt ? "Reply detected" : sequence.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Current step</span>
                  <span className="font-mono text-zinc-300">{sequence.currentStep.replace(/_/g, " ")}</span>
                </div>
                {sequence.nextScheduledAt && !sequence.replyDetectedAt && sequence.status !== "COMPLETED" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Next send</span>
                    <span className="text-zinc-300">{formatDateTime(sequence.nextScheduledAt)}</span>
                  </div>
                )}
                {sequence.stopReason && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Stop reason</span>
                    <span className="text-red-300 font-mono text-[11px]">{sequence.stopReason.replace(/_/g, " ")}</span>
                  </div>
                )}
                <div className="border-t border-white/[0.05] pt-3 space-y-2">
                  {sequenceSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2.5 text-xs">
                      <span className={cn(
                        "flex size-5 items-center justify-center rounded-full border",
                        step.status === "SENT" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                        step.status === "BLOCKED" || step.status === "SKIPPED" ? "border-red-500/20 bg-red-500/10 text-red-400" :
                        "border-white/[0.08] bg-white/[0.03] text-zinc-600"
                      )}>
                        {step.status === "SENT" ? <Check className="size-3" /> : <Clock className="size-3" />}
                      </span>
                      <span className="text-zinc-400 font-medium">{step.stepType.replace(/_/g, " ")}</span>
                      <span className="text-zinc-600 ml-auto font-mono text-[10px]">
                        {step.sentAt ? formatDateTime(step.sentAt) : step.status.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          <Section title="Outreach History" icon={<Send className="size-4" />}>
            <dl className="mb-4">
              <FieldRow label="First contacted" value={formatDateTime(lead.firstContactedAt)} />
              <FieldRow label="Last contacted" value={formatDateTime(lead.lastContactedAt)} />
              <FieldRow label="Next outreach due" value={formatDateTime(lead.nextFollowUpDue)} />
              <FieldRow label="Last reply" value={formatDateTime(lead.lastReplyAt)} />
            </dl>
            {outreachEmails.length > 0 ? (
              <div className="divide-y divide-white/[0.05]">
                {outreachEmails.map((email) => {
                  const step = sequenceSteps.find((s) => s.subject === email.subject && s.bodyPlain);
                  const isExpanded = expandedEmails.has(email.id);
                  return (
                    <div key={email.id} className="py-2.5">
                      <button
                        type="button"
                        onClick={() => step?.bodyPlain && toggleEmailExpand(email.id)}
                        className={cn("w-full text-left", step?.bodyPlain && "cursor-pointer")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-start gap-2">
                            {step?.bodyPlain && (
                              isExpanded ? <ChevronDown className="size-3.5 text-zinc-600 shrink-0 mt-0.5" /> : <ChevronRight className="size-3.5 text-zinc-600 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-zinc-200">{email.subject || "No subject"}</div>
                              <div className="mt-0.5 truncate text-[11px] text-zinc-600">
                                {email.senderEmail} to {email.recipientEmail}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 rounded border border-white/[0.08] bg-white/[0.025] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                            {email.status}
                          </span>
                        </div>
                      </button>
                      <div className="mt-1 text-[11px] text-zinc-600">{formatDateTime(email.sentAt)}</div>
                      {email.errorMessage ? <div className="mt-1 text-xs text-red-300">{email.errorMessage}</div> : null}
                      {isExpanded && step?.bodyPlain && (
                        <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/30 p-3 text-xs text-zinc-400 whitespace-pre-wrap leading-5">
                          {step.bodyPlain}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No outreach emails recorded for this lead.</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Log Activity" icon={<Plus className="size-4" />}>
            <form onSubmit={handleAddActivity} className="flex flex-col gap-3">
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <select
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value as CrmActivityType)}
                  className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                >
                  {MANUAL_ACTIVITY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={activityTitle}
                  onChange={(event) => setActivityTitle(event.target.value)}
                  placeholder="Title"
                  className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
              <textarea
                value={activityBody}
                onChange={(event) => setActivityBody(event.target.value)}
                rows={4}
                placeholder="Notes from the call, meeting, email, or next decision."
                className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
              {activityError ? <div className="text-sm text-red-300">{activityError}</div> : null}
              <button
                type="submit"
                disabled={savingActivity || (!activityTitle.trim() && !activityBody.trim())}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {savingActivity ? "Saving..." : "Save activity"}
              </button>
            </form>
          </Section>

          <Section
            title="Activity Timeline"
            icon={<Clock className="size-4" />}
            action={<span className="font-mono text-[11px] text-zinc-600">{activities.length}</span>}
          >
            <div className="flex flex-wrap gap-1.5 mb-4">
              {["ALL", "NOTE", "CALL", "MEETING", "EMAIL", "STAGE_CHANGE", "SYSTEM"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActivityFilter(filter)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer",
                    activityFilter === filter
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-white/[0.08] bg-white/[0.025] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.14]"
                  )}
                >
                  {filter === "ALL" ? "All" : filter === "STAGE_CHANGE" ? "Stages" : filter.charAt(0) + filter.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {sortedActivities.length > 0 ? (
              <div className="relative flex flex-col gap-4">
                {sortedActivities.map((activity) => (
                  <div key={activity.id} className="grid grid-cols-[28px_1fr] gap-3">
                    <div className="flex size-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                      <ActivityIcon type={activity.type} />
                    </div>
                    <div className="min-w-0 border-b border-white/[0.05] pb-4 last:border-0 last:pb-0">
                      {editingActivity?.id === activity.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editActivityTitle}
                            onChange={(e) => setEditActivityTitle(e.target.value)}
                            className="w-full rounded-lg border border-emerald-500/30 bg-black/40 px-3 py-1.5 text-sm text-white focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleEditActivity();
                              if (e.key === "Escape") setEditingActivity(null);
                            }}
                          />
                          <textarea
                            value={editActivityBody}
                            onChange={(e) => setEditActivityBody(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-white/[0.09] bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={savingEditActivity}
                              onClick={() => void handleEditActivity()}
                              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer"
                            >
                              {savingEditActivity ? <Loader2Icon className="size-3 animate-spin" /> : <Save className="size-3" />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingActivity(null)}
                              className="rounded-md border border-white/[0.08] px-3 py-1 text-xs text-zinc-400 hover:text-white transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">{activity.title}</div>
                              <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-zinc-600">
                                {getCrmActivityTypeLabel(activity.type)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-zinc-600">{formatDateTime(activity.createdAt)}</span>
                              {activity.type !== "STAGE_CHANGE" && activity.type !== "SYSTEM" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button type="button" className="inline-flex size-6 items-center justify-center rounded-md text-zinc-600 hover:bg-white/[0.08] hover:text-zinc-300 transition-colors cursor-pointer">
                                      <MoreHorizontalIcon className="size-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      setEditingActivity(activity);
                                      setEditActivityTitle(activity.title);
                                      setEditActivityBody(activity.body ?? "");
                                    }}>
                                      <Pencil className="size-3.5" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteActivity(activity)}>
                                      <Trash2Icon className="size-3.5" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          {activity.body ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{activity.body}</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No CRM activity logged yet.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

type ProjectMilestoneKey = keyof ReturnType<typeof getProjectMilestoneChecks>;

const PROJECT_MILESTONES: { key: ProjectMilestoneKey; label: string; requiredStage?: string }[] = [
  { key: "proposal", label: "Proposal sent" },
  { key: "signed", label: "Contract signed" },
  { key: "kickoff", label: "Kickoff / discovery call", requiredStage: "SIGNED" },
  { key: "started", label: "Project started", requiredStage: "ACTIVE" },
  { key: "review", label: "First review delivered", requiredStage: "ACTIVE" },
  { key: "delivered", label: "Project delivered", requiredStage: "DELIVERED" },
  { key: "retained", label: "Retainer activated", requiredStage: "RETAINED" },
];

function MilestoneChecklist({
  dealStage,
  proposalSentAt,
  signedAt,
  projectStartDate,
}: {
  dealStage: string | null;
  proposalSentAt: Date | string | null;
  signedAt: Date | string | null;
  projectStartDate: Date | string | null;
}) {
  if (!dealStage) return null;

  const checkMap = getProjectMilestoneChecks({ dealStage, proposalSentAt, signedAt, projectStartDate });
  const completed = Object.values(checkMap).filter(Boolean).length;

  return (
    <Section title="Project Milestones" icon={<ListChecks className="size-4" />} action={
      <span className="font-mono text-[11px] text-zinc-600">{completed}/{PROJECT_MILESTONES.length}</span>
    }>
      <div className="flex flex-col gap-1">
        {PROJECT_MILESTONES.map((ms) => {
          const done = checkMap[ms.key];
          return (
            <div key={ms.key} className="flex items-center gap-2.5 py-1.5">
              {done ? (
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="size-4 text-zinc-700 shrink-0" />
              )}
              <span className={cn("text-sm", done ? "text-zinc-300" : "text-zinc-600")}>
                {ms.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/60 transition-all"
          style={{ width: `${(completed / PROJECT_MILESTONES.length) * 100}%` }}
        />
      </div>
    </Section>
  );
}

function BuildingContextIcon() {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <MapPin className="absolute size-3.5 text-zinc-500" />
      <Calendar className="absolute -bottom-1 -right-1 size-2.5 text-zinc-600" />
    </span>
  );
}
