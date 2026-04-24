"use client";

import * as React from "react";
import { Bot, Database, LayoutDashboard, MessageSquareText, Settings, Target } from "lucide-react";
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
  { title: "Command", url: "/dashboard", icon: LayoutDashboard, step: "00" },
  { title: "Hunt", url: "/hunt", icon: Target, step: "01" },
  { title: "Vault", url: "/vault", icon: Database, step: "02" },
  { title: "Outreach", url: "/outreach", icon: MessageSquareText, step: "03" },
  { title: "Automation", url: "/automation", icon: Bot, step: "04" },
  { title: "Settings", url: "/settings", icon: Settings, step: "99" },
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
    <Sidebar className="border-r border-white/[0.08] bg-[#07090d]">
      <SidebarHeader className="px-4 pb-3 pt-5">
        <Link href={"/dashboard" as Route} className="block rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 transition-colors hover:border-white/[0.14]">
          <BrandMark
            className="w-full justify-center border-none bg-transparent px-0 py-0 shadow-none"
            imageClassName="h-8"
            showBorder={false}
          />
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Axiom
              </div>
              <div className="mt-1 text-sm font-semibold text-white">Pipeline Engine</div>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-mono text-emerald-200">
              Live
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
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
                        className={`group relative grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                          isActive
                            ? "bg-white/[0.075] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            : "text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                            isActive
                              ? "border-emerald-400/20 bg-emerald-400/10"
                              : "border-white/[0.06] bg-black/20"
                          }`}
                        >
                          <item.icon
                            className={`h-4 w-4 ${
                              isActive ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-300"
                            }`}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="block text-[10px] text-zinc-600">
                            {item.title === "Command" ? "Overview" : "Pipeline step"}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-zinc-700 group-hover:text-zinc-500">
                          {item.step}
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
        <div className="app-panel-quiet rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Lead base</span>
            <span className="font-mono text-sm text-emerald-300">
              {stats ? stats.total.toLocaleString() : "..."}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Added today</span>
            <span className="font-mono text-cyan-300">{stats ? stats.todayLeads : "-"}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
