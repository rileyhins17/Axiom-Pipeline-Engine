"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ToastProvider, useToast } from "@/components/ui/toast-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getTriageFilters, setTriageFilters, DEFAULT_FILTERS,
    getTriageIndex, setTriageIndex,
    getTriageHistory, pushTriageHistory, popTriageHistory,
    getTriageStats,
    addToFollowUp, removeFromFollowUp,
    addTriageArchived, removeTriageArchived, isTriageArchived,
    resetTriageSession,
    type TriageFilters, type TriageAction,
} from "@/lib/ui/triage-store";
import { addToCallList, removeFromCallList } from "@/lib/ui/storage";
import { TriageFilterBar } from "@/components/triage/triage-filter-bar";
import { TriageCard, type TriageLead } from "@/components/triage/triage-card";
import { ActionDock } from "@/components/triage/action-dock";
import { CallListDrawer, type CallListEntry } from "@/components/triage/call-list-drawer";
import { Zap, Target, Crosshair } from "lucide-react";

function TriageInner() {
    const router = useRouter();
    const { toast } = useToast();

    const [filters, setFilters] = useState<TriageFilters>(() => getTriageFilters());
    const [leads, setLeads] = useState<TriageLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(() => getTriageIndex());
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [stats, setStats] = useState(() => getTriageStats());
    const [actionFlash, setActionFlash] = useState<string | null>(null);

    // Fetch leads when filters change
    useEffect(() => {
        let cancelled = false;

        async function loadLeads() {
            setLoading(true);
            const params = new URLSearchParams();
            if (filters.tiers.length > 0) params.set("tier", filters.tiers.join(","));
            if (filters.noWebsite) params.set("noWebsite", "1");
            if (filters.hasEmail) params.set("hasEmail", "1");
            if (filters.hasPhone) params.set("hasPhone", "1");
            if (filters.minRating > 0) params.set("minRating", String(filters.minRating));
            if (filters.city) params.set("city", filters.city);
            if (filters.niche) params.set("niche", filters.niche);
            params.set("sort", "score");

            try {
                const response = await fetch(`/api/leads/triage?${params}`);
                const data = await response.json();
                if (cancelled) return;
                const filtered = (data.leads || []).filter(
                    (lead: TriageLead) => !isTriageArchived(lead.id),
                );
                setLeads(filtered);
                const idx = getTriageIndex();
                setCurrentIndex(Math.min(idx, Math.max(0, filtered.length - 1)));
            } catch {
                if (!cancelled) setLeads([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadLeads();
        return () => {
            cancelled = true;
        };
    }, [filters]);

    const currentLead = leads[currentIndex] || null;
    const remaining = leads.length - currentIndex;
    const canUndo = getTriageHistory().length > 0;

    const handleFiltersChange = useCallback((f: TriageFilters) => {
        setFilters(f);
        setTriageFilters(f);
        setCurrentIndex(0);
        setTriageIndex(0);
    }, []);

    const advanceToNext = useCallback(() => {
        const next = Math.min(currentIndex + 1, leads.length);
        setCurrentIndex(next);
        setTriageIndex(next);
        setStats(getTriageStats());
    }, [currentIndex, leads.length]);

    const flashAction = useCallback((color: string) => {
        setActionFlash(color);
        setTimeout(() => setActionFlash(null), 400);
    }, []);

    const handleAction = useCallback((action: TriageAction) => {
        if (!currentLead) return;

        // Push to undo stack
        pushTriageHistory({
            leadId: currentLead.id,
            action,
            timestamp: new Date().toISOString(),
            previousIndex: currentIndex,
        });

        switch (action) {
            case "keep":
                addToCallList(currentLead.id);
                toast("Kept - added to call list", { type: "success" });
                flashAction("emerald");
                break;
            case "archive":
                addTriageArchived(currentLead.id);
                toast("Archived", { type: "info" });
                flashAction("red");
                // Remove from current leads list
                setLeads(prev => prev.filter(l => l.id !== currentLead.id));
                setStats(getTriageStats());
                // Don't advance index since the array shifted
                setTriageIndex(currentIndex);
                return;
            case "call_now":
                if (currentLead.phone) {
                    window.open(`tel:${currentLead.phone}`, "_self");
                }
                toast("Call initiated", { type: "success" });
                flashAction("cyan");
                break;
            case "follow_up":
                addToFollowUp(currentLead.id);
                toast("Added to follow-up", { type: "info" });
                flashAction("amber");
                break;
        }

        advanceToNext();
    }, [currentLead, currentIndex, advanceToNext, toast, flashAction]);

    const handleUndo = useCallback(() => {
        const entry = popTriageHistory();
        if (!entry) return;

        // Revert the action
        switch (entry.action) {
            case "keep":
                removeFromCallList(entry.leadId);
                break;
            case "archive":
                removeTriageArchived(entry.leadId);
                // Re-fetch needed since we removed from array
                break;
            case "follow_up":
                removeFromFollowUp(entry.leadId);
                break;
        }

        setCurrentIndex(entry.previousIndex);
        setTriageIndex(entry.previousIndex);
        setStats(getTriageStats());
        toast("Undone", { type: "info" });

        // If archived, we need to refresh the list
        if (entry.action === "archive") {
            // Trigger re-fetch by spreading filters
            setFilters(prev => ({ ...prev }));
        }
    }, [toast]);

    const handleOpenDossier = useCallback(() => {
        if (currentLead) router.push(`/lead/${currentLead.id}`);
    }, [currentLead, router]);

    const handlePrev = useCallback(() => {
        if (currentIndex > 0) {
            const prev = currentIndex - 1;
            setCurrentIndex(prev);
            setTriageIndex(prev);
        }
    }, [currentIndex]);

    const handleNext = useCallback(() => {
        if (currentIndex < leads.length - 1) {
            const next = currentIndex + 1;
            setCurrentIndex(next);
            setTriageIndex(next);
        }
    }, [currentIndex, leads.length]);

    const handleResetSession = useCallback(() => {
        resetTriageSession();
        setCurrentIndex(0);
        setStats({ kept: 0, archived: 0, followUp: 0, called: 0, total: 0 });
        toast("Session reset", { type: "info" });
    }, [toast]);

    const handleOutreachSaved = useCallback((updatedLead: TriageLead) => {
        setLeads(prev => prev.map(lead => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead));
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
            if (isInput) return;

            // Check for open modals (command palette, drawer, etc.)
            const paletteOpen = document.querySelector("[data-command-palette]");
            if (paletteOpen) return;
            if (drawerOpen || helpOpen) return;

            switch (e.key) {
                case "1": e.preventDefault(); handleAction("keep"); break;
                case "2": e.preventDefault(); handleAction("archive"); break;
                case "3": e.preventDefault(); handleAction("call_now"); break;
                case "4": e.preventDefault(); handleAction("follow_up"); break;
                case "j": case "ArrowRight": e.preventDefault(); handleNext(); break;
                case "k": case "ArrowLeft": e.preventDefault(); handlePrev(); break;
                case "Enter": e.preventDefault(); handleOpenDossier(); break;
                case "z": case "Z":
                    if (!e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        handleUndo();
                    }
                    break;
                case "Escape":
                    if (helpOpen) setHelpOpen(false);
                    break;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [drawerOpen, helpOpen, handleAction, handleNext, handlePrev, handleOpenDossier, handleUndo]);

    // Call list entries from current leads
    const callListEntries: CallListEntry[] = useMemo(() =>
        leads.map(l => ({
            id: l.id,
            businessName: l.businessName,
            niche: l.niche,
            city: l.city,
            phone: l.phone,
            email: l.email,
            axiomTier: l.axiomTier,
            axiomScore: l.axiomScore,
        })),
        [leads]);

    return (
        <div className="mx-auto flex min-h-[calc(100dvh-80px)] max-w-[1200px] flex-col gap-4 pb-4 md:h-[calc(100vh-80px)] md:pb-0">
            <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            Speed review
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold text-white">Triage</h1>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Review one lead at a time, keep the good ones, archive weak fits, call immediately, or mark follow-up.
                        </p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                            <div className="font-mono text-emerald-300">{stats.kept}</div>
                            <div className="mt-1 text-muted-foreground">Kept</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                            <div className="font-mono text-red-300">{stats.archived}</div>
                            <div className="mt-1 text-muted-foreground">Archived</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                            <div className="font-mono text-cyan-300">{stats.called}</div>
                            <div className="mt-1 text-muted-foreground">Called</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                            <div className="font-mono text-amber-300">{Math.max(0, remaining)}</div>
                            <div className="mt-1 text-muted-foreground">Left</div>
                        </div>
                    </div>
                </div>
            </section>
            {/* Filter bar */}
            <TriageFilterBar
                filters={filters}
                onFiltersChange={handleFiltersChange}
                stats={{
                    remaining: Math.max(0, remaining),
                    kept: stats.kept,
                    archived: stats.archived,
                    followUp: stats.followUp,
                    called: stats.called,
                }}
                onOpenCallList={() => setDrawerOpen(true)}
                onResetSession={handleResetSession}
                onOpenHelp={() => setHelpOpen(true)}
            />

            {/* Main card area */}
            <div className="relative flex flex-1 min-h-0 flex-col items-start justify-start md:items-center md:justify-center">
                {/* Action flash overlay */}
                {actionFlash && (
                    <div className={cn(
                        "absolute inset-0 rounded-2xl pointer-events-none z-10 animate-pulse",
                        actionFlash === "emerald" && "ring-2 ring-emerald-400/30",
                        actionFlash === "red" && "ring-2 ring-red-400/30",
                        actionFlash === "cyan" && "ring-2 ring-cyan-400/30",
                        actionFlash === "amber" && "ring-2 ring-amber-400/30",
                    )} />
                )}

                {loading ? (
                    <div className="w-full glass-ultra rounded-2xl p-8 space-y-4 animate-slide-up">
                        <Skeleton className="h-8 w-3/4 bg-white/[0.06]" />
                        <Skeleton className="h-4 w-1/2 bg-white/[0.04]" />
                        <div className="flex gap-4 mt-4">
                            <Skeleton className="h-12 w-1/2 rounded-xl bg-white/[0.04]" />
                            <Skeleton className="h-12 w-1/2 rounded-xl bg-white/[0.04]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <Skeleton className="h-32 rounded-xl bg-white/[0.04]" />
                            <Skeleton className="h-32 rounded-xl bg-white/[0.04]" />
                        </div>
                    </div>
                ) : leads.length === 0 ? (
                    /* Empty state */
                    <div className="flex flex-col items-center justify-center text-center py-16">
                        <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-4">
                            <Target className="w-7 h-7 text-zinc-600" />
                        </div>
                        <h2 className="text-lg font-bold text-white mb-1">No Leads Match</h2>
                        <p className="text-sm text-muted-foreground mb-4">Adjust your filters or run a new extraction.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleFiltersChange(DEFAULT_FILTERS)}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/[0.08] text-zinc-300 hover:text-white transition-all"
                            >
                                Reset Filters
                            </button>
                            <button
                                onClick={() => router.push("/hunt")}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all"
                            >
                                Go Hunt
                            </button>
                        </div>
                    </div>
                ) : currentIndex >= leads.length ? (
                    /* All done */
                    <div className="flex flex-col items-center justify-center text-center py-16 animate-slide-up">
                        <div className="w-16 h-16 rounded-2xl glass-strong flex items-center justify-center mb-4">
                            <Zap className="w-7 h-7 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white mb-1">All Done!</h2>
                        <p className="text-sm text-muted-foreground mb-2">
                            You&apos;ve processed all {leads.length} leads in this batch.
                        </p>
                        <div className="flex gap-4 text-xs font-mono mt-2">
                            <span className="text-emerald-400">{stats.kept} kept</span>
                            <span className="text-red-400/70">{stats.archived} archived</span>
                            <span className="text-cyan-400">{stats.called} called</span>
                            <span className="text-amber-400">{stats.followUp} follow-up</span>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setDrawerOpen(true)}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all"
                            >
                                Open Call List
                            </button>
                            <button
                                onClick={handleResetSession}
                                className="px-4 py-2 rounded-lg text-xs font-medium border border-white/[0.08] text-zinc-300 hover:text-white transition-all"
                            >
                                Start Over
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Lead card */
                    <div className="w-full animate-slide-up" key={currentLead?.id}>
                        {currentLead && <TriageCard lead={currentLead} onOutreachSaved={handleOutreachSaved} />}
                    </div>
                )}
            </div>

            {/* Action dock */}
            <ActionDock
                onAction={handleAction}
                onOpenDossier={handleOpenDossier}
                onUndo={handleUndo}
                onPrev={handlePrev}
                onNext={handleNext}
                canUndo={canUndo}
                canPrev={currentIndex > 0}
                canNext={currentIndex < leads.length - 1}
                hasPhone={!!currentLead?.phone}
                disabled={loading || !currentLead}
            />

            {/* Call list drawer */}
            <CallListDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                allLeads={callListEntries}
            />

            {/* Help modal */}
            {helpOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setHelpOpen(false)}>
                    <div className="glass-ultra w-[min(92vw,400px)] rounded-2xl border border-white/[0.08] p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Crosshair className="w-4 h-4 text-emerald-400" />
                                Triage Shortcuts
                            </h3>
                            <button onClick={() => setHelpOpen(false)} className="text-zinc-600 hover:text-white transition-colors text-xs">
                                ESC
                            </button>
                        </div>
                        <div className="space-y-2 text-xs">
                            {[
                                ["1", "Keep (add to call list)"],
                                ["2", "Archive"],
                                ["3", "Call Now"],
                                ["4", "Follow Up"],
                                ["J / Right", "Next lead"],
                                ["K / Left", "Previous lead"],
                                ["Enter", "Open dossier"],
                                ["Z", "Undo last action"],
                                ["Esc", "Close modals"],
                            ].map(([key, desc]) => (
                                <div key={key} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                                    <span className="text-zinc-400">{desc}</span>
                                    <kbd className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/30 border border-white/[0.06] text-zinc-300">{key}</kbd>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TriageClient() {
    return (
        <ToastProvider>
            <TriageInner />
        </ToastProvider>
    );
}
