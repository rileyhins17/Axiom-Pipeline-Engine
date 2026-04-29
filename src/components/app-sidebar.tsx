"use client";

import * as React from "react";
import { Activity, Building2, CheckCircle2, Database, Radio } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { APP_NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/leads/stats");
        const data = await response.json();
        setStats({
          total: data.total ?? 0,
          todayLeads: data.todayLeads ?? 0,
          readyForTouch: data.readyForTouch,
          followUp: data.followUp,
          replied: data.replied,
        });
      } catch {
        setStats({ total: 0, todayLeads: 0 });
      }
    };

    // Fetch immediately on mount or when pathname changes
    fetchStats();

    // Poll every 10 seconds for real-time updates
    const interval = setInterval(fetchStats, 10000);

    return () => clearInterval(interval);
  }, [pathname]);

  return (
    <Sidebar className="v2-sidebar">
      <SidebarHeader className="border-b border-white/[0.08] px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <BrandMark
            className="h-10 justify-start border-0 bg-transparent p-0"
            imageClassName="h-9"
            priority
            showBorder={false}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <div className="mb-2.5 flex items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Workspace
            </span>
            <span className="text-[10px] font-mono text-zinc-600">⌘K</span>
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {APP_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`);
                const badgeValue = item.badgeKey && stats ? stats[item.badgeKey] ?? 0 : 0;
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.url}
                        data-active={isActive ? "true" : "false"}
                        className={cn(
                          "v2-nav-item group flex items-center gap-3 px-3 py-2.5 text-sm",
                          isActive ? "text-emerald-100" : "text-zinc-400 hover:text-white",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0 transition-colors",
                            isActive ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-200",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                        {badgeValue > 0 ? (
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                              isActive
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                                : "border-white/[0.09] bg-black/30 text-zinc-300",
                            )}
                          >
                            {badgeValue > 99 ? "99+" : badgeValue}
                          </span>
                        ) : null}
                        <span className="font-mono text-[10px] text-zinc-600 group-hover:text-zinc-500">
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

      <SidebarFooter className="border-t border-white/[0.08] p-3">
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.025] to-black/30">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-md border border-emerald-400/25 bg-emerald-400/10">
                <Building2 className="size-3.5 text-emerald-300" />
              </div>
              <div className="leading-tight">
                <div className="text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">Workspace</div>
                <div className="text-xs font-semibold text-zinc-100">Axiom Sales CA</div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-zinc-600">prod</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
            <SidebarStat
              icon={<Database className="size-3.5" />}
              label="Leads"
              value={stats ? stats.total.toLocaleString() : "--"}
            />
            <SidebarStat
              icon={<Activity className="size-3.5" />}
              label="Today"
              value={stats ? `+${stats.todayLeads}` : "--"}
              accent
            />
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="size-3.5" />
              Healthy
            </span>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Radio className="size-3.5 animate-pulse text-emerald-400/70" />
              Live
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarStat({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-sm font-semibold tabular-nums",
          accent ? "text-emerald-300" : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
}
