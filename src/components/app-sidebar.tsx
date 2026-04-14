"use client";

import * as React from "react";
import Image from "next/image";
import {
  Bot,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Settings,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

/* ─── nav config ─── */

const workspaceItems = [
  {
    title: "Operations",
    url: "/dashboard",
    icon: LayoutDashboard,
    shortcut: "⌘1",
  },
  {
    title: "Source",
    url: "/hunt",
    icon: Target,
    shortcut: "⌘2",
  },
  {
    title: "Records",
    url: "/vault",
    icon: Database,
    shortcut: "⌘3",
  },
  {
    title: "Outbound",
    url: "/automation",
    icon: Bot,
    shortcut: "⌘4",
    /** Shows a live status dot when automation is running */
    liveStatus: true,
  },
  {
    title: "Outreach",
    url: "/outreach",
    icon: MessageSquareText,
    shortcut: "⌘5",
  },
];

const systemItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    shortcut: "⌘6",
  },
];

/* ─── component ─── */

export function AppSidebar() {
  const pathname = usePathname();
  const [stats, setStats] = React.useState<{
    total: number;
    todayLeads: number;
  } | null>(null);
  const [automationActive, setAutomationActive] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    async function loadSidebarState() {
      try {
        const [statsResponse, automationResponse] = await Promise.all([
          fetch("/api/leads/stats", { signal: controller.signal }),
          fetch("/api/outreach/automation/status", { signal: controller.signal }),
        ]);

        const statsPayload = statsResponse.ok
          ? ((await statsResponse.json()) as { total?: number; todayLeads?: number })
          : null;
        const automationPayload = automationResponse.ok
          ? ((await automationResponse.json()) as { masterEnabled?: boolean })
          : null;

        if (!alive) {
          return;
        }

        setStats({
          total: statsPayload?.total ?? 0,
          todayLeads: statsPayload?.todayLeads ?? 0,
        });
        setAutomationActive(automationPayload?.masterEnabled === true);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        if (!alive) {
          return;
        }

        setStats({ total: 0, todayLeads: 0 });
        setAutomationActive(false);
      }
    }

    void loadSidebarState();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [pathname]);

  return (
    <Sidebar className="sidebar-shell border-r border-white/[0.03]">
      {/* ── ambient glow overlay ── */}
      <div className="sidebar-ambient pointer-events-none absolute inset-x-0 top-0 h-36 z-0" />

      {/* ── brand ── */}
      <SidebarHeader className="relative z-10 px-5 pb-5 pt-5">
        <Link
          href={"/dashboard" as Route}
          className="group flex items-center gap-3 px-0.5"
        >
          <div className="sidebar-logo-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105">
            <Image
              src="/axiomtransparentlogo.png"
              alt="Axiom"
              width={120}
              height={32}
              className="h-5 w-auto object-contain select-none brightness-110"
            />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-white/90">
              Axiom
            </div>
            <div className="text-[10px] font-medium tracking-[0.04em] text-zinc-500">
              Pipeline Engine
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="relative z-10 px-3">
        {/* ── workspace nav ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="sidebar-section-label mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {workspaceItems.map((item) => {
                const isActive =
                  pathname === item.url ||
                  (item.url !== "/dashboard" &&
                    pathname.startsWith(item.url + "/"));

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url as Route}
                        className={`sidebar-nav-item group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 ${
                          isActive
                            ? "sidebar-nav-active text-white"
                            : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                        }`}
                      >
                        {/* active accent bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                        )}

                        <item.icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? "text-emerald-400"
                              : "text-zinc-600 group-hover:text-zinc-400"
                          }`}
                        />

                        <span className="flex-1 text-[13px] font-medium">
                          {item.title}
                        </span>

                        {/* live status dot for Outbound */}
                        {"liveStatus" in item && item.liveStatus && (
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
                              automationActive
                                ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)] animate-pulse"
                                : "bg-zinc-600"
                            }`}
                          />
                        )}

                        <span className="text-[10px] font-mono text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100">
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

        {/* ── system nav ── */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="sidebar-section-label mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            System
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {systemItems.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url as Route}
                        className={`sidebar-nav-item group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 ${
                          isActive
                            ? "sidebar-nav-active text-white"
                            : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                        )}
                        <item.icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? "text-emerald-400"
                              : "text-zinc-600 group-hover:text-zinc-400"
                          }`}
                        />
                        <span className="flex-1 text-[13px] font-medium">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100">
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

      {/* ── footer stats widget ── */}
      <SidebarFooter className="relative z-10 p-4">
        <SidebarSeparator className="mb-3 opacity-10" />
        <div className="sidebar-stats-widget rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Pipeline
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                automationActive ? "text-emerald-400" : "text-zinc-600"
              }`}
            >
              <span
                className={`inline-block h-1 w-1 rounded-full ${
                  automationActive ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              {automationActive ? "Active" : "Idle"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-lg font-semibold tracking-tight text-zinc-300">
              {stats ? stats.total.toLocaleString() : "···"}
            </span>
            <span className="text-[10px] text-zinc-600">total leads</span>
          </div>
          {stats && stats.todayLeads > 0 && (
            <div className="mt-1 text-[10px] text-zinc-600">
              +
              <span className="font-mono text-emerald-400/70">
                {stats.todayLeads}
              </span>{" "}
              today
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
