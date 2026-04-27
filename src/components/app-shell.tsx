"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { Route } from "next";
import {
  Bell,
  BellRing,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  DatabaseZap,
  MailPlus,
  Play,
  Plus,
  Rocket,
  Settings,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { SearchTrigger } from "@/components/system/search-trigger";
import { HotkeyProvider } from "@/components/system/hotkey-provider";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/components/ui/toast-provider";

const PUBLIC_PATH_PREFIXES = ["/sign-in", "/sign-up"];

type ShellSession = {
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
} | null;

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [session, setSession] = useState<ShellSession>(null);
  const [loading, setLoading] = useState(true);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);

  useEffect(() => {
    authClient.getSession().then((result) => {
      setSession(result.data);
      setLoading(false);
    });
  }, []);

  const closeMenus = () => {
    setNewMenuOpen(false);
    setNotificationsOpen(false);
  };

  const go = (href: Route) => {
    closeMenus();
    router.push(href);
  };

  const handleRunAutomation = async () => {
    closeMenus();
    setAutomationBusy(true);
    try {
      const res = await fetch("/api/outreach/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Automation run failed");
      const parts = [
        data?.fastForwarded ? `${data.fastForwarded} readied` : null,
        data?.pipeline?.queued ? `${data.pipeline.queued} queued` : null,
        typeof data?.sent === "number" ? `${data.sent} sent` : null,
      ].filter(Boolean);
      toast(parts.length > 0 ? parts.join(", ") : "Automation checked the queue.", {
        type: "success",
        icon: "note",
      });
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Automation run failed", {
        type: "error",
        icon: "note",
      });
    } finally {
      setAutomationBusy(false);
    }
  };

  const handleSettingsClick = () => router.push("/settings");

  if (isPublicPath(pathname)) {
    return (
      <main className="min-h-screen bg-background">
        <div className="p-6 sm:p-8">{children}</div>
      </main>
    );
  }

  const initials = (() => {
    if (!session?.user?.name) return session?.user?.email?.[0]?.toUpperCase() ?? "?";
    return session.user.name
      .split(" ")
      .map((word: string) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  })();

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex min-h-screen w-full flex-1 flex-col bg-background">
        <header className="v2-header sticky top-0 z-40">
          <div className="flex h-[64px] items-center gap-3 px-4 md:px-6">
            <SidebarTrigger className="v2-focus-ring rounded-md text-zinc-400 transition-colors hover:text-white" />
            <div className="hidden h-5 w-px bg-white/[0.08] md:block" />
            <div className="min-w-0 flex-1">
              <LayoutBreadcrumb />
            </div>
            <SearchTrigger />
            <div className="hidden items-center gap-2 md:flex">
              <div className="relative">
                <Button
                  size="sm"
                  onClick={() => {
                    setNewMenuOpen((open) => !open);
                    setNotificationsOpen(false);
                  }}
                  className="v2-btn-primary v2-focus-ring h-9 rounded-lg px-3.5 text-sm cursor-pointer"
                  aria-expanded={newMenuOpen}
                  aria-haspopup="menu"
                >
                  <Plus className="size-4" />
                  New
                  <ChevronDown className="size-3.5 opacity-80" />
                </Button>
                {newMenuOpen ? (
                  <ActionMenu align="right" label="New actions">
                    <MenuAction icon={Rocket} title="Start lead hunt" detail="Scrape and score a new batch." onClick={() => go("/hunt")} />
                    <MenuAction icon={DatabaseZap} title="Enrich new leads" detail="Open leads waiting for AI enrichment." onClick={() => go("/outreach?stage=new")} />
                    <MenuAction icon={MailPlus} title="Queue outreach" detail="Review send-ready Gmail prospects." onClick={() => go("/outreach?stage=ready")} />
                    <MenuAction icon={Play} title={automationBusy ? "Running automation" : "Run automation now"} detail="Queue and send due first touches." onClick={() => void handleRunAutomation()} disabled={automationBusy} />
                  </ActionMenu>
                ) : null}
              </div>
              <span className="h-6 w-px bg-white/[0.08]" />
              <div className="relative">
                <IconButton
                  label="Notifications"
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setNewMenuOpen(false);
                  }}
                >
                  <Bell className="size-4" />
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-[#0a111c] bg-amber-500 px-1 text-[9px] font-semibold leading-none text-black">
                    3
                  </span>
                </IconButton>
                {notificationsOpen ? (
                  <ActionMenu align="right" label="Notifications">
                    <MenuAction icon={BellRing} title="Queue overview" detail="See what automation will send next." onClick={() => go("/automation?tab=queue")} />
                    <MenuAction icon={CircleAlert} title="Issue review" detail="Blocked sequences and mailbox problems." onClick={() => go("/automation?tab=blocked")} />
                    <MenuAction icon={MailPlus} title="Connect Gmail" detail="Add or verify sender inboxes." onClick={() => go("/settings")} />
                  </ActionMenu>
                ) : null}
              </div>
              <IconButton label="Settings" onClick={handleSettingsClick}>
                <Settings className="size-4" />
              </IconButton>
            </div>
            <div className="hidden items-center gap-3 pl-2 lg:flex">
              <div className="text-right leading-tight">
                <div className="text-xs font-semibold text-white">
                  {loading ? "Loading…" : session?.user?.name || session?.user?.email || "User"}
                </div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
                  {session?.user?.role
                    ? session.user.role.charAt(0).toUpperCase() + session.user.role.slice(1)
                    : "Member"}
                </div>
              </div>
              <div className="relative flex size-9 items-center justify-center rounded-full border border-emerald-400/30 bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 text-xs font-semibold text-emerald-100">
                {initials}
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#06101a] bg-emerald-400" />
              </div>
            </div>
          </div>
        </header>

        <HotkeyProvider>
          <div className="flex-1 px-4 py-6 md:px-7 md:py-7">{children}</div>
        </HotkeyProvider>

        <footer className="v2-footer sticky bottom-0 z-30 px-4 py-2.5 md:px-7">
          <div className="flex flex-col gap-2 text-[11px] text-zinc-500 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className="v2-dot text-emerald-400" />
              <span className="font-medium uppercase tracking-[0.14em] text-zinc-400">Status</span>
              <span className="text-emerald-300">All systems operational</span>
            </div>
            <div className="flex items-center gap-5 font-mono text-[10.5px] tabular-nums text-zinc-500">
              <span>API · 2,450 / 10,000</span>
              <span className="hidden md:inline">Sync · 2 min ago</span>
              <span className="hidden md:inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-emerald-400" />
                v2.0
              </span>
            </div>
          </div>
        </footer>
      </main>
    </SidebarProvider>
  );
}

function ActionMenu({
  children,
  label,
}: {
  children: React.ReactNode;
  align?: "right";
  label: string;
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur"
    >
      {children}
    </div>
  );
}

function MenuAction({
  icon: Icon,
  title,
  detail,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-emerald-300">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{detail}</span>
      </span>
    </button>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="v2-focus-ring relative flex size-9 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] text-zinc-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white cursor-pointer"
    >
      {children}
    </button>
  );
}
