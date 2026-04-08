"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { SearchTrigger } from "@/components/system/search-trigger";
import { LiveClock } from "@/components/system/live-clock";
import { StatusDots } from "@/components/system/status-dots";
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
        {/* ── command strip header ── */}
        <div className="command-strip sticky top-0 z-40 border-b border-white/[0.04] bg-background/80 backdrop-blur-md">
          <div className="flex h-12 items-center gap-3 px-4 md:px-5">
            {/* left: toggle + breadcrumb */}
            <SidebarTrigger className="text-zinc-600 transition-colors hover:text-white" />
            <div className="h-4 w-px bg-white/[0.06]" />
            <LayoutBreadcrumb />

            {/* right cluster */}
            <div className="ml-auto flex items-center gap-4">
              <StatusDots />
              <div className="h-3 w-px bg-white/[0.06] hidden md:block" />
              <LiveClock />
              <div className="h-3 w-px bg-white/[0.06] hidden md:block" />
              <SearchTrigger />
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <HotkeyProvider>{children}</HotkeyProvider>
        </div>
      </main>
    </SidebarProvider>
  );
}
