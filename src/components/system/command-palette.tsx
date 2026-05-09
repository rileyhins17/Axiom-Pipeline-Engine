"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { COMMANDS, searchCommands, groupByCategory, type Command } from "@/lib/commands";
import { usePerformance } from "@/lib/ui/performance";
import { Building2, Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";

type LeadSearchResult = { id: number; businessName: string; city: string; niche: string };

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    onOpenShortcuts: () => void;
}

export function CommandPalette({ open, onClose, onOpenShortcuts }: CommandPaletteProps) {
    const router = useRouter();
    const { toggle: togglePerf } = usePerformance();
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);

    const results = searchCommands(query);
    const groups = groupByCategory(results);
    const flatResults = results;
    const totalItems = flatResults.length + leadResults.length;

    useEffect(() => {
        if (!query || query.length < 2) { setLeadResults([]); return; }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`/api/vault/leads?search=${encodeURIComponent(query)}&limit=5`, { signal: controller.signal })
                .then((r) => r.json())
                .then((data: { leads?: LeadSearchResult[] }) => setLeadResults(data.leads ?? []))
                .catch(() => {});
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [query]);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setQuery("");
            setSelectedIndex(0);
            setLeadResults([]);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Execute a command
    const executeCommand = useCallback((cmd: Command) => {
        onClose();
        switch (cmd.action.type) {
            case "navigate":
                router.push(cmd.action.path as Route);
                break;
            case "navigate-filter":
                {
                    const params = new URLSearchParams(cmd.action.params);
                    router.push(`${cmd.action.path}?${params.toString()}` as Route);
                }
                break;
            case "export":
                {
                    const exportParams = new URLSearchParams({ format: cmd.action.format });
                    if (cmd.action.tiers) exportParams.set("tier", cmd.action.tiers);
                    window.open(`/api/leads/export?${exportParams.toString()}`, "_blank");
                }
                break;
            case "modal":
                if (cmd.action.modal === "shortcuts") {
                    setTimeout(() => onOpenShortcuts(), 100);
                }
                if (cmd.action.modal === "perf-toggle") {
                    togglePerf();
                }
                break;
        }
    }, [onClose, router, onOpenShortcuts, togglePerf]);

    // Keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handler = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex(i => Math.max(i - 1, 0));
                    break;
                case "Enter":
                    e.preventDefault();
                    if (selectedIndex < flatResults.length) {
                        if (flatResults[selectedIndex]) executeCommand(flatResults[selectedIndex]);
                    } else {
                        const leadIdx = selectedIndex - flatResults.length;
                        if (leadResults[leadIdx]) {
                            onClose();
                            router.push(`/clients/${leadResults[leadIdx].id}` as Route);
                        }
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, selectedIndex, flatResults, executeCommand, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    // Reset selection on query change
    useEffect(() => { setSelectedIndex(0); }, [query]);

    if (!open) return null;

    let globalIndex = -1;

    return (
        <div className="fixed inset-0 z-[100]" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Palette container */}
            <div className="relative flex items-start justify-center pt-[15vh]">
                <div
                    className="w-full max-w-[560px] glass-ultra rounded-2xl border border-white/[0.08] shadow-2xl shadow-emerald-500/5 overflow-hidden animate-scale-in"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Search input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                        <Search className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Type a command or search…"
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none font-medium"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <kbd className="hidden sm:inline-flex text-[10px] font-mono text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
                            ESC
                        </kbd>
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                        {totalItems === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-muted-foreground/60">No commands found</p>
                                <p className="text-[11px] text-muted-foreground/30 mt-1">Try a different search term</p>
                            </div>
                        ) : (
                            <>
                            {groups.map(group => (
                                <div key={group.category}>
                                    <div className="px-4 pt-2 pb-1">
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/30">
                                            {group.label}
                                        </span>
                                    </div>
                                    {group.commands.map(cmd => {
                                        globalIndex++;
                                        const idx = globalIndex;
                                        const isSelected = idx === selectedIndex;
                                        return (
                                            <button
                                                key={cmd.id}
                                                data-index={idx}
                                                onClick={() => executeCommand(cmd)}
                                                onMouseEnter={() => setSelectedIndex(idx)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                                    isSelected
                                                        ? "bg-emerald-400/[0.08] text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <cmd.icon className={cn(
                                                    "w-4 h-4 flex-shrink-0",
                                                    isSelected ? "text-emerald-400" : "text-muted-foreground/50"
                                                )} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">{cmd.label}</div>
                                                    {cmd.description && (
                                                        <div className="text-[11px] text-muted-foreground/40 truncate">{cmd.description}</div>
                                                    )}
                                                </div>
                                                {cmd.shortcut && (
                                                    <kbd className={cn(
                                                        "text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0",
                                                        isSelected
                                                            ? "text-emerald-400/70 bg-emerald-400/[0.06] border-emerald-400/20"
                                                            : "text-muted-foreground/30 bg-white/[0.02] border-white/[0.04]"
                                                    )}>
                                                        {cmd.shortcut}
                                                    </kbd>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                            {leadResults.length > 0 && (
                                <div>
                                    <div className="px-4 pt-2 pb-1">
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/30">
                                            Leads
                                        </span>
                                    </div>
                                    {leadResults.map((lead, li) => {
                                        const idx = flatResults.length + li;
                                        const isSelected = idx === selectedIndex;
                                        return (
                                            <button
                                                key={lead.id}
                                                data-index={idx}
                                                onClick={() => { onClose(); router.push(`/clients/${lead.id}` as Route); }}
                                                onMouseEnter={() => setSelectedIndex(idx)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                                    isSelected
                                                        ? "bg-emerald-400/[0.08] text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <Building2 className={cn(
                                                    "w-4 h-4 flex-shrink-0",
                                                    isSelected ? "text-emerald-400" : "text-muted-foreground/50"
                                                )} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">{lead.businessName}</div>
                                                    <div className="text-[11px] text-muted-foreground/40 truncate">{lead.city} · {lead.niche}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            </>
                        )}
                    </div>

                    {/* Footer hints */}
                    <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/[0.06] text-[10px] text-muted-foreground/30 font-mono">
                        <span className="inline-flex items-center gap-1">
                            <ArrowUp className="w-2.5 h-2.5" />
                            <ArrowDown className="w-2.5 h-2.5" />
                            navigate
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <CornerDownLeft className="w-2.5 h-2.5" />
                            select
                        </span>
                        <span className="inline-flex items-center gap-1">
                            esc close
                        </span>
                        <span className="ml-auto">{flatResults.length} commands{leadResults.length > 0 ? ` · ${leadResults.length} leads` : ""}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
