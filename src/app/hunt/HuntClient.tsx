"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ToastProvider, useToast } from "@/components/ui/toast-provider"
import {
    Target, Radar, MapPin, Layers, ArrowDown, Zap, Database, Mail, Clock,
    Plus, Trash2, Play, RotateCcw, CheckCircle2, XCircle, TrendingUp, SkipForward,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { OpsHud } from "@/components/hunt/ops-hud"
import { QueueSummary, type QueueItem } from "@/components/hunt/queue-summary"
import { IssuesPanel } from "@/components/hunt/issues-panel"
import { RemoteJobsCard } from "@/components/hunt/remote-jobs-card"
import { TerminalPanel } from "@/components/hunt/terminal-panel"
import { WorkerHealthCard, type WorkerHealth } from "@/components/hunt/worker-health-card"
import { useHuntStore } from "@/lib/hunt/hunt-store"

const NICHE_PRESETS = ["Roofers", "Concrete", "Med-Spas", "Landscaping", "Plumbing", "HVAC", "Electricians", "Auto Detailing", "Commercial Cleaning", "Custom Cabinetry"]
const CITY_PRESETS = ["Kitchener", "Waterloo", "Cambridge", "Guelph", "Hamilton", "London"]
const SCAN_PRESETS = [
    {
        label: "Quick Scan",
        radius: "5",
        depth: "1",
        description: "Fastest pass when you want signal before breadth.",
    },
    {
        label: "Standard Scan",
        radius: "10",
        depth: "2",
        description: "Balanced default for most local campaigns.",
    },
    {
        label: "Deep Scan",
        radius: "15",
        depth: "4",
        description: "Broader sweep for denser markets or tougher niches.",
    },
]

function getJobStatusBadgeClass(status: QueueItem["status"]) {
    switch (status) {
        case "completed":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
        case "claimed":
            return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
        case "running":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
        case "failed":
            return "border-red-500/20 bg-red-500/10 text-red-300";
        case "canceled":
            return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
        case "pending":
        default:
            return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    }
}

function HuntInner() {
    const { toast } = useToast()

    // ═══ QUEUE BUILDER LOCAL STATE ═══
    const [niche, setNiche] = useState("")
    const [city, setCity] = useState("")
    const [radius, setRadius] = useState("10")
    const [maxDepth, setMaxDepth] = useState("5")
    const [cancelConfirm, setCancelConfirm] = useState(false)
    const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null)
    const [remoteJobsRefreshKey, setRemoteJobsRefreshKey] = useState(0)

    // ═══ GLOBAL STORE STATE ═══
    const store = useHuntStore()

    // ═══ QUEUE MANAGEMENT ═══
    const handleAddToQueue = () => {
        if (!niche || !city) return
        store.addToQueue(niche, city, radius, maxDepth)
        setNiche("")
        setCity("")
        setRemoteJobsRefreshKey((value) => value + 1)
    }

    const applyScanPreset = useCallback((preset: typeof SCAN_PRESETS[number]) => {
        setRadius(preset.radius)
        setMaxDepth(preset.depth)
    }, [])

    const retryQueuedJob = useCallback(async (jobId: string, mode: "retry" | "requeue" = "retry") => {
        const target = store.queue.find((item) => item.jobId === jobId);
        if (!target) {
            toast("Job not found in queue", { type: "error" });
            return;
        }

        const response = await fetch(`/api/scrape/jobs/${jobId}/retry`, {
            method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; job?: { id?: string; status?: string } };

        if (!response.ok) {
            throw new Error(data.error || "Failed to retry job.");
        }

        useHuntStore.setState((prev) => ({
            queue: prev.queue.map((item) =>
                item.jobId === jobId
                    ? {
                          ...item,
                          jobId: data.job?.id || jobId,
                          status: "pending",
                          stats: undefined,
                      }
                    : item,
            ),
        }));

        toast(mode === "retry" ? "Job retried" : "Job requeued", { type: "info" });
        setRemoteJobsRefreshKey((value) => value + 1);
    }, [toast, store.queue]);

    const retryJob = useCallback((jobContext: string) => {
        const [niche, city] = jobContext.split(" in ");
        if (!niche || !city) {
            return;
        }

        const matches = store.queue.filter((item) => {
            const contextMatches = item.niche.trim() === niche.trim() && item.city.trim() === city.trim();
            if (!contextMatches || !item.jobId) return false;
            if (item.status === "failed" || item.status === "canceled") return true;
            if ((item.status === "claimed" || item.status === "running") && workerHealth?.claimedJobId === item.jobId && !workerHealth.online) {
                return true;
            }
            return false;
        });

        const target = matches[matches.length - 1];
        if (!target?.jobId) {
            toast(`No retryable job found for ${niche.trim()} in ${city.trim()}`, { type: "error" });
            return;
        }

        void retryQueuedJob(target.jobId, target.status === "failed" ? "retry" : "requeue").catch((error) => {
            toast(error instanceof Error ? error.message : "Failed to retry job", { type: "error" });
        });
    }, [retryQueuedJob, store.queue, toast, workerHealth]);

    const requeueJob = useCallback((job: QueueItem) => {
        if (!job.jobId) return;

        void retryQueuedJob(job.jobId, job.status === "failed" ? "retry" : "requeue").catch((error) => {
            toast(error instanceof Error ? error.message : "Failed to requeue job", { type: "error" });
        });
    }, [retryQueuedJob, toast]);

    const dismissError = useCallback((errorId: string) => {
        useHuntStore.setState(prev => ({
            session: {
                ...prev.session,
                errors: prev.session.errors.map(e => e.id === errorId ? { ...e, resolved: true } : e)
            }
        }))
    }, [])

    const handleCancelClick = useCallback(() => {
        if (!cancelConfirm) {
            setCancelConfirm(true)
            toast("Press Cancel again to confirm", { type: "info" })
            setTimeout(() => setCancelConfirm(false), 3000)
            return
        }
        setCancelConfirm(false)
        store.handleCancel()
        toast("🛑 Canceled — SSE closed", { type: "error" })
    }, [cancelConfirm, store, toast])

    // ═══ KEYBOARD SHORTCUTS ═══
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
            if (isInput) return

            const paletteOpen = document.querySelector("[data-command-palette]")
            if (paletteOpen) return

            if (e.key === " " && store.loading) {
                e.preventDefault()
                if (store.isPaused) store.handleResume()
                else store.handlePause()
            }
            if (e.key === "Escape" && store.loading) {
                e.preventDefault()
                handleCancelClick()
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [store, handleCancelClick])

    // ═══ DERIVED STATE ═══
    const pendingCount = store.queue.filter(q => q.status === "pending").length
    const builderReady = niche.trim().length > 0 && city.trim().length > 0

    // Compute avg job duration from done jobs roughly
    const avgJobDuration = 35; // placeholder or computed from logs
    const activeScanPreset = SCAN_PRESETS.find(
        (preset) => preset.radius === radius && preset.depth === maxDepth,
    )?.label ?? null;

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0")
        const s = (secs % 60).toString().padStart(2, "0")
        return `${m}:${s}`
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Hero Banner */}
            <div className="animate-slide-up">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight">
                            <span className="gradient-text">The Hunt</span>
                        </h1>
                        <p className="text-muted-foreground mt-2 text-sm max-w-xl">
                            Build multi-target extraction queues, deep-mine prospects with AI intelligence, and auto-score every lead.
                        </p>
                    </div>
                </div>
            </div>

            <WorkerHealthCard onHealthChange={setWorkerHealth} />
            <RemoteJobsCard key={remoteJobsRefreshKey} />

            {/* OPS HUD (always visible when queue exists) */}
            {(store.loading || store.session.status === "completed" || store.session.status === "canceled" || store.queue.length > 0) && (
                <OpsHud
                    status={store.session.status}
                    stage={store.session.stage}
                    counters={store.session.counters}
                    currentJob={store.session.currentJob}
                    lastEvent={store.session.lastEvent}
                    elapsed={store.elapsed}
                    onPause={store.handlePause}
                    onResume={store.handleResume}
                    onCancel={store.handleCancel}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left Column — Controls + Queue */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Parameter Input Card */}
                    <Card className="glass-ultra rounded-xl overflow-hidden holo-card animate-slide-up">
                        <div className="h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 animate-gradient" />
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Target className="w-4.5 h-4.5 text-emerald-400" />
                                        Queue Builder
                                    </CardTitle>
                                    <CardDescription className="text-[11px]">
                                        Pick a niche, anchor a city, then choose how wide and deep the sweep should run.
                                    </CardDescription>
                                </div>
                                <div className="hidden sm:flex flex-col items-end text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-600">
                                    <span>{store.loading ? "Queue locked" : "Standby"}</span>
                                    <span className="mt-1 normal-case tracking-normal text-zinc-500">
                                        {store.queue.length} queued
                                    </span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                            <Target className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-600">Target lane</div>
                                            <div className="text-sm text-white/90">Build sequential targets before you launch the run.</div>
                                        </div>
                                    </div>
                                    <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Queue</span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Preset</span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Launch</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="niche" className="text-[11px] font-semibold flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                                    Niche / Profession
                                </Label>
                                <Input
                                    id="niche"
                                    placeholder="Roofers, med spas, landscapers..."
                                    value={niche}
                                    onChange={(e) => setNiche(e.target.value)}
                                    className="bg-black/30 border-white/10 focus:border-emerald-500/50 transition-all text-sm"
                                    disabled={store.loading}
                                />
                                <p className="text-[10px] text-zinc-600">Choose the market segment you want to mine.</p>
                                <div className="flex flex-wrap gap-2">
                                    {NICHE_PRESETS.map((n) => {
                                        const isActive = niche === n
                                        return (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setNiche(n)}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-medium transition-all duration-200 hover:-translate-y-0.5",
                                                    isActive
                                                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]"
                                                        : "border-white/10 bg-black/20 text-zinc-400 hover:border-emerald-400/30 hover:bg-white/[0.04] hover:text-white",
                                                )}
                                                disabled={store.loading}
                                            >
                                                {n}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="city" className="text-[11px] font-semibold flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                                    Target City
                                </Label>
                                <Input
                                    id="city"
                                    placeholder="Hamilton, Guelph, London..."
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    className="bg-black/30 border-white/10 focus:border-cyan-500/50 transition-all text-sm"
                                    disabled={store.loading}
                                />
                                <p className="text-[10px] text-zinc-600">Use the city center; the radius handles the spread.</p>
                                <div className="flex flex-wrap gap-2">
                                    {CITY_PRESETS.map((c) => {
                                        const isActive = city === c
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setCity(c)}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-medium transition-all duration-200 hover:-translate-y-0.5",
                                                    isActive
                                                        ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                                                        : "border-white/10 bg-black/20 text-zinc-400 hover:border-cyan-400/30 hover:bg-white/[0.04] hover:text-white",
                                                )}
                                                disabled={store.loading}
                                            >
                                                {c}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold flex items-center gap-1.5">
                                    <Radar className="w-3.5 h-3.5 text-purple-400" />
                                    Scan Preset
                                </Label>
                                <p className="text-[10px] text-zinc-600">Presets tune radius and depth together; you can still edit both fields.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {SCAN_PRESETS.map((preset) => {
                                        const isActive = activeScanPreset === preset.label
                                        const isRecommended = preset.label === "Standard Scan"
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => applyScanPreset(preset)}
                                                className={cn(
                                                    "group rounded-xl border px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5",
                                                    isActive
                                                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]"
                                                        : "border-white/10 bg-black/20 text-zinc-400 hover:border-cyan-400/30 hover:bg-white/[0.04] hover:text-white",
                                                )}
                                                disabled={store.loading}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="text-xs font-semibold">{preset.label}</div>
                                                    {isRecommended && (
                                                        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-cyan-300">
                                                            Recommended
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 text-[10px] leading-5 text-zinc-500">
                                                    {preset.description}
                                                </div>
                                                <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wider opacity-80">
                                                    R {preset.radius} km | D {preset.depth}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="text-[10px] text-zinc-600 font-mono">
                                    {activeScanPreset ? `Preset active: ${activeScanPreset}` : "Manual values in use"}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label htmlFor="radius" className="text-[11px] font-semibold flex items-center gap-1.5">
                                            <Radar className="w-3.5 h-3.5 text-amber-400" />
                                            Radius (km)
                                        </Label>
                                        <span className="text-[10px] text-zinc-600">Coverage window</span>
                                    </div>
                                    <Input
                                        id="radius"
                                        type="number"
                                        value={radius}
                                        onChange={(e) => setRadius(e.target.value)}
                                        className="bg-black/30 border-white/10 text-sm"
                                        disabled={store.loading}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label htmlFor="maxDepth" className="text-[11px] font-semibold flex items-center gap-1.5">
                                            <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
                                            Scroll Depth
                                        </Label>
                                        <span className="text-[10px] text-zinc-600">How far to inspect</span>
                                    </div>
                                    <Input
                                        id="maxDepth"
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={maxDepth}
                                        onChange={(e) => setMaxDepth(e.target.value)}
                                        className="bg-black/30 border-white/10 text-sm"
                                        disabled={store.loading}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-3 border-t border-white/[0.04] bg-black/20 px-6 py-4">
                            <div className="flex w-full items-center justify-between gap-3 text-[10px] text-zinc-500">
                                <span>{builderReady ? "Target ready to queue." : "Fill niche and city to arm the next target."}</span>
                                <span>{store.loading ? "Queue locked during active run." : "Targets launch in order."}</span>
                            </div>
                            <Button
                                type="button"
                                onClick={handleAddToQueue}
                                className={cn(
                                    "w-full font-semibold tracking-wide transition-all duration-300 btn-glow",
                                    builderReady && !store.loading
                                        ? "bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:via-cyan-500 hover:to-emerald-500"
                                        : "bg-emerald-950/50 text-emerald-300/50 cursor-not-allowed",
                                )}
                                disabled={store.loading || !builderReady}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add to Queue
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Queue Display */}
                    <Card className="glass-ultra rounded-xl overflow-hidden animate-slide-up">
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-amber-400" />
                                        Extraction Queue
                                    </CardTitle>
                                    <CardDescription className="text-[11px]">
                                        Queue targets run top to bottom. Failed or stale jobs can be requeued inline.
                                    </CardDescription>
                                </div>
                                <QueueSummary queue={store.queue} avgJobDuration={avgJobDuration} />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {store.queue.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                            <Zap className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-white/90">Queue is empty</div>
                                            <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                                                Build a target above, then launch when you are ready. Runs stay sequential and can be requeued inline.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                        {["Sequential", "Scored", "Retryable"].map((label) => (
                                            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : store.queue.map((item) => (
                                    <div
                                        key={item.id}
                                        className="queue-card glass rounded-lg p-3 flex items-center gap-3 animate-scale-in relative overflow-hidden"
                                        data-status={item.status}
                                    >
                                        {/* Running stripe animation */}
                                        {item.status === "running" && (
                                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500 animate-gradient bg-[length:200%_200%]" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-white/90">{item.niche}</span>
                                                <span className="text-[10px] text-muted-foreground">|</span>
                                                <span className="text-xs text-cyan-400">{item.city}</span>
                                            </div>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">
                                                R:{item.radius}km | D:{item.maxDepth}
                                                {item.stats && ` | ${item.stats.leadsFound} leads, ${item.stats.withEmail} emails`}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className={`h-5 px-2 text-[9px] font-mono uppercase tracking-wider ${getJobStatusBadgeClass(item.status)}`}
                                                >
                                                    {item.status}
                                                </Badge>
                                                {item.jobId && (
                                                    <span className="text-[9px] font-mono text-zinc-600">
                                                        job #{item.jobId.slice(0, 8)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {item.status === "pending" && <Clock className="w-3.5 h-3.5 text-amber-400" />}
                                            {item.status === "claimed" && <Radar className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />}
                                            {item.status === "running" && <Radar className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />}
                                            {item.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                            {item.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                            {item.status === "canceled" && <XCircle className="w-3.5 h-3.5 text-zinc-500" />}
                                            {item.status === "failed" && item.jobId && (
                                                <button
                                                    onClick={() => requeueJob(item)}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/5 text-[9px] font-mono uppercase tracking-wider text-amber-300 hover:bg-amber-500/10 transition-colors"
                                                    title="Retry failed job"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Retry
                                                </button>
                                            )}
                                            {item.status === "canceled" && item.jobId && (
                                                <button
                                                    onClick={() => requeueJob(item)}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-500/20 bg-cyan-500/5 text-[9px] font-mono uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                                                    title="Requeue canceled job"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Requeue
                                                </button>
                                            )}
                                            {(item.status === "claimed" || item.status === "running") && item.jobId && workerHealth?.claimedJobId === item.jobId && !workerHealth.online && (
                                                <button
                                                    onClick={() => requeueJob(item)}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/20 bg-rose-500/5 text-[9px] font-mono uppercase tracking-wider text-rose-300 hover:bg-rose-500/10 transition-colors"
                                                    title="Requeue stale job"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Requeue stale
                                                </button>
                                            )}
                                            {item.status === "pending" && !store.loading && (
                                                <button onClick={() => store.removeFromQueue(item.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {item.status === "pending" && store.loading && (
                                                <button onClick={() => store.skipJob(item.id)} className="text-zinc-600 hover:text-amber-400 transition-colors" title="Skip">
                                                    <SkipForward className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-3 border-t border-white/[0.04] bg-black/20 px-6 py-4">
                            <div className="flex w-full items-center justify-between gap-3 text-[10px] text-zinc-500">
                                <span>
                                    {store.loading
                                        ? "Queue is locked while a run is active."
                                        : pendingCount > 0
                                            ? `${pendingCount} targets ready to launch.`
                                            : "Add at least one target to launch."}
                                </span>
                                <span>Sequential execution</span>
                            </div>
                            <Button
                                onClick={store.runQueue}
                                size="lg"
                                className={cn(
                                    "w-full font-bold text-sm tracking-wide transition-all duration-300 btn-glow",
                                    store.loading || pendingCount === 0
                                        ? "bg-emerald-950/50 text-emerald-400/60 cursor-not-allowed"
                                        : "bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 hover:from-emerald-500 hover:via-cyan-500 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 animate-gradient bg-[length:200%_200%]",
                                )}
                                disabled={store.loading || pendingCount === 0}
                            >
                                {store.loading ? (
                                    <span className="flex items-center gap-2">
                                        <Radar className="w-4 h-4 animate-pulse" />
                                        Processing Queue...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Play className="w-4 h-4" />
                                        Launch Queue ({pendingCount} {pendingCount === 1 ? "target" : "targets"})
                                    </span>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Issues Panel */}
                    <IssuesPanel
                        errors={store.session.errors}
                        onRetryJob={retryJob}
                        onDismiss={dismissError}
                    />
                </div>

                {/* Right Column — Terminal */}
                <div className="lg:col-span-3 space-y-4 animate-slide-up" style={{ animationDelay: "150ms" }}>
                    {/* Terminal Panel */}
                    <TerminalPanel
                        logs={store.logs}
                        onTogglePin={store.togglePin}
                        loading={store.loading}
                    />

                    {/* Completion Footer */}
                    {!store.loading && store.session.status === "completed" && (
                        <Card className="glass-ultra rounded-xl overflow-hidden border-emerald-500/10 animate-slide-up">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-emerald-400 font-bold text-base flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Hunt Complete 🎉
                                    </h4>
                                    <div className="flex items-center gap-4 text-xs font-mono">
                                        <span className="text-emerald-400/80 flex items-center gap-1">
                                            <Database className="w-3 h-3" /> {store.totalStats.leadsFound} leads
                                        </span>
                                        <span className="text-cyan-400/80 flex items-center gap-1">
                                            <Mail className="w-3 h-3" /> {store.totalStats.withEmail} emails
                                        </span>
                                        <span className="text-amber-400/80 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {formatTime(store.elapsed)}
                                        </span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-emerald-800 text-emerald-400 hover:bg-emerald-900/50 transition-all btn-glow"
                                        onClick={() => window.location.href = '/vault'}
                                    >
                                        <Database className="w-3.5 h-3.5 mr-1.5" />
                                        Open Vault
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-amber-800 text-amber-400 hover:bg-amber-900/50 transition-all btn-glow"
                                        onClick={() => window.location.href = '/triage'}
                                    >
                                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                                        Go Triage
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-cyan-800 text-cyan-400 hover:bg-cyan-900/50 transition-all btn-glow"
                                        onClick={() => window.location.href = `/api/leads/export?tier=S,A,B&format=xlsx`}
                                    >
                                        <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                                        Export S/A/B (XLSX)
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-zinc-800 text-zinc-400 hover:bg-zinc-900/50 transition-all"
                                        onClick={() => window.location.href = `/api/leads/export?tier=S,A,B&format=csv`}
                                    >
                                        <TrendingUp className="w-3.5 h-3.5 mr-1.5 opacity-50" />
                                        Export S/A/B (CSV)
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function HuntClient() {
    return (
        <ToastProvider>
            <HuntInner />
        </ToastProvider>
    )
}
