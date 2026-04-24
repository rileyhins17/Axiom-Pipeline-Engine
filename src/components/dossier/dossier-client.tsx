"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import {
    getArchiveOverride, setArchiveOverride,
    isInCallList, addToCallList, removeFromCallList,
    getLeadDisposition, DISPOSITION_OPTIONS,
} from "@/lib/ui/storage";
import { getTierConfig } from "@/lib/ui/tokens";

import { DossierSkeleton } from "./dossier-skeleton";
import { IdentityCard } from "./identity-card";
import { QuickActions } from "./quick-actions";
import { ContactQuality } from "./contact-quality";
import { PainSignalsPanel } from "./pain-signals-panel";
import { WebsiteAssessmentPanel } from "./website-assessment-panel";
import { DisqualifiersPanel } from "./disqualifiers-panel";
import { CallSheet } from "./call-sheet";
import { OperationalHistory } from "./operational-history";

import { ArrowLeft, AlertTriangle, Clock, FileText } from "lucide-react";

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

type DossierPainSignal = {
    type: string;
    severity: number;
    evidence: string;
    source?: string;
};

type DossierWebsiteAssessment = {
    speedRisk: number;
    conversionRisk: number;
    trustRisk: number;
    seoRisk: number;
    overallGrade: string;
    topFixes: string[];
};

type ScoreBreakdown = Record<string, string | number | boolean | null>;

function parseJSON<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
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
        let cancelled = false;

        async function loadLead() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/leads/${leadId}`);
                if (!response.ok) {
                    throw new Error(response.status === 404 ? "Lead not found" : "Failed to load");
                }
                const data = (await response.json()) as LeadData;
                if (cancelled) return;
                setLead(data);
                const override = getArchiveOverride(data.id);
                setArchived(override !== null ? override : data.isArchived);
                setArchiveSyncPending(override !== null && override !== data.isArchived);
                setInCallList(isInCallList(data.id));
            } catch (error) {
                if (!cancelled) setError(error instanceof Error ? error.message : "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadLead();
        return () => {
            cancelled = true;
        };
    }, [leadId]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
            if (isInput) return;

            if (e.key === "n" || e.key === "N") {
                e.preventDefault();
                document.getElementById("dossier-note-input")?.focus();
            }
            if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (lead?.callOpener) {
                    navigator.clipboard.writeText(lead.callOpener)
                        .then(() => toast("Copied opener", { icon: "copy" }))
                        .catch(() => { });
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

    // Loading state
    if (loading) {
        return (
            <div className="max-w-[1440px] mx-auto">
                <div className="mb-6">
                    <div className="h-8 w-48 bg-white/[0.04] rounded animate-pulse" />
                </div>
                <DossierSkeleton />
            </div>
        );
    }

    // Error state
    if (error || !lead) {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => router.push("/vault")}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors mb-8"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Vault
                </button>
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-4">
                        <AlertTriangle className="w-7 h-7 text-red-400/60" />
                    </div>
                    <h2 className="text-lg font-bold text-white mb-1">Lead Not Found</h2>
                    <p className="text-sm text-muted-foreground">{error || "This lead does not exist or has been deleted."}</p>
                </div>
            </div>
        );
    }

    // Parse JSON fields
    const painSignals = parseJSON<DossierPainSignal[]>(lead.painSignals, []);
    const assessment = parseJSON<DossierWebsiteAssessment | null>(lead.axiomWebsiteAssessment, null);
    const scoreBreakdown = parseJSON<ScoreBreakdown | null>(lead.scoreBreakdown, null);
    const disqualifiers = parseJSON<string[]>(lead.disqualifiers, []);
    const disposition = getLeadDisposition(lead.id);
    const dispOpt = disposition ? DISPOSITION_OPTIONS.find(o => o.value === disposition.type) : null;
    const tierConfig = getTierConfig(lead.axiomTier);
    const dispositionClass =
        dispOpt?.color === "red"
            ? "border-red-400/20 bg-red-500/10 text-red-300"
            : dispOpt?.color === "amber"
                ? "border-amber-400/20 bg-amber-500/10 text-amber-300"
                : dispOpt?.color === "orange"
                    ? "border-orange-400/20 bg-orange-500/10 text-orange-300"
                    : dispOpt?.color === "emerald"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                        : dispOpt?.color === "cyan"
                            ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-300"
                            : "border-white/10 bg-white/[0.04] text-zinc-300";

    return (
        <div className="max-w-[1440px] mx-auto animate-slide-up">
            {/* Header */}
            <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/vault")}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Vault
                    </button>
                    <div className="h-4 w-px bg-white/[0.08]" />
                    <h1 className="text-xl font-semibold text-white flex items-center gap-3">
                        <FileText className={cn("w-5 h-5", tierConfig.text)} />
                        Lead Dossier
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    {dispOpt && (
                        <span className={cn(
                            "text-[10px] font-mono px-2 py-0.5 rounded-md border",
                            dispositionClass
                        )}>
                            {dispOpt.icon} {dispOpt.label}
                        </span>
                    )}
                    {lead.lastUpdated && (
                        <span className="text-[10px] font-mono text-muted-foreground/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(lead.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                    )}
                </div>
            </div>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-5">
                {/* ═══ LEFT SIDEBAR ═══ */}
                <div className="space-y-4">
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

                    {/* Score Breakdown */}
                    {scoreBreakdown && (
                        <div className="glass-ultra rounded-xl p-4">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-semibold mb-3">
                                Score Breakdown
                            </div>
                            <div className="space-y-2">
                                {Object.entries(scoreBreakdown).map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between text-xs">
                                        <span className="text-zinc-400 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                                        <span className="font-mono font-bold text-white">{String(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ═══ CENTER (Evidence) ═══ */}
                <div className="space-y-5">
                    <PainSignalsPanel painSignals={painSignals} />
                    <WebsiteAssessmentPanel assessment={assessment} />
                    <DisqualifiersPanel
                        disqualifiers={disqualifiers}
                        disqualifyReason={lead.disqualifyReason}
                    />

                    {/* Bottom: Operational History */}
                    <OperationalHistory leadId={lead.id} />
                </div>

                {/* ═══ RIGHT SIDEBAR (Call Sheet) ═══ */}
                <div>
                    <CallSheet
                        callOpener={lead.callOpener}
                        followUpQuestion={lead.followUpQuestion}
                        painSignals={painSignals}
                    />
                </div>
            </div>
        </div>
    );
}
