"use client";

import { MessageSquareText, User } from "lucide-react";
import { usePathname } from "next/navigation";

import { getNavItemForPath } from "@/lib/navigation";

export function LayoutBreadcrumb() {
  const pathname = usePathname();
  const route = getNavItemForPath(pathname);

  if (pathname?.match(/^\/lead\/\d+/)) {
    return (
      <div className="flex items-center gap-2.5 text-sm">
        <div className="grid size-7 place-items-center rounded-md border border-emerald-400/25 bg-emerald-400/10">
          <MessageSquareText className="size-3.5 text-emerald-300" />
        </div>
        <span className="font-semibold text-white tracking-tight">Lead Dossier</span>
        <span className="text-zinc-700">›</span>
        <span className="flex items-center gap-1.5 text-zinc-400">
          <User className="size-3.5" />
          Record
        </span>
      </div>
    );
  }

  if (route) {
    const Icon = route.icon;
    return (
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <div className="grid size-7 shrink-0 place-items-center rounded-md border border-emerald-400/25 bg-emerald-400/10">
          <Icon className="size-3.5 text-emerald-300" />
        </div>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate font-semibold text-white tracking-tight">{route.label}</span>
          <span className="hidden truncate text-[12px] text-zinc-500 md:inline">{route.description}</span>
        </div>
      </div>
    );
  }

  return <span className="text-sm font-semibold tracking-tight text-white">Axiom Pipeline Engine</span>;
}
