"use client";

import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { Bot, Database, LayoutDashboard, MessageSquareText, Settings, Target } from "lucide-react";

const routeMap: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  "/dashboard": { label: "Dashboard", icon: LayoutDashboard },
  "/hunt": { label: "Lead Generator", icon: Target },
  "/vault": { label: "Vault", icon: Database },
  "/automation": { label: "Automation", icon: Bot },
  "/outreach": { label: "Outreach", icon: MessageSquareText },
  "/settings": { label: "Settings", icon: Settings },
};

export function LayoutBreadcrumb() {
  const pathname = usePathname();
  const route = routeMap[pathname];

  if (!route) return <span className="text-sm font-medium text-white">Axiom Pipeline Engine</span>;

  const Icon = route.icon;

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-emerald-400/80" />
      <span className="text-sm font-medium text-white">{route.label}</span>
    </div>
  );
}
