"use client";

import { MessageSquareText, User } from "lucide-react";
import { usePathname } from "next/navigation";

import { getNavItemForPath } from "@/lib/navigation";

export function LayoutBreadcrumb() {
  const pathname = usePathname();
  const route = getNavItemForPath(pathname);

  if (pathname?.match(/^\/lead\/\d+/)) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <MessageSquareText className="size-4 text-emerald-300" />
        <span className="font-medium text-white">Lead Dossier</span>
        <span className="text-zinc-600">/</span>
        <User className="size-4 text-zinc-500" />
        <span className="font-medium text-zinc-300">Record</span>
      </div>
    );
  }

  if (route) {
    const Icon = route.icon;
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-emerald-300" />
        <span className="truncate font-medium text-white">{route.label}</span>
        <span className="hidden truncate text-zinc-500 md:inline">{route.description}</span>
      </div>
    );
  }

  return <span className="text-sm font-medium text-white">Axiom Pipeline Engine</span>;
}
