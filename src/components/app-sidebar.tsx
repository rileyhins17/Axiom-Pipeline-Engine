"use client";

import * as React from "react";
import {
  Bot,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Radio,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
  accent: string; // hex-ish tailwind class for the active icon
  badgeKey?: "readyForTouch" | "followUp" | "replied" | "total";
};

const navItems: NavItem[] = [
  { title: "Dashboard",      url: "/dashboard",  icon: LayoutDashboard, shortcut: "⌘1", accent: "text-emerald-400" },
  { title: "Lead Generator", url: "/hunt",       icon: Target,          shortcut: "⌘2", accent: "text-cyan-400" },
  { title: "Vault",          url: "/vault",      icon: Database,        shortcut: "⌘3", accent: "text-blue-400", badgeKey: "total" },
  { title: "Automation",     url: "/automation", icon: Bot,             shortcut: "⌘4", accent: "text-violet-400" },
  { title: "Outreach",       url: "/outreach",   icon: MessageSquareText,shortcut: "⌘5", accent: "text-amber-400", badgeKey: "readyForTouch" },
  { title: "Settings",       url: "/settings",   icon: Settings,        shortcut: "⌘6", accent: "text-zinc-300" },
];

type LeadStats = {
  total: number;
  todayLeads: number;
  readyForTouch?: number;
  followUp?: number;
  replied?: number;
};

export function AppSidebar() {
  const pathname = usePathname();
  const [stats, setStats] = React.useState<LeadStats | null>(null);

  React.useEffect(() => {
    fetch("/api/leads/stats")
      .then((r) => r.json())
      .then((data) =>
        setStats({
          total: data.total ?? 0,
          todayLeads: data.todayLeads ?? 0,
          readyForTouch: data.readyForTouch,
          followUp: data.followUp,
          replied: data.replied,
        }),
      )
      .catch(() => setStats({ total: 0, todayLeads: 0 }));
  }, [pathname]);

  return (
    <Sidebar className="border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(0,0,0,1)_0%,rgba(9,9,11,1)_100%)]">
      {/* Brand */}
      <SidebarHeader className="px-4 pb-5 pt-5">
        <Link href={"/dashboard" as Route} className="block">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-emerald-500/[0.08] via-white/[0.02] to-transparent p-4 transition-all hover:border-emerald-500/30 hover:shadow-[0_0_40px_rgba(16,185,129,0.08)]">
            {/* Glow orb */}
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/20 blur-3xl"
              aria-hidden
            />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-[15px] font-bold text-black shadow-lg shadow-emerald-500/30">
                A
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400/80">
                  Axiom
                </div>
                <div className="truncate text-sm font-semibold text-white">Pipeline Engine</div>
              </div>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent className="px-3">
        <SidebarGroup>
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
            Workspace
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.url || pathname?.startsWith(item.url + "/");
                const badgeValue =
                  item.badgeKey && stats ? stats[item.badgeKey] ?? 0 : 0;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url as Route}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                          isActive
                            ? "border border-white/[0.08] bg-gradient-to-r from-white/[0.06] to-transparent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            : "border border-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-white"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-400 to-cyan-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
                        )}
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            isActive
                              ? "bg-white/[0.06]"
                              : "bg-transparent group-hover:bg-white/[0.04]"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 transition-colors ${
                              isActive ? item.accent : "text-zinc-500 group-hover:text-zinc-300"
                            }`}
                          />
                        </div>
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {badgeValue > 0 && (
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                              isActive
                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                : "border-white/[0.08] bg-white/[0.04] text-zinc-400 group-hover:border-white/[0.14] group-hover:text-zinc-200"
                            }`}
                          >
                            {badgeValue > 99 ? "99+" : badgeValue}
                          </span>
                        )}
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            isActive ? "text-zinc-500" : "text-zinc-700 group-hover:text-zinc-500"
                          }`}
                        >
                          {item.shortcut}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — live engine status */}
      <SidebarFooter className="p-3">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.04] via-black/40 to-transparent p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400/80">
              Engine Live
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Database className="h-3 w-3" />
                Total leads
              </span>
              <span className="font-mono font-semibold tabular-nums text-white">
                {stats ? stats.total.toLocaleString() : "…"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Sparkles className="h-3 w-3" />
                Added today
              </span>
              <span className="font-mono font-semibold tabular-nums text-cyan-300">
                {stats ? `+${stats.todayLeads}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Radio className="h-3 w-3" />
                Cron
              </span>
              <span className="font-mono text-[10px] text-emerald-300">*/1 min</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
