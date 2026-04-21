"use client";

import * as React from "react";
import {
  Activity,
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
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
  badge?: "live" | "new";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, shortcut: "⌘1" },
      { title: "Ops", url: "/ops", icon: Activity, shortcut: "⌘0", badge: "new" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { title: "Lead Generator", url: "/hunt", icon: Target, shortcut: "⌘2" },
      { title: "Vault", url: "/vault", icon: Database, shortcut: "⌘3" },
      { title: "Automation", url: "/automation", icon: Bot, shortcut: "⌘4" },
      { title: "Outreach", url: "/outreach", icon: MessageSquareText, shortcut: "⌘5" },
    ],
  },
  {
    label: "System",
    items: [{ title: "Settings", url: "/settings", icon: Settings, shortcut: "⌘6" }],
  },
];

type OpsHealth = {
  status: "healthy" | "warning" | "danger" | "idle";
  lastRunAgoMinutes: number | null;
  sentToday: number;
  readyLeads: number;
  totalLeads: number;
  todayLeads: number;
};

const HEALTH_TONE: Record<OpsHealth["status"], { dot: string; label: string; color: string }> = {
  healthy: { dot: "healthy", label: "Healthy", color: "text-emerald-400" },
  warning: { dot: "warning", label: "Degraded", color: "text-amber-400" },
  danger: { dot: "danger", label: "Unhealthy", color: "text-rose-400" },
  idle: { dot: "idle", label: "Idle", color: "text-zinc-500" },
};

export function AppSidebar() {
  const pathname = usePathname();
  const [health, setHealth] = React.useState<OpsHealth | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ops/health");
        if (!res.ok) throw new Error("health fetch failed");
        const data = (await res.json()) as OpsHealth;
        if (!cancelled) setHealth(data);
      } catch {
        // Fallback: legacy stats endpoint (pre-2.0 deploys)
        try {
          const fallback = await fetch("/api/leads/stats").then((r) => r.json());
          if (!cancelled) {
            setHealth({
              status: "idle",
              lastRunAgoMinutes: null,
              sentToday: 0,
              readyLeads: 0,
              totalLeads: fallback.total ?? 0,
              todayLeads: fallback.todayLeads ?? 0,
            });
          }
        } catch {
          if (!cancelled)
            setHealth({
              status: "idle",
              lastRunAgoMinutes: null,
              sentToday: 0,
              readyLeads: 0,
              totalLeads: 0,
              todayLeads: 0,
            });
        }
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  const tone = HEALTH_TONE[health?.status ?? "idle"];

  return (
    <Sidebar className="border-r border-white/[0.04] bg-[oklch(0.06_0.008_160)]">
      <SidebarHeader className="px-3 pb-3 pt-4">
        <Link href={"/dashboard" as Route} className="block">
          <div className="surface-raised flex items-center gap-3 px-3 py-3 transition-colors hover:border-white/[0.14]">
            <BrandMark
              className="justify-center border-none bg-transparent px-0 py-0 shadow-none"
              imageClassName="h-8"
              showBorder={false}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Axiom
              </span>
              <span className="truncate text-sm font-semibold text-white">Pipeline Engine</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navSections.map((section) => (
          <SidebarGroup key={section.label} className="pb-1 pt-2">
            <div className="mb-1 px-3">
              <span className="section-label">{section.label}</span>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          href={item.url as Route}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                            isActive
                              ? "bg-emerald-400/[0.08] text-white"
                              : "text-zinc-400 hover:bg-white/[0.03] hover:text-white",
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-emerald-400" />
                          )}
                          <item.icon
                            className={cn(
                              "h-[15px] w-[15px] shrink-0",
                              isActive
                                ? "text-emerald-400"
                                : "text-zinc-500 group-hover:text-zinc-200",
                            )}
                          />
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.badge === "new" && (
                            <span className="rounded-sm bg-emerald-400/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                              New
                            </span>
                          )}
                          <span className="hidden text-[10px] font-mono text-zinc-600 group-hover:text-zinc-400 md:inline">
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
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarSeparator className="mb-3 opacity-30" />
        <Link href={"/ops" as Route} className="block">
          <div className="surface surface-hover px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="status-dot" data-state={tone.dot} />
                <span className={cn("text-[11px] font-semibold", tone.color)}>{tone.label}</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Pulse</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-zinc-500">
              <div>
                <div className="kpi-value text-[13px] text-white">
                  {health ? health.totalLeads.toLocaleString() : "—"}
                </div>
                <div>Leads</div>
              </div>
              <div>
                <div className="kpi-value text-[13px] text-emerald-300">
                  {health ? health.sentToday : "—"}
                </div>
                <div>Sent today</div>
              </div>
              <div>
                <div className="kpi-value text-[13px] text-cyan-300">
                  {health ? health.readyLeads : "—"}
                </div>
                <div>Ready</div>
              </div>
            </div>
          </div>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
