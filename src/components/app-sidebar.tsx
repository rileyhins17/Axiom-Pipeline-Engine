"use client";

import * as React from "react";
import { Bot, Database, LayoutDashboard, MessageSquareText, Settings, Target } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { fetchJsonWithCache } from "@/lib/client-json-cache";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    shortcut: "Cmd+1",
  },
  {
    title: "Lead Generator",
    url: "/hunt",
    icon: Target,
    shortcut: "Cmd+2",
  },
  {
    title: "Vault",
    url: "/vault",
    icon: Database,
    shortcut: "Cmd+3",
  },
  {
    title: "Automation",
    url: "/automation",
    icon: Bot,
    shortcut: "Cmd+4",
  },
  {
    title: "Outreach",
    url: "/outreach",
    icon: MessageSquareText,
    shortcut: "Cmd+5",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    shortcut: "Cmd+6",
  },
];

const LEAD_STATS_CACHE_KEY = "lead-stats";
const LEAD_STATS_TTL_MS = 60_000;

export function AppSidebar() {
  const pathname = usePathname();
  const [stats, setStats] = React.useState<{ total: number; todayLeads: number } | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    fetchJsonWithCache<{ total?: number; todayLeads?: number }>(
      LEAD_STATS_CACHE_KEY,
      "/api/leads/stats",
      {
        ttlMs: LEAD_STATS_TTL_MS,
        signal: controller.signal,
      },
    )
      .then((data) =>
        setStats({
          total: data.total ?? 0,
          todayLeads: data.todayLeads ?? 0,
        }),
      )
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStats({ total: 0, todayLeads: 0 });
      });

    return () => {
      controller.abort();
    };
  }, [pathname]);

  return (
    <Sidebar className="border-r border-white/[0.04] bg-black">
      <SidebarHeader className="px-4 pb-4 pt-5">
        <Link href={"/dashboard" as Route} className="block">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14]">
            <BrandMark
              className="w-full justify-center border-none bg-transparent px-0 py-0 shadow-none"
              imageClassName="h-10"
              showBorder={false}
            />
            <div className="mt-4 space-y-1 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Axiom
              </div>
              <div className="text-xl font-semibold text-white">Pipeline Engine</div>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {navItems.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url as Route}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all ${
                          isActive
                            ? "bg-emerald-500/10 text-white"
                            : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-emerald-400" />
                        )}
                        <item.icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-white"
                          }`}
                        />
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        <span className="text-[10px] font-mono text-zinc-700 group-hover:text-zinc-500">
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

      <SidebarFooter className="p-4">
        <SidebarSeparator className="mb-4 opacity-30" />
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Leads</span>
            <span className="font-mono text-sm text-emerald-400">
              {stats ? stats.total.toLocaleString() : "..."}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Added today:{" "}
            <span className="font-mono text-cyan-400">{stats ? stats.todayLeads : "—"}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
