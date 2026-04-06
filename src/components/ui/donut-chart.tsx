"use client"
import { useEffect, useState } from "react"

interface DonutSegment {
    label: string
    value: number
    color: string
}

interface DonutChartProps {
    segments: DonutSegment[]
    size?: number
    thickness?: number
    centerLabel?: string
    centerValue?: string | number
}

export function DonutChart({ segments, size = 160, thickness = 14, centerLabel, centerValue }: DonutChartProps) {
    const [progress, setProgress] = useState(0)
    const radius = (size - thickness) / 2
    const circumference = 2 * Math.PI * radius
    const total = segments.reduce((sum, s) => sum + s.value, 0)

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setTimeout(() => setProgress(1), 50)
        })
        return () => cancelAnimationFrame(frame)
    }, [])

    let accumulated = 0

    return (
        <div className="relative inline-flex flex-col items-center">
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background track */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" className="stroke-white/[0.04]"
                    strokeWidth={thickness}
                />
                {/* Segments */}
                {segments.map((seg, i) => {
                    const pct = total > 0 ? seg.value / total : 0
                    const segLength = pct * circumference
                    const segOffset = circumference - segLength * progress
                    const rotation = (accumulated / total) * 360
                    accumulated += seg.value

                    return (
                        <circle
                            key={i}
                            cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke={seg.color}
                            strokeWidth={thickness}
                            strokeDasharray={`${segLength} ${circumference - segLength}`}
                            strokeDashoffset={segOffset}
                            strokeLinecap="round"
                            className="transition-[stroke-dashoffset] duration-1000 ease-out"
                            style={{
                                transformOrigin: 'center',
                                transform: `rotate(${rotation}deg)`,
                                filter: `drop-shadow(0 0 4px ${seg.color}40)`,
                                transitionDelay: `${i * 150}ms`
                            }}
                        />
                    )
                })}
            </svg>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                {centerValue !== undefined && (
                    <span className="text-xl font-bold font-mono text-white">{centerValue}</span>
                )}
                {centerLabel && (
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{centerLabel}</span>
                )}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3">
                {segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span className="text-[10px] text-muted-foreground">{seg.label}</span>
                        <span className="text-[10px] font-mono font-bold text-white/70">{seg.value}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
