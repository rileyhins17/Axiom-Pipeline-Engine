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
    <Sidebar className="border-r border-white/[0.08] bg-[#071017]">
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
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Workspace
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
                        className={cn(
                          "group relative flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                          isActive
                            ? "border-emerald-400/20 bg-emerald-400/[0.09] text-emerald-100"
                            : "border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-white",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            isActive ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-300",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                        {badgeValue > 0 ? (
                          <span className="rounded border border-white/[0.1] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            {badgeValue > 99 ? "99+" : badgeValue}
                          </span>
                        ) : null}
                        <span className="font-mono text-[10px] text-zinc-600">{item.shortcut}</span>
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
        <div className="rounded-md border border-white/[0.08] bg-black/20">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-zinc-500" />
              <div>
                <div className="text-[10px] text-zinc-500">Current Workspace</div>
                <div className="text-xs font-medium text-zinc-100">Axiom Sales US</div>
              </div>
            </div>
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
            />
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="size-3.5" />
              Healthy
            </span>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Radio className="size-3.5" />
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
