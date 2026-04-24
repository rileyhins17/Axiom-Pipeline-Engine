"use client";

import {
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { HotkeyProvider } from "@/components/system/hotkey-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

const PUBLIC_PATH_PREFIXES = ["/sign-in", "/sign-up"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

type ShellMetrics = {
  active: number;
  blocked: number;
  queued: number;
  ready: number;
  scheduledToday: number;
  todayLeads: number;
  totalLeads: number;
};

function initialsFor(nameOrEmail: string) {
  const cleaned = nameOrEmail.trim();
  if (!cleaned) return "AX";
  const name = cleaned.includes("@") ? cleaned.split("@")[0] || cleaned : cleaned;
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || "A").toUpperCase() + (parts[1]?.[0] || parts[0]?.[1] || "X").toUpperCase();
}

function TopBar({ metrics }: { metrics: ShellMetrics }) {
  const { data: session } = authClient.useSession();
  const displayName = session?.user?.name || session?.user?.email || "Axiom Operator";
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const role = userRole === "admin" ? "Admin" : "Operator";
  const notificationCount = metrics.blocked + metrics.todayLeads;

  return (
    <header className="sticky top-0 z-40 h-[70px] border-b border-[#24313c] bg-[#071018]">
      <div className="flex h-full items-center gap-7 px-6">
        <button className="text-[#b9c2cd] transition-colors hover:text-white" type="button" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>

        <button
          className="flex h-9 min-w-[145px] items-center justify-between rounded-md border border-[#2a3644] bg-[#111b27] px-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          type="button"
        >
          All Workspaces
          <ChevronDown className="h-4 w-4 text-[#8d98a5]" />
        </button>

        <button
          className="flex h-9 min-w-[420px] max-w-[620px] flex-1 items-center gap-3 rounded-md border border-[#2a3644] bg-[#111b27] px-3 text-left text-sm text-[#99a4b0] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          type="button"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1">Search leads, companies, and more...</span>
          <kbd className="rounded border border-[#2a3644] bg-[#182331] px-1.5 py-0.5 font-mono text-[11px] text-[#8d98a5]">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-4">
          <button
            className="flex h-9 items-center gap-2 rounded-md border border-[#17473d] bg-[#0b211f] px-4 text-sm font-medium text-[#62e79f]"
            type="button"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
          <div className="h-7 w-px bg-[#24313c]" />
          <button className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[#24313c] bg-[#111b27] text-[#c7ced7]" type="button" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-[#ef4444] px-1.5 text-[10px] font-semibold text-white">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-md border border-[#24313c] bg-[#111b27] text-[#c7ced7]" type="button" aria-label="Help">
            <CircleHelp className="h-4 w-4" />
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-md border border-[#24313c] bg-[#111b27] text-[#c7ced7]" type="button" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 pl-3">
            <div className="text-right">
              <div className="max-w-32 truncate text-sm font-semibold text-white">{displayName}</div>
              <div className="text-[12px] text-[#8f9aa6]">{role}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#172334] text-sm font-medium text-[#9fb0c7]">
              {initialsFor(displayName)}
            </div>
            <ChevronDown className="h-4 w-4 text-[#8994a1]" />
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomStatusBar({ metrics, syncedAt }: { metrics: ShellMetrics; syncedAt: Date | null }) {
  const activeWork = metrics.active + metrics.queued + metrics.ready;
  const statusLabel = metrics.blocked > 0 ? `${metrics.blocked} blocker${metrics.blocked === 1 ? "" : "s"}` : "All Systems Operational";
  const progress = Math.min(100, Math.round((activeWork / Math.max(metrics.totalLeads, 1)) * 100));
  const syncLabel = syncedAt
    ? syncedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "syncing";

  return (
    <footer className="fixed bottom-0 left-[251px] right-0 z-30 h-[73px] border-t border-[#24313c] bg-[#071018]">
      <div className="grid h-full grid-cols-3 items-center px-9 text-sm">
        <div className="flex items-center gap-3 text-[#9aa5b1]">
          <Settings className="h-4 w-4 text-[#a4afbb]" />
          <span>System Status</span>
          <span className={`h-2 w-2 rounded-full ${metrics.blocked > 0 ? "bg-[#f59e0b]" : "bg-[#62e79f]"}`} />
          <span className={metrics.blocked > 0 ? "text-[#f59e0b]" : "text-[#62e79f]"}>{statusLabel}</span>
        </div>
        <div className="flex items-center justify-center gap-4 text-[#9aa5b1]">
          <Zap className="h-4 w-4 text-[#59c8df]" />
          <span>Pipeline Load</span>
          <span className="text-[#d7dde5]">{activeWork.toLocaleString()} / {Math.max(metrics.totalLeads, 1).toLocaleString()} records</span>
          <div className="h-1.5 w-[286px] overflow-hidden rounded-full bg-[#202b37]">
            <div className="h-full rounded-full bg-[#62e79f]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 text-[#9aa5b1]">
          <RefreshCw className="h-4 w-4" />
          <span>Data Sync</span>
          <span className="text-[#d7dde5]">Last sync: {syncLabel}</span>
          <CheckCircle2 className="h-4 w-4 text-[#62e79f]" />
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [metrics, setMetrics] = useState<ShellMetrics>({
    active: 0,
    blocked: 0,
    queued: 0,
    ready: 0,
    scheduledToday: 0,
    todayLeads: 0,
    totalLeads: 0,
  });
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const shouldLoadMetrics = useMemo(() => !isPublicPath(pathname), [pathname]);

  useEffect(() => {
    if (!shouldLoadMetrics) return;
    let alive = true;

    async function loadMetrics() {
      const [leadStatsResponse, automationResponse] = await Promise.allSettled([
        fetch("/api/leads/stats", { cache: "no-store" }),
        fetch("/api/outreach/automation/overview", { cache: "no-store" }),
      ]);

      if (!alive) return;

      const leadStats =
        leadStatsResponse.status === "fulfilled" && leadStatsResponse.value.ok
          ? await leadStatsResponse.value.json().catch(() => null)
          : null;
      const automation =
        automationResponse.status === "fulfilled" && automationResponse.value.ok
          ? await automationResponse.value.json().catch(() => null)
          : null;

      setMetrics({
        active: Number(automation?.stats?.active ?? 0),
        blocked: Number(automation?.stats?.blocked ?? 0),
        queued: Number(automation?.stats?.queued ?? 0),
        ready: Number(automation?.stats?.ready ?? 0),
        scheduledToday: Number(automation?.stats?.scheduledToday ?? 0),
        todayLeads: Number(leadStats?.todayLeads ?? 0),
        totalLeads: Number(leadStats?.total ?? 0),
      });
      setSyncedAt(new Date());
    }

    void loadMetrics();
    const timer = window.setInterval(() => void loadMetrics(), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [shouldLoadMetrics]);

  if (isPublicPath(pathname)) {
    return (
      <main className="min-h-screen bg-background">
        <div className="p-6 sm:p-8">{children}</div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-screen w-full flex-1 bg-[#0a1119] pb-[73px]">
        <TopBar metrics={metrics} />
        <div className="px-7 py-5">
          <HotkeyProvider>{children}</HotkeyProvider>
        </div>
        <BottomStatusBar metrics={metrics} syncedAt={syncedAt} />
      </main>
    </SidebarProvider>
  );
}
