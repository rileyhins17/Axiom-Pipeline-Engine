"use client";
import { cn } from "@/lib/utils";
import { type TriageFilters } from "@/lib/ui/triage-store";
import { SlidersHorizontal, RotateCcw, HelpCircle, ListChecks, Globe, Mail, Phone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TriageFilterBarProps {
    filters: TriageFilters;
    onFiltersChange: (filters: TriageFilters) => void;
    stats: { remaining: number; kept: number; archived: number; followUp: number; called: number };
    onOpenCallList: () => void;
    onResetSession: () => void;
    onOpenHelp: () => void;
}

const ALL_TIERS = ["S", "A", "B", "C", "D"];
const TIER_COLORS: Record<string, string> = {
    S: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    A: "bg-cyan-400/15 text-cyan-400 border-cyan-400/30",
    B: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    C: "bg-orange-400/15 text-orange-400 border-orange-400/30",
    D: "bg-red-400/15 text-red-400/70 border-red-400/20",
};

export function TriageFilterBar({
    filters, onFiltersChange, stats, onOpenCallList, onResetSession, onOpenHelp,
}: TriageFilterBarProps) {
    const toggleTier = (tier: string) => {
        const tiers = filters.tiers.includes(tier)
            ? filters.tiers.filter((t) => t !== tier)
            : [...filters.tiers, tier];
        onFiltersChange({ ...filters, tiers: tiers.length > 0 ? tiers : [tier] });
    };

    const toggleBool = (key: "noWebsite" | "hasEmail" | "hasPhone") => {
        onFiltersChange({ ...filters, [key]: !filters[key] });
    };

    const setMinRating = (val: number) => {
        onFiltersChange({ ...filters, minRating: val });
    };

    return (
        <div className="glass-ultra rounded-xl p-3 space-y-3 md:flex md:flex-wrap md:items-center md:gap-3 md:px-4 md:py-3 md:space-y-0">
            {/* Title + Stats */}
            <div className="flex items-start justify-between gap-3 md:mr-2 md:items-center">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Triage</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono sm:grid-cols-4 md:flex md:items-center md:gap-3">
                    <span className="text-zinc-500">{stats.remaining} left</span>
                    <span className="text-emerald-400">{stats.kept} kept</span>
                    <span className="text-red-400/70">{stats.archived} archived</span>
                    <span className="text-cyan-400">{stats.followUp} follow-up</span>
                </div>
            </div>

            <div className="hidden h-4 w-px bg-white/[0.06] md:block" />

            {/* Tier pills */}
            <div className="flex flex-wrap gap-1">
                {ALL_TIERS.map((tier) => (
                    <button
                        key={tier}
                        onClick={() => toggleTier(tier)}
                        className={cn(
                            "rounded border px-2 py-0.5 text-[10px] font-mono font-bold transition-all duration-150",
                            filters.tiers.includes(tier)
                                ? TIER_COLORS[tier]
                                : "border-white/[0.04] text-zinc-700 hover:text-zinc-400"
                        )}
                    >
                        {tier}
                    </button>
                ))}
            </div>

            <div className="hidden h-4 w-px bg-white/[0.06] md:block" />

            {/* Toggle pills */}
            <div className="grid grid-cols-2 gap-1.5 md:flex md:items-center md:gap-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => toggleBool("noWebsite")}
                            className={cn(
                                "flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-all",
                                filters.noWebsite
                                    ? "border-red-400/20 bg-red-400/10 text-red-400"
                                    : "border-white/[0.04] text-zinc-600 hover:text-zinc-300"
                            )}
                        >
                            <Globe className="w-3 h-3" /> No Site
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Only leads without a website</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => toggleBool("hasEmail")}
                            className={cn(
                                "flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-all",
                                filters.hasEmail
                                    ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-400"
                                    : "border-white/[0.04] text-zinc-600 hover:text-zinc-300"
                            )}
                        >
                            <Mail className="w-3 h-3" /> Email
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Only leads with email</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => toggleBool("hasPhone")}
                            className={cn(
                                "flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-all",
                                filters.hasPhone
                                    ? "border-amber-400/20 bg-amber-400/10 text-amber-400"
                                    : "border-white/[0.04] text-zinc-600 hover:text-zinc-300"
                            )}
                        >
                            <Phone className="w-3 h-3" /> Phone
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Only leads with phone</TooltipContent>
                </Tooltip>

                {/* Min rating */}
                <select
                    value={filters.minRating}
                    onChange={(e) => setMinRating(parseFloat(e.target.value))}
                    className={cn(
                        "w-full appearance-none rounded-md border bg-transparent px-2 py-1 text-[10px] outline-none cursor-pointer transition-all",
                        filters.minRating > 0
                            ? "border-amber-400/20 text-amber-400"
                            : "border-white/[0.04] text-zinc-600"
                    )}
                >
                    <option value={0}>★ Any</option>
                    <option value={3}>★ 3+</option>
                    <option value={3.5}>★ 3.5+</option>
                    <option value={4}>★ 4+</option>
                    <option value={4.5}>★ 4.5+</option>
                </select>
            </div>

            {/* Right side buttons */}
            <div className="grid grid-cols-3 gap-2 md:ml-auto md:flex md:items-center md:gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onOpenCallList}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 text-[10px] font-medium text-emerald-400 transition-all hover:bg-emerald-500/10"
                        >
                            <ListChecks className="w-3.5 h-3.5" />
                            Call List
                            {stats.kept > 0 && (
                                <span className="ml-0.5 rounded-full bg-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold">
                                    {stats.kept}
                                </span>
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Open call list drawer</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onResetSession}
                            className="flex items-center justify-center rounded-lg border border-white/[0.04] p-2 text-zinc-600 transition-all hover:border-white/[0.08] hover:text-white"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Reset triage session</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onOpenHelp}
                            className="flex items-center justify-center rounded-lg border border-white/[0.04] p-2 text-zinc-600 transition-all hover:border-white/[0.08] hover:text-white"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Keyboard shortcuts (?)</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
