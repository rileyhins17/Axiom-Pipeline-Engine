"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getLogColor, type ParseResult } from "@/lib/hunt/sse-parser";
import { Search, ChevronDown, ChevronUp, ArrowDown, Radar, Star } from "lucide-react";

export interface LogEntry {
    id: number;
    message: string;
    timestamp: string;
    level: ParseResult["level"];
    pinned: boolean;
}

interface TerminalPanelProps {
    logs: LogEntry[];
    onTogglePin: (id: number) => void;
    loading: boolean;
}

export function TerminalPanel({ logs, onTogglePin, loading }: TerminalPanelProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Detect user scroll-up
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
        setAutoScroll(isAtBottom);
    }, []);

    // Filter logs
    const isSearching = searchQuery.trim().length > 0;
    const filteredLogs = isSearching
        ? logs.filter(l => l.message.toLowerCase().includes(searchQuery.toLowerCase()))
        : logs;

    const pinnedLogs = logs.filter(l => l.pinned);

    return (
        <div className="glass-ultra rounded-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] bg-black/40">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
                >
                    {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500/80" />
                        <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
                        <div className="w-2 h-2 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-[10px] tracking-widest uppercase text-zinc-700 ml-1">
                        Live Feed
                    </span>
                    <span className="text-[9px] text-zinc-700">({logs.length} lines)</span>
                </button>

                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search logs..."
                                className="bg-black/40 border border-white/[0.04] rounded-md pl-7 pr-3 py-1 text-[10px] text-zinc-400 placeholder:text-zinc-800 outline-none focus:border-white/[0.08] w-[160px] transition-colors font-mono"
                            />
                        </div>

                        {!autoScroll && (
                            <button
                                onClick={() => {
                                    setAutoScroll(true);
                                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 transition-all"
                            >
                                <ArrowDown className="w-2.5 h-2.5" /> Jump to Live
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Pinned lines */}
            {!collapsed && pinnedLogs.length > 0 && (
                <div className="px-4 py-1.5 bg-amber-500/[0.03] border-b border-amber-500/10">
                    {pinnedLogs.map(log => (
                        <div key={log.id} className="flex items-center gap-2 text-[10px] font-mono text-amber-400/80 py-0.5">
                            <Star className="w-2.5 h-2.5 fill-amber-400/50 text-amber-400/50" />
                            <span className="truncate">{log.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Terminal body */}
            {!collapsed && (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="p-4 overflow-y-auto font-mono text-xs space-y-0.5 max-h-[400px] min-h-[200px] bg-black/60"
                >
                    {filteredLogs.length === 0 && (
                        isSearching ? (
                            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-center text-xs text-zinc-500">
                                No lines matching <span className="text-zinc-300">{searchQuery}</span>
                                <div className="mt-2 text-[10px] text-zinc-600">Clear the filter to return to the live feed.</div>
                            </div>
                        ) : (
                            <div className="grid min-h-[260px] place-items-center px-6 py-10">
                                <div className="max-w-sm text-center">
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                        <Radar className="w-5 h-5" />
                                    </div>
                                    <div className="mt-4 text-sm font-semibold text-white/90">
                                        {loading ? "Listening for the first event" : "Feed standing by"}
                                    </div>
                                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                                        {loading
                                            ? "The terminal will populate as soon as the scraper emits its first line."
                                            : "Add a target on the left, then launch the queue to arm this terminal."}
                                    </p>
                                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                                        {["Live logs", "Pinned lines", "Search feed"].map((label) => (
                                            <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                    {filteredLogs.map(log => (
                        <div
                            key={log.id}
                            className="flex gap-2 break-words leading-relaxed hover:bg-white/[0.02] px-1 rounded transition-colors group"
                        >
                            <span className="text-zinc-800 shrink-0 select-none text-[10px]">{log.timestamp}</span>
                            <button
                                onClick={() => onTogglePin(log.id)}
                                className={cn(
                                    "shrink-0 transition-colors",
                                    log.pinned ? "text-amber-400/70" : "text-transparent group-hover:text-zinc-800 hover:text-amber-400/50"
                                )}
                            >
                                <Star className={cn("w-2.5 h-2.5", log.pinned && "fill-amber-400/50")} />
                            </button>
                            <span className={getLogColor(log.level)}>{log.message}</span>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-4 bg-emerald-400 animate-pulse" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
