"use client"
import { useHuntStore } from "@/lib/hunt/hunt-store"
import { Radar, CheckCircle2, Pause, XCircle, Zap } from "lucide-react"
import Link from "next/link"

export function EngineStatusBar() {
    const { loading, session, elapsed, queue } = useHuntStore()

    if (session.status === "idle" && !loading) return null

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0")
        const s = (secs % 60).toString().padStart(2, "0")
        return `${m}:${s}`
    }

    const pendingCount = queue.filter(q => q.status === "pending").length
    const doneCount = queue.filter(q => (q.status as string) === "done" || q.status === "completed").length
    const totalJobs = queue.length

    const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
        running: {
            icon: <Radar className="w-3 h-3 animate-pulse" />,
            label: session.currentJob
                ? `Mining: ${session.currentJob.niche} in ${session.currentJob.city}`
                : "Engine Running",
            color: "text-emerald-400",
            bgColor: "bg-emerald-500/10 border-emerald-500/20"
        },
        paused: {
            icon: <Pause className="w-3 h-3" />,
            label: "Engine Paused",
            color: "text-amber-400",
            bgColor: "bg-amber-500/10 border-amber-500/20"
        },
        completed: {
            icon: <CheckCircle2 className="w-3 h-3" />,
            label: `Hunt Complete — ${doneCount} jobs finished`,
            color: "text-emerald-400",
            bgColor: "bg-emerald-500/10 border-emerald-500/20"
        },
        canceled: {
            icon: <XCircle className="w-3 h-3" />,
            label: "Engine Canceled",
            color: "text-red-400",
            bgColor: "bg-red-500/10 border-red-500/20"
        },
        idle: {
            icon: <Zap className="w-3 h-3" />,
            label: "Engine Idle",
            color: "text-zinc-400",
            bgColor: "bg-zinc-500/10 border-zinc-500/20"
        }
    }

    const status = statusConfig[session.status] || statusConfig.idle

    return (
        <Link href="/hunt" className="block">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-mono transition-all hover:scale-[1.02] cursor-pointer ${status.bgColor}`}>
                <span className={status.color}>{status.icon}</span>
                <span className={`${status.color} truncate max-w-[200px]`}>{status.label}</span>
                {loading && (
                    <>
                        <span className="text-white/20">|</span>
                        <span className="text-white/50 tabular-nums">{formatTime(elapsed)}</span>
                        {session.currentJob && (
                            <span className="text-white/30">
                                {session.currentJob.index}/{session.currentJob.total}
                            </span>
                        )}
                    </>
                )}
                {/* Micro progress bar */}
                {loading && totalJobs > 0 && (
                    <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden ml-1">
                        <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${((doneCount + (loading ? 0.5 : 0)) / totalJobs) * 100}%` }}
                        />
                    </div>
                )}
            </div>
        </Link>
    )
}
