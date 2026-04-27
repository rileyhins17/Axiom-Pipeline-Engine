"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";

interface LeadData {
  id: number;
  businessName: string;
  niche: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: string | null;
  axiomScore: number | null;
  axiomTier: string | null;
  outreachStatus: string | null;
  enrichedAt: string | null;
  enrichmentData: string | null;
  isArchived: boolean;
  createdAt: string;
}

const READY_STATUSES = new Set(["READY_FOR_FIRST_TOUCH", "ENRICHED"]);

function statusLabel(status: string | null) {
  if (!status) return "New";
  const labels: Record<string, string> = {
    NOT_CONTACTED: "New",
    ENRICHING: "Enriching",
    ENRICHED: "Ready",
    READY_FOR_FIRST_TOUCH: "Ready",
    OUTREACHED: "Sent",
    FOLLOW_UP_DUE: "Follow-up",
    REPLIED: "Replied",
    INTERESTED: "Interested",
    NOT_INTERESTED: "Declined",
  };
  return labels[status] || status;
}

function statusTone(status: string | null) {
  if (status === "OUTREACHED" || status === "REPLIED" || status === "INTERESTED") {
    return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  }
  if (READY_STATUSES.has(status || "")) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "ENRICHING" || status === "FOLLOW_UP_DUE") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  }
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function scoreTone(score: number | null) {
  if (score == null) return "text-zinc-500";
  if (score >= 70) return "text-emerald-300";
  if (score >= 50) return "text-cyan-300";
  if (score >= 35) return "text-amber-300";
  return "text-zinc-500";
}

export function DossierClient({ leadId }: { leadId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "archive" | "enrich" | "queue" | "send">(null);

  const loadLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Lead not found" : "Failed to load lead");
      setLead(await res.json());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load lead");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const enrichLead = async () => {
    if (!lead) return;
    setBusy("enrich");
    try {
      const res = await fetch("/api/outreach/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to enrich lead");
      toast("Lead enriched and ready.", { type: "success", icon: "note" });
      await loadLead();
    } catch (enrichError) {
      toast(enrichError instanceof Error ? enrichError.message : "Failed to enrich lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusy(null);
    }
  };

  const queueLead = async (immediate: boolean) => {
    if (!lead) return;
    setBusy(immediate ? "send" : "queue");
    try {
      const res = await fetch("/api/outreach/automation/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [lead.id], immediate }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to queue lead");
      const queued = data?.queued?.length || 0;
      const skipped = data?.skipped?.length || 0;
      toast(
        queued > 0
          ? immediate
            ? "Lead queued for immediate send."
            : "Lead queued for automation."
          : skipped > 0
            ? data?.skipped?.[0]?.reason || "Lead was skipped."
            : "Nothing changed.",
        { type: queued > 0 ? "success" : "info", icon: "note" },
      );
      await loadLead();
    } catch (queueError) {
      toast(queueError instanceof Error ? queueError.message : "Failed to queue lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleArchive = async () => {
    if (!lead) return;
    setBusy("archive");
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !lead.isArchived }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update lead");
      setLead(data);
      toast(data.isArchived ? "Lead archived." : "Lead restored.", { type: "success", icon: "note" });
    } catch (archiveError) {
      toast(archiveError instanceof Error ? archiveError.message : "Failed to update lead", {
        type: "error",
        icon: "note",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="h-72 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => router.push("/outreach")}
          className="mb-8 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Outreach
        </button>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-red-500/10 bg-red-500/[0.04]">
            <AlertTriangle className="h-7 w-7 text-red-400/60" />
          </div>
          <h2 className="mb-1 text-lg font-bold text-white">Lead not found</h2>
          <p className="text-sm text-muted-foreground">{error || "This lead does not exist or has been deleted."}</p>
        </div>
      </div>
    );
  }

  const ready = READY_STATUSES.has(lead.outreachStatus || "");
  const canEnrich = lead.outreachStatus === "NOT_CONTACTED" || lead.outreachStatus === "ENRICHING" || !lead.enrichmentData;
  const canQueue = ready && !!lead.email;

  return (
    <div className="mx-auto max-w-5xl animate-slide-up space-y-5">
      <button
        onClick={() => router.push("/outreach")}
        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Outreach
      </button>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-[0_22px_80px_rgba(0,0,0,0.22)]">
        <div className="border-b border-white/10 p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest", statusTone(lead.outreachStatus))}>
                  {statusLabel(lead.outreachStatus)}
                </span>
                {lead.axiomTier ? (
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-300">
                    Tier {lead.axiomTier}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">{lead.businessName}</h1>
              <p className="mt-2 text-sm text-zinc-400">
                {lead.niche} in {lead.city || "unknown city"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right">
              <div className={cn("text-4xl font-semibold tabular-nums", scoreTone(lead.axiomScore))}>
                {lead.axiomScore ?? "-"}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Axiom score</div>
            </div>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
          <InfoBlock icon={Mail} label="Email" value={lead.email || "No email"} muted={!lead.email} />
          <InfoBlock icon={Phone} label="Phone" value={lead.phone || "No phone"} muted={!lead.phone} />
          <InfoBlock icon={MapPin} label="Location" value={lead.address || lead.city || "No address"} muted={!lead.address && !lead.city} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            Outreach readiness
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ReadinessItem label="Email" ok={!!lead.email} value={lead.email ? "Available" : "Missing"} />
            <ReadinessItem label="Enrichment" ok={!!lead.enrichmentData || !!lead.enrichedAt} value={lead.enrichmentData || lead.enrichedAt ? "Complete" : "Needed"} />
            <ReadinessItem label="Automation" ok={ready} value={ready ? "Ready" : "Waiting"} />
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <Button
            type="button"
            onClick={() => void enrichLead()}
            disabled={busy !== null || !canEnrich || !lead.email}
            className="h-10 w-full cursor-pointer justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {busy === "enrich" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Enrich and ready
          </Button>
          <Button
            type="button"
            onClick={() => void queueLead(false)}
            disabled={busy !== null || !canQueue}
            className="h-10 w-full cursor-pointer justify-center gap-2 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40"
          >
            {busy === "queue" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Queue automation
          </Button>
          <Button
            type="button"
            onClick={() => void queueLead(true)}
            disabled={busy !== null || !canQueue}
            className="h-10 w-full cursor-pointer justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-40"
          >
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send now
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void toggleArchive()}
            disabled={busy !== null}
            className="h-10 w-full cursor-pointer justify-center gap-2 rounded-lg border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]"
          >
            {busy === "archive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : lead.isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {lead.isArchived ? "Restore lead" : "Archive lead"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div className={cn("mt-0.5 truncate text-sm", muted ? "text-zinc-600" : "text-zinc-200")}>{value}</div>
      </div>
    </div>
  );
}

function ReadinessItem({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={cn("h-2 w-2 rounded-full", ok ? "bg-emerald-400" : "bg-zinc-600")} />
      </div>
      <div className={cn("mt-2 text-sm font-medium", ok ? "text-zinc-100" : "text-zinc-500")}>{value}</div>
    </div>
  );
}
