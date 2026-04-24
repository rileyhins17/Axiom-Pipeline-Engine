"use client";

import * as React from "react";
import {
  Bot,
  Crosshair,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Target,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
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
    title: "Hunt",
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
    title: "Triage",
    url: "/triage",
    icon: Crosshair,
    shortcut: "Cmd+6",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    shortcut: "Cmd+7",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [stats, setStats] = React.useState<{ total: number; todayLeads: number } | null>(null);

  React.useEffect(() => {
    fetch("/api/leads/stats")
      .then((response) => response.json())
      .then((data) =>
        setStats({
          total: data.total ?? 0,
          todayLeads: data.todayLeads ?? 0,
        }),
      )
      .catch(() => setStats({ total: 0, todayLeads: 0 }));
  }, [pathname]);

  return (
    <Sidebar className="border-r border-white/10 bg-[#050807]">
      <SidebarHeader className="px-3 pb-3 pt-4">
        <Link href={"/dashboard" as Route} className="block">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:border-white/15">
            <BrandMark
              className="w-full justify-center border-none bg-transparent px-0 py-0 shadow-none"
              imageClassName="h-9"
              showBorder={false}
            />
            <div className="mt-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Axiom
              </div>
              <div className="mt-1 text-base font-semibold text-white">Pipeline Engine</div>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url as Route}
                        className={`operator-focus group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                          isActive
                            ? "bg-white/[0.065] text-white"
                            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-100"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-400" />
                        )}
                        <item.icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
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
        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Leads</span>
            <span className="font-mono text-sm text-emerald-400">
              {stats ? stats.total.toLocaleString() : "..."}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Added today:{" "}
            <span className="font-mono text-cyan-400">{stats ? stats.todayLeads : "-"}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
