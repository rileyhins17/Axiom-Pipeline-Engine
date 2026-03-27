"use client";
import { CheckCircle2, XCircle, Clock, Radar, Ban } from "lucide-react";

interface QueueItem {
    id: string;
    jobId?: string | null;
    niche: string;
    city: string;
    radius: string;
    maxDepth: string;
    status: "pending" | "claimed" | "running" | "completed" | "failed" | "canceled" | "paused";
    stats?: { leadsFound: number; withEmail: number; avgScore: number };
}

interface QueueSummaryProps {
    queue: QueueItem[];
    avgJobDuration: number; // seconds, 0 if unknown
}

export function QueueSummary({ queue, avgJobDuration }: QueueSummaryProps) {
    const total = queue.length;
    const completed = queue.filter(q => q.status === "completed").length;
    const claimed = queue.filter(q => q.status === "claimed").length;
    const running = queue.filter(q => q.status === "running").length;
    const failed = queue.filter(q => q.status === "failed").length;
    const canceled = queue.filter(q => q.status === "canceled").length;
    const remaining = queue.filter(q => q.status === "pending").length;

    const eta = avgJobDuration > 0 && remaining > 0
        ? Math.ceil((remaining * avgJobDuration) / 60)
        : null;

    if (total === 0) {
        return (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-mono text-zinc-500">
                <span className="text-zinc-400">0 jobs</span>
                <span className="h-3 w-px bg-white/[0.06]" />
                <span>Idle</span>
                <span className="h-3 w-px bg-white/[0.06]" />
                <span>Awaiting first target</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 px-3 py-2 glass rounded-lg text-[10px] font-mono">
            <span className="text-zinc-500">{total} jobs</span>
            <div className="h-3 w-px bg-white/[0.06]" />

            {completed > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> {completed}
                </span>
            )}
            {claimed > 0 && (
                <span className="flex items-center gap-1 text-cyan-400">
                    <Radar className="w-3 h-3 animate-pulse" /> {claimed}
                </span>
            )}
            {running > 0 && (
                <span className="flex items-center gap-1 text-cyan-400">
                    <Radar className="w-3 h-3 animate-pulse" /> {running}
                </span>
            )}
            {failed > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3 h-3" /> {failed}
                </span>
            )}
            {canceled > 0 && (
                <span className="flex items-center gap-1 text-zinc-500">
                    <Ban className="w-3 h-3" /> {canceled}
                </span>
            )}
            {remaining > 0 && (
                <span className="flex items-center gap-1 text-amber-400/70">
                    <Clock className="w-3 h-3" /> {remaining} left
                </span>
            )}
            {eta && (
                <>
                    <div className="h-3 w-px bg-white/[0.06]" />
                    <span className="text-zinc-600">~{eta}m remaining</span>
                </>
            )}
        </div>
    );
}

export type { QueueItem };
