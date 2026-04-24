"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, FileText } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import {
    DISPOSITION_OPTIONS,
    addToCallList,
    getArchiveOverride,
    getLeadDisposition,
    isInCallList,
    removeFromCallList,
    setArchiveOverride,
} from "@/lib/ui/storage";
import { getTierConfig } from "@/lib/ui/tokens";

import { CallSheet } from "./call-sheet";
import { ContactQuality } from "./contact-quality";
import { DisqualifiersPanel } from "./disqualifiers-panel";
import { DossierSkeleton } from "./dossier-skeleton";
import { IdentityCard } from "./identity-card";
import { OperationalHistory } from "./operational-history";
import { PainSignalsPanel } from "./pain-signals-panel";
import { QuickActions } from "./quick-actions";
import { WebsiteAssessmentPanel } from "./website-assessment-panel";

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
    scoreBreakdown: string | null;
    painSignals: string | null;
    callOpener: string | null;
    followUpQuestion: string | null;
    axiomWebsiteAssessment: string | null;
    emailType: string | null;
    emailConfidence: number | null;
    phoneConfidence: number | null;
    disqualifiers: string | null;
    disqualifyReason: string | null;
    source: string | null;
    isArchived: boolean;
    lastUpdated: string | null;
    createdAt: string;
}

function parseJSON<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function DossierClient({ leadId }: { leadId: number }) {
    const router = useRouter();
    const { toast } = useToast();
    const [lead, setLead] = useState<LeadData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [archived, setArchived] = useState(false);
    const [archiveSyncPending, setArchiveSyncPending] = useState(false);
    const [inCallList, setInCallList] = useState(false);

    useEffect(() => {
        fetch(`/api/leads/${leadId}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? "Lead not found" : "Failed to load");
                return res.json();
            })
            .then((data: LeadData) => {
                setLead(data);
                const override = getArchiveOverride(data.id);
                setArchived(override !== null ? override : data.isArchived);
                setArchiveSyncPending(override !== null && override !== data.isArchived);
                setInCallList(isInCallList(data.id));
            })
            .catch((fetchError: Error) => setError(fetchError.message))
            .finally(() => setLoading(false));
    }, [leadId]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
            if (isInput) return;

            if (event.key === "n" || event.key === "N") {
                event.preventDefault();
                document.getElementById("dossier-note-input")?.focus();
            }
            if (event.key === "c" && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                if (lead?.callOpener) {
                    navigator.clipboard.writeText(lead.callOpener)
                        .then(() => toast("Copied opener", { icon: "copy" }))
                        .catch(() => {});
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [lead, toast]);

    const toggleArchive = useCallback(() => {
        if (!lead) return;
        const newVal = !archived;
        setArchived(newVal);
        setArchiveOverride(lead.id, newVal);
        setArchiveSyncPending(newVal !== lead.isArchived);
        toast(newVal ? "Archived (UI only)" : "Unarchived (UI only)", { type: "info" });
    }, [lead, archived, toast]);

    const toggleCallList = useCallback(() => {
        if (!lead) return;
        if (inCallList) {
            removeFromCallList(lead.id);
            setInCallList(false);
            toast("Removed from call list", { type: "info" });
        } else {
            addToCallList(lead.id);
            setInCallList(true);
            toast("Added to call list", { type: "success" });
        }
    }, [lead, inCallList, toast]);

    if (loading) {
        return (
            <div className="mx-auto max-w-[1500px]">
                <div className="mb-6">
                    <div className="h-8 w-48 animate-pulse rounded bg-white/[0.04]" />
                </div>
                <DossierSkeleton />
            </div>
        );
    }

    if (error || !lead) {
        return (
            <div className="mx-auto max-w-7xl">
                <button
                    onClick={() => router.push("/vault")}
                    className="mb-8 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Vault
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

    const painSignals = parseJSON<Array<{ type: string; severity: number; evidence: string; source?: string }>>(lead.painSignals, []);
    const assessment = parseJSON<{
        speedRisk: number;
        conversionRisk: number;
        trustRisk: number;
        seoRisk: number;
        overallGrade: string;
        topFixes: string[];
    } | null>(lead.axiomWebsiteAssessment, null);
    const scoreBreakdown = parseJSON<Record<string, string | number> | null>(lead.scoreBreakdown, null);
    const disqualifiers = parseJSON<string[]>(lead.disqualifiers, []);
    const disposition = getLeadDisposition(lead.id);
    const dispOpt = disposition ? DISPOSITION_OPTIONS.find((option) => option.value === disposition.type) : null;
    const tierConfig = getTierConfig(lead.axiomTier);

    return (
        <div className="mx-auto max-w-[1500px] animate-slide-up">
            <div className="mb-5 border-b border-white/[0.06] pb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                        onClick={() => router.push("/vault")}
                        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" /> Vault
                    </button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {dispOpt ? (
                            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-mono text-zinc-300">
                                {dispOpt.icon} {dispOpt.label}
                            </span>
                        ) : null}
                        {lead.lastUpdated ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
                                <Clock className="h-3 w-3" />
                                {new Date(lead.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                            <FileText className={cn("h-3.5 w-3.5", tierConfig.text)} />
                            Lead dossier
                        </div>
                        <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-white md:text-3xl">
                            {lead.businessName}
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            {lead.niche} in {lead.city} - verification, call prep, disposition, and local notes.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                    <IdentityCard
                        businessName={lead.businessName}
                        niche={lead.niche}
                        city={lead.city}
                        address={lead.address}
                        axiomTier={lead.axiomTier}
                        axiomScore={lead.axiomScore}
                        websiteStatus={lead.websiteStatus}
                        rating={lead.rating}
                        reviewCount={lead.reviewCount}
                        isArchived={archived}
                    />
                    <QuickActions
                        phone={lead.phone}
                        email={lead.email}
                        address={lead.address}
                        isArchived={archived}
                        isInCallList={inCallList}
                        onToggleArchive={toggleArchive}
                        onToggleCallList={toggleCallList}
                        archiveSyncPending={archiveSyncPending}
                    />
                    <ContactQuality
                        emailType={lead.emailType}
                        emailConfidence={lead.emailConfidence}
                        phoneConfidence={lead.phoneConfidence}
                    />

                    {scoreBreakdown ? (
                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                                Score breakdown
                            </div>
                            <div className="space-y-2">
                                {Object.entries(scoreBreakdown).map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between gap-3 text-xs">
                                        <span className="truncate text-zinc-400 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                                        <span className="font-mono font-bold text-white">{String(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </aside>

                <main className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <section className="min-w-0 space-y-5">
                        <PainSignalsPanel painSignals={painSignals} />
                        <WebsiteAssessmentPanel assessment={assessment} />
                        <DisqualifiersPanel
                            disqualifiers={disqualifiers}
                            disqualifyReason={lead.disqualifyReason}
                        />
                        <OperationalHistory leadId={lead.id} />
                    </section>
                    <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
                        <CallSheet
                            callOpener={lead.callOpener}
                            followUpQuestion={lead.followUpQuestion}
                            painSignals={painSignals}
                        />
                    </aside>
                </main>
            </div>
        </div>
    );
}
