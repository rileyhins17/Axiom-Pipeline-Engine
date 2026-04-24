"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Target,
  User,
} from "lucide-react";

const staticRouteMap: Record<
  string,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  "/dashboard": { label: "Dashboard", icon: LayoutDashboard },
  "/hunt": { label: "Lead Generator", icon: Target },
  "/vault": { label: "Vault", icon: Database },
  "/automation": { label: "Automation", icon: Bot },
  "/outreach": { label: "Outreach", icon: MessageSquareText },
  "/settings": { label: "Settings", icon: Settings },
  "/lead/latest": { label: "Latest Lead", icon: User },
};

export function LayoutBreadcrumb() {
  const pathname = usePathname();

  // Static routes hit the map directly.
  const staticRoute = staticRouteMap[pathname];
  if (staticRoute) {
    const Icon = staticRoute.icon;
    return (
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-400/80" />
        <span className="text-sm font-medium text-white">{staticRoute.label}</span>
      </div>
    );
  }

  // Dynamic /lead/[id] — show "Outreach / Lead #123" so users always know the
  // context they drilled in from.
  const leadMatch = pathname?.match(/^\/lead\/(\d+)/);
  if (leadMatch) {
    return (
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-emerald-400/80" />
        <span className="text-sm font-medium text-white">Outreach</span>
        <span className="text-zinc-600">/</span>
        <User className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Lead #{leadMatch[1]}</span>
      </div>
    );
  }

  return <span className="text-sm font-medium text-white">Axiom Pipeline Engine</span>;
}
