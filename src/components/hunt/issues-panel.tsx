"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { type HuntError } from "@/lib/hunt/hunt-session-store";
import { AlertTriangle, Copy, Check, ChevronDown, ChevronRight, RotateCcw, X } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

interface IssuesPanelProps {
    errors: HuntError[];
    onRetryJob: (jobContext: string) => void;
    onDismiss: (errorId: string) => void;
}

export function IssuesPanel({ errors, onRetryJob, onDismiss }: IssuesPanelProps) {
    const { toast } = useToast();
    const [expanded, setExpanded] = useState<string | null>(null);

    const activeErrors = errors.filter(e => !e.resolved);
    if (activeErrors.length === 0) return null;

    const copyError = async (error: HuntError) => {
        const report = `Error: ${error.message}\nJob: ${error.jobContext}\nTime: ${error.timestamp}\nRaw: ${error.rawLine}`;
        await navigator.clipboard.writeText(report);
        toast("Error report copied", { icon: "copy" });
    };

    return (
        <div className="glass-ultra rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400">
                        Issues ({activeErrors.length})
                    </span>
                </div>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {activeErrors.map(error => (
                    <div key={error.id} className="glass rounded-lg p-3 border border-red-500/10">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <button
                                    onClick={() => setExpanded(expanded === error.id ? null : error.id)}
                                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white transition-colors"
                                >
                                    {expanded === error.id
                                        ? <ChevronDown className="w-3 h-3" />
                                        : <ChevronRight className="w-3 h-3" />
                                    }
                                    {new Date(error.timestamp).toLocaleTimeString()}
                                    <span className="text-zinc-700">|</span>
                                    <span className="text-zinc-600">{error.jobContext}</span>
                                </button>
                                <p className="text-[11px] text-red-300/80 mt-1 truncate">{error.message}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => copyError(error)}
                                    className="p-1 rounded text-zinc-600 hover:text-white transition-colors"
                                    title="Copy error report"
                                >
                                    <Copy className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => onRetryJob(error.jobContext)}
                                    className="p-1 rounded text-zinc-600 hover:text-amber-400 transition-colors"
                                    title="Retry job"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => onDismiss(error.id)}
                                    className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
                                    title="Dismiss"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        {expanded === error.id && (
                            <div className="mt-2 p-2 glass rounded text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-all">
                                {error.rawLine}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
