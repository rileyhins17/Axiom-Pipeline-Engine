"use client"
import * as React from "react"
import { Target, Database, Settings, Zap, LayoutDashboard, MessageSquareText } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { BrandMark } from "@/components/brand-mark"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarFooter,
    SidebarHeader,
    SidebarSeparator,
} from "@/components/ui/sidebar"

const navItems = [
    {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
        description: "Command center overview",
        shortcut: "Cmd+1",
    },
    {
        title: "The Hunt",
        url: "/hunt",
        icon: Target,
        description: "Extract & enrich leads",
        shortcut: "Cmd+2",
    },
    {
        title: "The Vault",
        url: "/vault",
        icon: Database,
        description: "Browse lead database",
        shortcut: "Cmd+3",
    },
    {
        title: "Triage",
        url: "/triage",
        icon: Zap,
        description: "Speed triage leads",
        shortcut: "Cmd+5",
    },
    {
        title: "Outreach",
        url: "/outreach",
        icon: MessageSquareText,
        description: "Manage contacted leads",
        shortcut: "Cmd+6",
    },
    {
        title: "Settings",
        url: "/settings",
        icon: Settings,
        description: "Configure engine",
        shortcut: "Cmd+4",
    },
]

export function AppSidebar() {
    const pathname = usePathname()
    const [stats, setStats] = React.useState<{ total: number; todayLeads: number; todayEmails: number; totalEmails: number } | null>(null)

    React.useEffect(() => {
        Promise.all([
            fetch("/api/leads/stats").then(r => r.json()),
            fetch("/api/leads/analytics").then(r => r.json()),
        ]).then(([statsData, analyticsData]) => setStats({
            total: statsData.total ?? 0,
            todayLeads: statsData.todayLeads ?? 0,
            todayEmails: statsData.todayEmails ?? 0,
            totalEmails: analyticsData.withEmail ?? 0,
        }))
            .catch(() => setStats({ total: 0, todayLeads: 0, todayEmails: 0, totalEmails: 0 }))
    }, [pathname])

    return (
        <Sidebar className="border-r border-white/[0.04]">
            <SidebarHeader className="p-5 pb-3">
                <div className="flex items-center gap-3">
                    <BrandMark
                        href="/dashboard"
                        className="w-[168px] shrink-0 px-2 py-1.5"
                        imageClassName="h-8"
                    />
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-white uppercase leading-none">
                            Lead Finder
                        </h2>
                        <p className="text-[9px] text-emerald-500/80 font-mono tracking-wider flex items-center gap-1 mt-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block animate-glow" />
                            OMNISCIENT ENGINE
                        </p>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarSeparator className="opacity-20" />

            <SidebarContent className="px-2 pt-2">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[9px] uppercase tracking-widest text-muted-foreground/50 px-3 mb-1">
                        Operations
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => {
                                const isActive = pathname === item.url
                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={isActive}
                                            tooltip={item.description}
                                        >
                                            <Link
                                                href={item.url as Route}
                                                className={`
                                                    group relative flex items-center gap-3 rounded-lg px-3 py-2.5 
                                                    transition-all duration-200 ease-out
                                                    ${isActive
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"
                                                    }
                                                `}
                                            >
                                                {isActive && (
                                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-400" />
                                                )}
                                                <item.icon className={`w-4 h-4 transition-colors ${isActive ? "text-emerald-400" : "text-muted-foreground group-hover:text-white"}`} />
                                                <div className="flex flex-col flex-1">
                                                    <span className="text-sm font-medium">{item.title}</span>
                                                    <span className="text-[9px] text-muted-foreground/40 leading-tight">{item.description}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors">
                                                    {item.shortcut}
                                                </span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-4">
                <SidebarSeparator className="mb-3 opacity-20" />

                <div className="glass-strong rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50">Database</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow" />
                            <span className="text-sm font-bold text-emerald-400 font-mono">
                                {stats ? stats.total.toLocaleString() : "..."}
                            </span>
                        </div>
                    </div>
                    <div className="h-px bg-white/[0.04]" />
                    <div className="grid grid-cols-2 gap-2">
                        <div className="text-center">
                            <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Today</div>
                            <div className="text-xs font-bold text-cyan-400 font-mono">{stats ? stats.todayLeads : "—"}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Emails</div>
                            <div className="text-xs font-bold text-amber-400 font-mono">{stats ? stats.totalEmails : "—"}</div>
                        </div>
                    </div>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
