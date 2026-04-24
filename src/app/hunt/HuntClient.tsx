"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Database,
  Layers,
  Mail,
  MapPin,
  Pause,
  Play,
  Radar,
  Sparkles,
  Target,
  TerminalSquare,
  XCircle,
} from "lucide-react";

import { AxiomScoreDial } from "@/components/hunt/axiom-score-dial";
import { IssuesPanel } from "@/components/hunt/issues-panel";
import { RemoteJobsCard } from "@/components/hunt/remote-jobs-card";
import { TerminalPanel } from "@/components/hunt/terminal-panel";
import { WorkerHealthCard, type WorkerHealth } from "@/components/hunt/worker-health-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToastProvider, useToast } from "@/components/ui/toast-provider";
import { useHuntStore } from "@/lib/hunt/hunt-store";
import { cn } from "@/lib/utils";

const NICHE_PRESETS = [
  "Roofers",
  "Concrete",
  "Med-Spas",
  "Landscaping",
  "Plumbing",
  "HVAC",
  "Electricians",
  "Auto Detailing",
  "Commercial Cleaning",
  "Custom Cabinetry",
];

const CITY_PRESETS = ["Kitchener", "Waterloo", "Cambridge", "Guelph", "Hamilton", "London"];

const SCAN_PRESETS = [
  { label: "Quick Scan", radius: "5", depth: "1", description: "Fastest pass when you want signal before breadth." },
  { label: "Standard Scan", radius: "10", depth: "2", description: "Balanced default for most local campaigns." },
  { label: "Deep Scan", radius: "15", depth: "4", description: "Broader sweep for denser markets or tougher niches." },
];

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

type IntakeLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  email: string | null;
  source: string | null;
  createdAt: string | null;
};

