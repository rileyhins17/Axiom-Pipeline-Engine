"use client"
import { useEffect, useState } from "react"

interface RadialGaugeProps {
    value: number        // 0-100
    label: string
    size?: number
    color?: string       // tailwind color like "emerald"
    thickness?: number
    animate?: boolean
}

export function RadialGauge({ value, label, size = 120, color = "emerald", thickness = 8, animate = true }: RadialGaugeProps) {
    const [displayValue, setDisplayValue] = useState(0)
    const radius = (size - thickness) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (displayValue / 100) * circumference

    useEffect(() => {
        if (!animate) { setDisplayValue(value); return }
        let frame: number
        const duration = 1200
        const start = performance.now()
        const from = 0
        const tick = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
            setDisplayValue(Math.round(from + (value - from) * eased))
            if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [value, animate])

    const colorMap: Record<string, { stroke: string; glow: string; text: string; bg: string }> = {
        emerald: { stroke: "#34d399", glow: "rgba(52, 211, 153, 0.3)", text: "text-emerald-400", bg: "rgba(52, 211, 153, 0.08)" },
        cyan: { stroke: "#22d3ee", glow: "rgba(34, 211, 238, 0.3)", text: "text-cyan-400", bg: "rgba(34, 211, 238, 0.08)" },
        purple: { stroke: "#a78bfa", glow: "rgba(167, 139, 250, 0.3)", text: "text-purple-400", bg: "rgba(167, 139, 250, 0.08)" },
        amber: { stroke: "#fbbf24", glow: "rgba(251, 191, 36, 0.3)", text: "text-amber-400", bg: "rgba(251, 191, 36, 0.08)" },
        red: { stroke: "#f87171", glow: "rgba(248, 113, 113, 0.3)", text: "text-red-400", bg: "rgba(248, 113, 113, 0.08)" },
    }
    const c = colorMap[color] || colorMap.emerald

    return (
        <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90" style={{ filter: `drop-shadow(0 0 8px ${c.glow})` }}>
                {/* Background track */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" className="stroke-white/[0.04]"
                    strokeWidth={thickness}
                />
                {/* Active arc */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={c.stroke}
                    strokeWidth={thickness}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
                {/* Glow arc (slightly wider, very dim) */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={c.stroke}
                    strokeWidth={thickness + 6}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    opacity={0.15}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold font-mono ${c.text}`}>{displayValue}</span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</span>
            </div>
        </div>
    )
}
