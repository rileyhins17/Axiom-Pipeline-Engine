"use client";

import { Bell, CheckCircle2, HelpCircle, Plus, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { SearchTrigger } from "@/components/system/search-trigger";
import { HotkeyProvider } from "@/components/system/hotkey-provider";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const PUBLIC_PATH_PREFIXES = ["/sign-in", "/sign-up"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
      <main className="flex min-h-screen w-full flex-1 flex-col bg-background">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#08111a]/95 backdrop-blur-xl">
          <div className="flex h-[70px] items-center gap-3 px-4 md:px-6">
            <SidebarTrigger className="text-zinc-500 transition-colors hover:text-white" />
            <div className="hidden h-5 w-px bg-white/[0.08] md:block" />
            <div className="min-w-0 flex-1">
              <LayoutBreadcrumb />
            </div>
            <SearchTrigger />
            <div className="hidden items-center gap-2 md:flex">
              <Button size="sm" className="h-9 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-black hover:bg-emerald-300">
                <Plus className="size-4" />
                New
              </Button>
              <span className="h-7 w-px bg-white/[0.08]" />
              <IconButton label="Notifications">
                <Bell className="size-4" />
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  12
                </span>
              </IconButton>
              <IconButton label="Help">
                <HelpCircle className="size-4" />
              </IconButton>
              <IconButton label="Settings">
                <Settings className="size-4" />
              </IconButton>
            </div>
            <div className="hidden items-center gap-3 pl-2 lg:flex">
              <div className="text-right">
                <div className="text-xs font-semibold text-white">Alex Morgan</div>
                <div className="text-[11px] text-zinc-500">Admin</div>
              </div>
              <div className="flex size-9 items-center justify-center rounded-full bg-[#111d2b] text-xs font-semibold text-cyan-200">
                AM
              </div>
            </div>
          </div>
        </header>

        <HotkeyProvider>
          <div className="flex-1 px-4 py-5 md:px-7">{children}</div>
        </HotkeyProvider>

        <footer className="sticky bottom-0 z-30 border-t border-white/[0.08] bg-[#071017]/95 px-4 py-3 backdrop-blur md:px-7">
          <div className="flex flex-col gap-2 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-300" />
              <span className="font-medium text-zinc-300">System Status</span>
              <span className="text-emerald-300">All systems operational</span>
            </div>
            <div className="flex items-center gap-6">
              <span>API Usage 2,450 / 10,000 calls</span>
              <span>Data Sync · last sync 2 min ago</span>
            </div>
          </div>
        </footer>
      </main>
    </SidebarProvider>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative flex size-9 items-center justify-center rounded-md border border-white/[0.1] bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </button>
  );
}
