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
        "hidden items-center gap-1 rounded-full border border-white/[0.09] bg-gradient-to-b from-white/[0.025] to-black/20 p-1 backdrop-blur lg:flex",
        compact && "gap-1.5 flex-col rounded-xl p-1.5",
      )}
    >
      {workflow.map((item, idx) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            className={cn(
              "workflow-node group relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-all",
              active
                ? "bg-gradient-to-b from-white/[0.1] to-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
              compact && "w-full justify-start rounded-lg px-3",
            )}
          >
            <span className="relative flex items-center justify-center">
              <item.icon
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  active ? item.color : "text-zinc-500 group-hover:text-zinc-300",
                )}
              />
              {active && (
                <span className="absolute -inset-1 rounded-full bg-current opacity-10 blur-sm" />
              )}
            </span>
            <span className="font-medium tracking-tight">{item.label}</span>
            {!compact && (
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  active ? "text-zinc-400" : "text-zinc-600",
                )}
              >
                0{idx + 1}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
