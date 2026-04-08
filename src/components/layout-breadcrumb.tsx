"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { Bot, Database, LayoutDashboard, MessageSquareText, Settings, Target } from "lucide-react";

const routeMap: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  "/dashboard": { label: "Operations", icon: LayoutDashboard },
  "/hunt": { label: "Source", icon: Target },
  "/vault": { label: "Records", icon: Database },
  "/automation": { label: "Outbound", icon: Bot },
  "/outreach": { label: "Outreach", icon: MessageSquareText },
  "/settings": { label: "Settings", icon: Settings },
};

export function LayoutBreadcrumb() {
  const pathname = usePathname();
  const route = routeMap[pathname];

  if (!route)
    return (
      <span className="text-[13px] font-medium text-zinc-500">Axiom</span>
    );

  const Icon = route.icon;

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-zinc-600" />
      <span className="text-[13px] font-medium text-zinc-300">
        {route.label}
      </span>
    </div>
  );
}
