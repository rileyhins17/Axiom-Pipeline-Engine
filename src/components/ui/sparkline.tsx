"use client"

interface SparklineProps {
    data: number[]
    width?: number
    height?: number
    color?: string
    fillOpacity?: number
    strokeWidth?: number
    animated?: boolean
}

export function Sparkline({ data, width = 120, height = 32, color = "#34d399", fillOpacity = 0.15, strokeWidth = 1.5, animated = true }: SparklineProps) {
    if (!data || data.length < 2) return null

    const max = Math.max(...data, 1)
    const min = Math.min(...data, 0)
    const range = max - min || 1
    const paddingY = 2

    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width
        const y = height - paddingY - ((v - min) / range) * (height - paddingY * 2)
        return { x, y }
    })

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

    const trend = data[data.length - 1] - data[0]
    const trendColor = trend > 0 ? color : trend < 0 ? "#f87171" : color

    return (
        <svg width={width} height={height} className={animated ? "animate-fade-in" : ""} style={{ overflow: "visible" }}>
            <defs>
                <linearGradient id={`spark-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trendColor} stopOpacity={fillOpacity} />
                    <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
            </defs>
            {/* Fill area */}
            <path d={fillPath} fill={`url(#spark-fill-${color.replace("#", "")})`} />
            {/* Line */}
            <path d={linePath} fill="none" stroke={trendColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            {/* Current value dot */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={trendColor} className="animate-glow" />
        </svg>
    )
}
