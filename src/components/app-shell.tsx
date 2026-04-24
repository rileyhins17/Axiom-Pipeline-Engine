"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { AppWorkflowRail } from "@/components/app-workflow-rail";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { EngineStatusBar } from "@/components/system/engine-status-bar";
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
      <main className="min-h-screen w-full flex-1">
        <div className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0b0d12]/88 backdrop-blur-2xl">
          <div className="flex min-h-16 items-center gap-3 px-4 py-2 md:px-6">
            <SidebarTrigger className="text-muted-foreground transition-colors hover:text-white" />
            <div className="min-w-0">
              <LayoutBreadcrumb />
              <div className="mt-0.5 hidden text-[11px] text-zinc-600 sm:block">
                Connected lead sourcing, qualification, outreach, and follow-up.
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <EngineStatusBar />
              <AppWorkflowRail />
              <SearchTrigger />
            </div>
          </div>
        </div>
        <div className="px-4 py-6 md:px-6 lg:px-8">
          <HotkeyProvider>{children}</HotkeyProvider>
        </div>
      </main>
    </SidebarProvider>
  );
}
