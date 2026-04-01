"use client"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight, LayoutDashboard, Target, Database, Settings, MessageSquareText, Zap } from "lucide-react"

const routeMap: Record<string, { label: string; icon: any }> = {
    "/dashboard": { label: "Dashboard", icon: LayoutDashboard },
    "/hunt": { label: "The Hunt", icon: Target },
    "/vault": { label: "The Vault", icon: Database },
    "/triage": { label: "Triage", icon: Zap },
    "/outreach": { label: "Outreach", icon: MessageSquareText },
    "/settings": { label: "Settings", icon: Settings },
}

export function LayoutBreadcrumb() {
    const pathname = usePathname()
    const route = routeMap[pathname]

    if (!route) return null

    const Icon = route.icon

    return (
        <div className="flex items-center gap-2 ml-3">
            <ChevronRight className="w-3 h-3 text-white/10" />
            <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-emerald-400/70" />
                <span className="text-xs font-medium text-white/70">{route.label}</span>
            </div>
        </div>
    )
}
