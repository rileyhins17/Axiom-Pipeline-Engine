"use client";
import { cn } from "@/lib/utils";
import { type TriageAction } from "@/lib/ui/triage-store";
import {
    Check, Archive, PhoneCall, Clock, CornerDownLeft, Undo2,
    ChevronLeft, ChevronRight,
} from "lucide-react";

interface ActionDockProps {
    onAction: (action: TriageAction) => void;
    onOpenDossier: () => void;
    onUndo: () => void;
    onPrev: () => void;
    onNext: () => void;
    canUndo: boolean;
    canPrev: boolean;
    canNext: boolean;
    hasPhone: boolean;
    disabled?: boolean;
}

const ACTIONS: {
    key: string;
    action: TriageAction;
    label: string;
    icon: any;
    color: string;
    activeColor: string;
}[] = [
    {
        key: "1", action: "keep", label: "Keep", icon: Check,
        color: "border-emerald-500/20 text-emerald-400", activeColor: "bg-emerald-500/15 shadow-emerald-500/10",
    },
    {
        key: "2", action: "archive", label: "Archive", icon: Archive,
        color: "border-red-500/20 text-red-400", activeColor: "bg-red-500/15 shadow-red-500/10",
    },
    {
        key: "3", action: "call_now", label: "Call Now", icon: PhoneCall,
        color: "border-cyan-500/20 text-cyan-400", activeColor: "bg-cyan-500/15 shadow-cyan-500/10",
    },
    {
        key: "4", action: "follow_up", label: "Follow Up", icon: Clock,
        color: "border-amber-500/20 text-amber-400", activeColor: "bg-amber-500/15 shadow-amber-500/10",
    },
];

export function ActionDock({
    onAction, onOpenDossier, onUndo, onPrev, onNext,
    canUndo, canPrev, canNext, hasPhone, disabled,
}: ActionDockProps) {
    return (
        <>
            <div className="glass-ultra rounded-xl p-3 space-y-3 md:hidden">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onPrev}
                        disabled={!canPrev || disabled}
                        className={cn(
                            "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-all",
                            canPrev && !disabled
                                ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Previous (K / Left)"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                    </button>
                    <button
                        onClick={onNext}
                        disabled={!canNext || disabled}
                        className={cn(
                            "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-all",
                            canNext && !disabled
                                ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Next (J / Right)"
                    >
                        <ChevronRight className="h-4 w-4" />
                        Next
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {ACTIONS.map((a) => {
                        const isCallDisabled = a.action === "call_now" && !hasPhone;
                        const Icon = a.icon;
                        return (
                            <button
                                key={a.action}
                                onClick={() => !isCallDisabled && onAction(a.action)}
                                disabled={disabled || isCallDisabled}
                                className={cn(
                                    "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-all duration-200",
                                    a.color,
                                    a.activeColor,
                                    (disabled || isCallDisabled) && "cursor-not-allowed opacity-30 hover:shadow-none active:scale-100"
                                )}
                                title={`${a.label} (${a.key})`}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{a.label}</span>
                                <kbd className="hidden rounded bg-black/30 border border-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono opacity-60 sm:inline-flex">
                                    {a.key}
                                </kbd>
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onOpenDossier}
                        disabled={disabled}
                        className={cn(
                            "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-all",
                            !disabled
                                ? "border-purple-500/20 text-purple-400 bg-purple-500/5 hover:bg-purple-500/10"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Open Dossier (Enter)"
                    >
                        <CornerDownLeft className="h-4 w-4" />
                        Dossier
                        <kbd className="hidden rounded bg-black/30 border border-white/[0.06] px-1 py-0.5 text-[10px] font-mono opacity-60 sm:inline-flex">Enter</kbd>
                    </button>

                    <button
                        onClick={onUndo}
                        disabled={!canUndo || disabled}
                        className={cn(
                            "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium transition-all",
                            canUndo && !disabled
                                ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.15] hover:text-white"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Undo (Z)"
                    >
                        <Undo2 className="h-4 w-4" />
                        Undo
                        <kbd className="hidden rounded bg-black/30 border border-white/[0.06] px-1 py-0.5 text-[10px] font-mono opacity-60 sm:inline-flex">Z</kbd>
                    </button>
                </div>
            </div>

            <div className="hidden items-center justify-center gap-3 rounded-xl bg-transparent px-6 py-4 glass-ultra md:flex">
                {/* Navigation */}
                <div className="mr-2 flex items-center gap-1">
                    <button
                        onClick={onPrev}
                        disabled={!canPrev || disabled}
                        className={cn(
                            "rounded-lg border p-2 transition-all",
                            canPrev && !disabled
                                ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Previous (K / Left)"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onNext}
                        disabled={!canNext || disabled}
                        className={cn(
                            "rounded-lg border p-2 transition-all",
                            canNext && !disabled
                                ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-white"
                                : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                        )}
                        title="Next (J / Right)"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="h-6 w-px bg-white/[0.06]" />

                {/* Main actions */}
                {ACTIONS.map((a) => {
                    const isCallDisabled = a.action === "call_now" && !hasPhone;
                    const Icon = a.icon;
                    return (
                        <button
                            key={a.action}
                            onClick={() => !isCallDisabled && onAction(a.action)}
                            disabled={disabled || isCallDisabled}
                            className={cn(
                                "flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:shadow-lg active:scale-[0.97]",
                                a.color,
                                a.activeColor,
                                (disabled || isCallDisabled) && "cursor-not-allowed opacity-30 hover:shadow-none active:scale-100"
                            )}
                            title={`${a.label} (${a.key})`}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{a.label}</span>
                            <kbd className="ml-1 hidden rounded bg-black/30 border border-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono opacity-60 sm:inline-flex">
                                {a.key}
                            </kbd>
                        </button>
                    );
                })}

                <div className="h-6 w-px bg-white/[0.06]" />

                {/* Secondary */}
                <button
                    onClick={onOpenDossier}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                        !disabled
                            ? "border-purple-500/20 text-purple-400 bg-purple-500/5 hover:bg-purple-500/10"
                            : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                    )}
                    title="Open Dossier (Enter)"
                >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Dossier
                    <kbd className="ml-0.5 hidden rounded bg-black/30 border border-white/[0.06] px-1 py-0.5 text-[9px] font-mono opacity-60 sm:inline-flex">Enter</kbd>
                </button>

                <button
                    onClick={onUndo}
                    disabled={!canUndo || disabled}
                    className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                        canUndo && !disabled
                            ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.15] hover:text-white"
                            : "cursor-not-allowed border-white/[0.02] text-zinc-800"
                    )}
                    title="Undo (Z)"
                >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo
                    <kbd className="ml-0.5 hidden rounded bg-black/30 border border-white/[0.06] px-1 py-0.5 text-[9px] font-mono opacity-60 sm:inline-flex">Z</kbd>
                </button>
            </div>
        </>
    );
}
