"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { SearchTrigger } from "@/components/system/search-trigger";
import { HotkeyProvider } from "@/components/system/hotkey-provider";
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
      <main className="min-h-screen w-full flex-1 bg-background">
        {/* Sticky top bar — slightly taller, richer, with live engine status
            pill that doubles as a quick-glance indicator the worker is up. */}
        <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-4 px-4 md:px-6">
            <SidebarTrigger className="text-zinc-500 transition-colors hover:text-white" />
            <div className="h-4 w-px bg-white/[0.08]" />
            <LayoutBreadcrumb />
            <div className="ml-auto flex items-center gap-3">
              {/* Live status pill */}
              <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 md:inline-flex">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Live
                </span>
              </div>
              <SearchTrigger />
            </div>
          </div>
        </div>

        <div className="px-4 py-6 md:px-8 md:py-8">
          <HotkeyProvider>{children}</HotkeyProvider>
        </div>
      </main>
    </SidebarProvider>
  );
}
