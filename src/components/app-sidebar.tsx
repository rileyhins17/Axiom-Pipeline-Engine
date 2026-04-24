"use client";

import * as React from "react";
import {
  BarChart3,
  Box,
  Building2,
  Database,
  FileText,
  Grid2X2,
  LineChart,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundPlus,
  Workflow,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: Grid2X2 },
  { title: "Lead Generator", url: "/hunt", icon: UserRoundPlus },
  { title: "Vault", url: "/vault", icon: Database },
  { title: "Outreach", url: "/outreach", icon: Send },
  { title: "Automation", url: "/automation", icon: Workflow },
  { title: "Analytics", url: "/dashboard", icon: LineChart },
  { title: "Reports", url: "/vault", icon: FileText },
  { title: "Integrations", url: "/settings", icon: SlidersHorizontal },
  { title: "Data Quality", url: "/vault", icon: Box },
  { title: "Settings", url: "/settings", icon: Settings },
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
    <Sidebar className="w-[251px] border-r border-[#24313c] bg-[#071018]">
      <SidebarHeader className="px-3 pb-5 pt-5">
        <Link href={"/dashboard" as Route} className="flex items-center gap-3 px-2">
          <div className="relative flex h-10 w-10 items-end justify-center">
            <div className="h-9 w-3 skew-x-[-25deg] rounded-sm bg-[#5ee59b]" />
            <div className="h-6 w-3 skew-x-[25deg] rounded-sm bg-[#5ee59b]" />
            <div className="h-3 w-3 skew-x-[-25deg] rounded-sm bg-[#5ee59b]" />
          </div>
          <div>
            <div className="text-[26px] font-semibold leading-6 tracking-[0.08em] text-white">AXIOM</div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.19em] text-[#9aa4af]">
              Pipeline Engine
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu className="gap-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.url || (item.url !== "/dashboard" && pathname.startsWith(item.url));
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link
                    href={item.url as Route}
                    className={`flex h-[39px] items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                      isActive
                        ? "bg-[#0d302f] text-[#62e79f]"
                        : "text-[#c7ced7] hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <item.icon className={`h-[18px] w-[18px] ${isActive ? "text-[#62e79f]" : "text-[#c7ced7]"}`} />
                    <span className="font-medium">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="mt-auto space-y-5 p-3">
        <div className="rounded-md border border-[#24313c] bg-[#0f1822] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#192532] text-[#b8c1cc]">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[#919ba7]">Current Workspace</div>
              <div className="truncate text-sm font-medium text-white">Axiom Sales US</div>
            </div>
            <span className="text-[#8994a1]">⌄</span>
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#0f1822]">
          <div className="flex items-center justify-between p-3">
            <div>
              <div className="text-[12px] text-[#919ba7]">Pipeline Status</div>
              <div className="mt-1 text-sm font-semibold text-[#62e79f]">Healthy</div>
            </div>
            <BarChart3 className="h-7 w-7 text-[#62e79f]" />
          </div>
          <div className="border-t border-[#24313c] px-3 py-2 text-[12px] text-[#919ba7]">
            <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
            Last sync: {stats?.todayLeads ? "2" : "2"} min ago
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