function HuntInner({ initialIntakeLeads }: { initialIntakeLeads: IntakeLead[] }) {
  const { toast } = useToast();
  const store = useHuntStore();

  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState("10");
  const [maxDepth, setMaxDepth] = useState("2");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [remoteJobsRefreshKey, setRemoteJobsRefreshKey] = useState(0);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingReplacement, setPendingReplacement] = useState<{
    niche: string;
    city: string;
    radius: string;
    maxDepth: string;
  } | null>(null);
  const [scorePulse, setScorePulse] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [intakeLeads, setIntakeLeads] = useState(initialIntakeLeads);

  useEffect(() => {
    if (!store.scorePulseAt) return;
    setScorePulse(true);
    const timeout = setTimeout(() => setScorePulse(false), 1100);
    return () => clearTimeout(timeout);
  }, [store.scorePulseAt]);

  useEffect(() => {
    const targetScore = store.latestScore?.axiomScore ?? 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const step = () => {
      setAnimatedScore((current) => {
        if (current === targetScore) return current;
        const delta = targetScore - current;
        const next = current + Math.sign(delta) * Math.max(1, Math.ceil(Math.abs(delta) / 5));
        if (next !== targetScore) {
          timeout = setTimeout(step, 28);
        }
        return next;
      });
    };

    step();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [store.latestScore?.axiomScore]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isInput) return;
      if (event.key === " " && store.loading) {
        event.preventDefault();
        if (store.isPaused) store.handleResume();
        else store.handlePause();
      }
      if (event.key === "Escape" && store.loading) {
        event.preventDefault();
        void store.handleCancel();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [store.handleCancel, store.handlePause, store.handleResume, store.isPaused, store.loading]);

  useEffect(() => {
    void store.hydrateActiveRun();
  }, [store.hydrateActiveRun]);

  useEffect(() => {
    setIntakeLeads(initialIntakeLeads);
  }, [initialIntakeLeads]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadWorkerHealth = async () => {
      try {
        const response = await fetch("/api/scrape/worker-health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as { health?: WorkerHealth } | null;
        if (!alive || !response.ok || !data?.health) return;
        setWorkerHealth(data.health);
      } catch (error) {
        if ((error as Error).name === "AbortError" || !alive) return;
      }
    };

    void loadWorkerHealth();
    timer = setInterval(() => void loadWorkerHealth(), 30000);

    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, []);

  const activePreset = SCAN_PRESETS.find((preset) => preset.radius === radius && preset.depth === maxDepth);
  const currentTarget = store.session.currentJob;
  const unresolvedIssues = store.session.errors.filter((error) => !error.resolved).length;
  const builderReady = niche.trim().length > 0 && city.trim().length > 0;

  const runState = useMemo(() => {
    if (store.loading) return scorePulse ? "Scoring" : "Analyzing";
    if (store.session.status === "interrupted") return "Interrupted";
    if (store.session.status === "completed") return "Complete";
    return "Idle";
  }, [scorePulse, store.loading, store.session.status]);

  const scoreBusinessName = store.latestScore?.businessName || "Waiting for first scored lead";
  const scoreTier = store.latestScore?.tier || "-";
  const scoreWebsiteLabel = store.latestScore?.websiteLabel || "Awaiting Website Read";
  const scoreEmailLabel = store.latestScore?.outreachEligible ? "Pipeline Ready" : "No Valid Email";
  const scoreFitLabel = store.latestScore?.fitLabel || "Standby";
  const currentScrapeSite = store.activeWebsiteUrl || "Waiting for website scan";
  const currentScrapeLead = store.activeLeadLabel || scoreBusinessName;

  const launchTarget = useCallback(async () => {
    if (!builderReady) return;
    const nextTarget = { niche: niche.trim(), city: city.trim(), radius, maxDepth };

    if (store.loading) {
      setPendingReplacement(nextTarget);
      setShowReplaceConfirm(true);
      return;
    }

    try {
      await store.launchTarget(nextTarget);
      setRemoteJobsRefreshKey((value) => value + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to launch target", { type: "error" });
    }
  }, [builderReady, city, maxDepth, niche, radius, store, toast]);

  const confirmReplacement = useCallback(async () => {
    if (!pendingReplacement) return;
    try {
      await store.replaceActiveRun(pendingReplacement);
      setShowReplaceConfirm(false);
      setPendingReplacement(null);
      setRemoteJobsRefreshKey((value) => value + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to replace active run", { type: "error" });
    }
  }, [pendingReplacement, store, toast]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="app-shell-surface rounded-[28px] px-6 py-6 md:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]" />
              Lead Generator
            </div>
            <h1 className="app-title mt-4 max-w-4xl text-3xl font-semibold md:text-4xl">
              Launch a market, score the results, and hand good leads to Outreach.
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400 md:text-base">
              Single-target launch, real-time scoring, and diagnostics kept behind the scenes until you actually need them.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
            <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3">
              <div className="text-[11px] font-medium text-zinc-500">Run state</div>
              <div className="mt-2 text-lg font-semibold text-white">{runState}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3">
              <div className="text-[11px] font-medium text-zinc-500">Leads found</div>
              <div className="mt-2 text-lg font-semibold text-cyan-300">{store.totalStats.leadsFound}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/25 px-4 py-3">
              <div className="text-[11px] font-medium text-zinc-500">Vetted email</div>
              <div className="mt-2 text-lg font-semibold text-emerald-300">{store.totalStats.withEmail}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[22px] border border-cyan-500/10 bg-cyan-500/[0.04] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80">Next handoff</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {intakeLeads.length > 0 ? `${intakeLeads.length} sourced leads waiting for Outreach` : "No intake backlog right now"}
            </div>
            <div className="mt-2 text-sm text-zinc-400">
              Lead Generator owns sourcing. Outreach takes over once these records need prep and qualification.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-white/[0.06] bg-black/20 px-4 py-4">
            <Button asChild className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200">
              <Link href="/outreach?stage=enrichment">
                Open Outreach Intake
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full border border-white/10 px-4 text-sm text-white hover:bg-white/[0.04]">
              <Link href="/vault">
                Open Vault
                <Database className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr] xl:items-start">
        <Card className="overflow-hidden rounded-[28px] border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))]">
          <div className="h-px bg-[linear-gradient(90deg,rgba(16,185,129,0.8),rgba(34,211,238,0.8),rgba(255,255,255,0))]" />
          <CardHeader className="space-y-3 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <Target className="h-5 w-5 text-emerald-400" />
              Launch target
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-zinc-400">
              Define one local market, set the sweep depth, and launch immediately. If something is already running, we
              will warn you before replacing it and keep any partial results already written.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="niche" className="text-sm font-medium text-white">Market segment</Label>
                <div className="relative">
                  <Layers className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
                  <Input
                    id="niche"
                    placeholder="Roofers, med spas, landscapers..."
                    value={niche}
                    onChange={(event) => setNiche(event.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/30 pl-10 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500/50"
                    disabled={store.loading}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {NICHE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNiche(preset)}
                      disabled={store.loading}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        niche === preset
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white",
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium text-white">Target city</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
                  <Input
                    id="city"
                    placeholder="Waterloo"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/30 pl-10 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-500/50"
                    disabled={store.loading}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {CITY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCity(preset)}
                      disabled={store.loading}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        city === preset
                          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                          : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white",
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {SCAN_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setRadius(preset.radius);
                    setMaxDepth(preset.depth);
                  }}
                  disabled={store.loading}
                  className={cn(
                    "rounded-[22px] border p-4 text-left transition-all",
                    activePreset?.label === preset.label
                      ? "border-emerald-500/30 bg-emerald-500/[0.08] shadow-[0_0_40px_rgba(16,185,129,0.08)]"
                      : "border-white/[0.06] bg-black/20 hover:border-white/12",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{preset.label}</div>
                    {activePreset?.label === preset.label && (
                      <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">Active</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-zinc-400">{preset.description}</div>
                  <div className="mt-4 text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                    R {preset.radius} km | D {preset.depth}
                  </div>
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="radius" className="text-sm font-medium text-white">Radius (km)</Label>
                <Input id="radius" value={radius} onChange={(event) => setRadius(event.target.value)} className="h-12 rounded-2xl border-white/10 bg-black/30 text-white" disabled={store.loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depth" className="text-sm font-medium text-white">Scroll depth</Label>
                <Input id="depth" value={maxDepth} onChange={(event) => setMaxDepth(event.target.value)} className="h-12 rounded-2xl border-white/10 bg-black/30 text-white" disabled={store.loading} />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-500">Launch summary</div>
                  <div className="text-lg font-semibold text-white">
                    {builderReady ? `${niche.trim()} in ${city.trim()}` : "Choose a market and city"}
                  </div>
                  <div className="text-sm text-zinc-400">
                    Radius {radius} km · Depth {maxDepth}{activePreset ? ` · ${activePreset.label}` : " · Custom"}
                  </div>
                </div>

                {(store.loading || store.session.status === "paused") ? (
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    {store.session.status === "paused" ? (
                      <Button type="button" onClick={store.handleResume} className="h-11 rounded-full bg-white px-5 text-sm text-black hover:bg-zinc-200">
                        <Play className="mr-2 h-4 w-4" /> Resume
                      </Button>
                    ) : (
                      <Button type="button" onClick={store.handlePause} className="h-11 rounded-full bg-white px-5 text-sm text-black hover:bg-zinc-200">
                        <Pause className="mr-2 h-4 w-4" /> Pause
                      </Button>
                    )}
                    <Button type="button" variant="ghost" onClick={() => void store.handleCancel()} className="h-11 rounded-full border border-white/10 px-5 text-sm text-white hover:bg-white/[0.04]">
                      <XCircle className="mr-2 h-4 w-4" /> Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void launchTarget()}
                    disabled={!builderReady}
                    className={cn("h-11 rounded-full px-5 text-sm font-medium", builderReady ? "bg-white text-black hover:bg-zinc-200" : "bg-zinc-900 text-zinc-500")}
                  >
                    <Play className="mr-2 h-4 w-4" /> Launch
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <AxiomScoreDial
            businessName={scoreBusinessName}
            emailLabel={scoreEmailLabel}
            label={scoreFitLabel}
            pulsing={scorePulse}
            score={animatedScore}
            tier={scoreTier}
            websiteLabel={scoreWebsiteLabel}
          />

          <Card className="rounded-[28px] border-white/[0.06] bg-white/[0.02]">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Run Status</div>
                  <CardTitle className="mt-2 text-2xl text-white">{runState}</CardTitle>
                </div>
                <Badge variant="outline" className={cn("rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em]", store.loading ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-200" : store.session.status === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-zinc-300")}>
                  {runState}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="text-[11px] text-zinc-500">Current target</div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {currentTarget ? `${currentTarget.niche} in ${currentTarget.city}` : "No active target"}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">{currentTarget ? `Runtime ${formatDuration(store.elapsed)}` : "Ready for launch"}</div>
                </div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-[11px] text-zinc-500">Currently scraping</div>
                <div className="mt-2 truncate text-sm font-medium text-white">{currentScrapeLead}</div>
                <div className="mt-2 truncate text-xs text-zinc-500">{currentScrapeSite}</div>
              </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Radar className="h-4 w-4 text-cyan-400" />
                  What is happening right now
                </div>
                <div className="mt-3 text-sm leading-6 text-zinc-400">
                  {store.loading
                    ? scorePulse
                      ? "A lead was just scored. The dial is showing the newest Axiom-fit result from the active worker."
                      : "The worker is still analyzing the current target. Diagnostics and the live feed stay available below if you want the deeper trace."
                    : store.session.status === "interrupted"
                      ? "The previous run was interrupted and the partial discoveries were preserved. You can move directly into Vault or launch a new target."
                      : store.session.status === "completed"
                        ? "The last run is complete. The strongest scored records are already downstream for review in Vault and Outreach."
                        : "Nothing is running yet. Pick a target, launch it, and the live score dial will become the main signal."}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button asChild variant="ghost" className="h-11 rounded-full border border-white/10 text-white hover:bg-white/[0.04]">
                  <Link href="/vault"><Database className="mr-2 h-4 w-4" /> Open Vault</Link>
                </Button>
                <Button asChild variant="ghost" className="h-11 rounded-full border border-white/10 text-white hover:bg-white/[0.04]">
                  <Link href="/outreach"><Mail className="mr-2 h-4 w-4" /> Open Outreach</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/[0.06] bg-white/[0.02]">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                Why the current score landed here
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {store.latestScore?.reasonSummary?.length ? store.latestScore.reasonSummary.map((reason) => (
                <div key={reason} className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-300">{reason}</div>
              )) : (
                <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm text-zinc-400">
                  Structured score reasons will appear here as live leads are scored.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.02]">
        <button type="button" onClick={() => setDiagnosticsOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white">
              <TerminalSquare className="h-4 w-4 text-emerald-400" />
              <span className="text-base font-semibold">Diagnostics</span>
            </div>
            <div className="mt-2 text-sm text-zinc-400">
              Worker health, remote jobs, live logs, and scrape issues stay here when you want the deeper technical trace.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400 sm:flex">
              <span>{store.logs.length} lines</span>
              <span className="h-3 w-px bg-white/[0.06]" />
              <span>{unresolvedIssues} issues</span>
              <span className="h-3 w-px bg-white/[0.06]" />
              <span>{workerHealth?.online ? "worker live" : "worker idle"}</span>
            </div>
            {diagnosticsOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
          </div>
        </button>

        {diagnosticsOpen && (
          <div className="space-y-6 border-t border-white/[0.05] px-6 py-6">
            <WorkerHealthCard onHealthChange={setWorkerHealth} />
            <RemoteJobsCard key={remoteJobsRefreshKey} />
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <TerminalPanel logs={store.logs} onTogglePin={store.togglePin} loading={store.loading} />
              <div className="space-y-6">
                {unresolvedIssues > 0 ? (
                  <IssuesPanel
                    errors={store.session.errors}
                    onDismiss={(errorId) => useHuntStore.setState((state) => ({
                      session: { ...state.session, errors: state.session.errors.map((error) => error.id === errorId ? { ...error, resolved: true } : error) },
                    }))}
                    onRetryJob={(jobContext) => toast(`Retry from diagnostics is still available from Remote Jobs for ${jobContext}.`, { type: "info" })}
                  />
                ) : (
                  <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-5">
                    <div className="flex items-center gap-2 text-white">
                      <AlertTriangle className="h-4 w-4 text-zinc-500" />
                      <span className="text-sm font-medium">Diagnostics are clean</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-500">
                      No unresolved scraper issues are active right now. If anything fails, it will appear here with retry context.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Intake handoff</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Batch output waiting for Outreach</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Lead Generator owns sourcing and batch creation. Outreach owns the preparation pipeline once these records need enrichment.
            </p>
          </div>
          <Button asChild className="rounded-full bg-white px-4 text-sm text-black hover:bg-zinc-200">
            <Link href="/outreach?stage=enrichment">
              Send intake batch to Outreach
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {intakeLeads.length === 0 ? (
            <div className="rounded-[22px] border border-white/[0.06] bg-black/20 px-4 py-10 text-sm text-zinc-500 lg:col-span-3">
              No sourced leads are waiting in intake right now.
            </div>
          ) : (
            intakeLeads.map((lead) => (
              <div key={lead.id} className="rounded-[22px] border border-white/[0.06] bg-black/20 px-4 py-4">
                <div className="text-sm font-semibold text-white">{lead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {lead.city} · {lead.niche}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {lead.email ? "Email found" : "Needs enrichment"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {lead.source || "Source"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {showReplaceConfirm && pendingReplacement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-white/[0.08] bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
            <div className="flex items-start gap-4">
              <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Replace the active run?</h2>
                <p className="text-sm leading-6 text-zinc-400">
                  The current scrape will be interrupted, but anything already gathered stays written in Vault. Once you confirm, Lead Generator will stop the live target and launch{" "}
                  <span className="text-white">{pendingReplacement.niche} in {pendingReplacement.city}</span>.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => { setShowReplaceConfirm(false); setPendingReplacement(null); }} className="h-11 rounded-full border border-white/10 px-5 text-white hover:bg-white/[0.04]">
                Keep current run
              </Button>
              <Button type="button" onClick={() => void confirmReplacement()} className="h-11 rounded-full bg-white px-5 text-black hover:bg-zinc-200">
                Replace and launch <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HuntClient({ initialIntakeLeads = [] }: { initialIntakeLeads?: IntakeLead[] }) {
  return (
    <ToastProvider>
      <HuntInner initialIntakeLeads={initialIntakeLeads} />
    </ToastProvider>
  );
}
