"use client";

import React from "react";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor?: string;
  glowClass?: string;
  trend?: { value: number; label?: string };
  className?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  iconColor = "text-emerald-400",
  glowClass,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn("v2-stat group", glowClass, className)}
    >
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</span>
        <div
          className={cn(
            "rounded-lg border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-2 transition-all group-hover:border-emerald-400/25 [&>svg]:h-4 [&>svg]:w-4",
            iconColor,
          )}
        >
          {icon}
        </div>
      </div>
      <div className="relative font-mono text-3xl font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">
        {value}
      </div>
      {subtitle && <div className="relative mt-2 text-sm text-zinc-400">{subtitle}</div>}
      {trend && (
        <div
          className={cn(
            "relative mt-3 inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums",
            trend.value > 0
              ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
              : trend.value < 0
                ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-300"
                : "border-white/[0.08] bg-white/[0.025] text-zinc-400",
          )}
        >
          <span>{trend.value > 0 ? "▲" : trend.value < 0 ? "▼" : "—"}</span>
          <span>{Math.abs(trend.value)}</span>
          {trend.label && <span className="text-zinc-500">· {trend.label}</span>}
        </div>
      )}
    </div>
  );
}
