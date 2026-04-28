"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "@/components/app-sidebar";
import { LayoutBreadcrumb } from "@/components/layout-breadcrumb";
import { SearchTrigger } from "@/components/system/search-trigger";
import { HotkeyProvider } from "@/components/system/hotkey-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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
  const [session, setSession] = useState<ShellSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((result) => {
      setSession(result.data);
      setLoading(false);
    });
  }, []);

  if (isPublicPath(pathname)) {
    return (
      <main className="min-h-screen bg-background">
        <div className="p-6 sm:p-8">{children}</div>
      </main>
    );
  }

  // Display name is derived from the live session email (local part,
  // capitalized) — never from the stored User.name. This prevents the
  // header from showing a stale name like "Riley Hinsperger" when a
  // different user is logged in. Initials follow the same source.
  const sessionEmail = session?.user?.email ?? "";
  const localPart = sessionEmail.split("@")[0] ?? "";
  const displayName = localPart
    ? localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase()
    : "";
  const initials = (() => {
    if (!displayName) return sessionEmail?.[0]?.toUpperCase() ?? "?";
    return displayName.slice(0, 2).toUpperCase();
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
              <button
                type="button"
                aria-label="Settings"
                onClick={() => router.push("/settings")}
                className="v2-focus-ring relative flex size-9 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.025] text-zinc-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white cursor-pointer"
              >
                <Settings className="size-4" />
              </button>
            </div>
            <div className="hidden items-center gap-3 pl-2 lg:flex">
              <div className="text-right leading-tight">
                <div className="text-xs font-semibold text-white">
                  {loading ? "Loading…" : displayName || sessionEmail || "User"}
                </div>
                <div className="font-mono text-[10.5px] text-zinc-500">
                  {sessionEmail || "—"}
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
              <span className="text-emerald-300">Autonomous · cron every 60s</span>
            </div>
            <div className="flex items-center gap-5 font-mono text-[10.5px] tabular-nums text-zinc-500">
              <span className="hidden md:inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-emerald-400" />
                v3.0 · autonomous
              </span>
            </div>
          </div>
        </footer>
      </main>
    </SidebarProvider>
  );
}
