"use client";

import { Bot, Database, MailCheck, Radar } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const workflow = [
  {
    label: "Hunt",
    href: "/hunt",
    detail: "Source",
    icon: Radar,
    color: "text-cyan-300",
  },
  {
    label: "Vault",
    href: "/vault",
    detail: "Verify",
    icon: Database,
    color: "text-emerald-300",
  },
  {
    label: "Outreach",
    href: "/outreach",
    detail: "Send",
    icon: MailCheck,
    color: "text-amber-300",
  },
  {
    label: "Automation",
    href: "/automation",
    detail: "Follow up",
    icon: Bot,
    color: "text-blue-300",
  },
] as const;

export function AppWorkflowRail({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Pipeline workflow"
      className={cn(
        "hidden items-center gap-5 rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 backdrop-blur lg:flex",
        compact && "gap-2 rounded-xl px-2 py-2",
      )}
    >
      {workflow.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            className={cn(
              "workflow-node flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs transition-colors",
              active ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",
              compact && "w-full justify-start rounded-lg px-3",
            )}
          >
            <item.icon className={cn("h-3.5 w-3.5", active ? item.color : "text-zinc-500")} />
            <span className="font-medium">{item.label}</span>
            {!compact && <span className="text-[10px] text-zinc-600">{item.detail}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
