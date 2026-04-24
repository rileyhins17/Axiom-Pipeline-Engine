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
      className={cn(
        "app-panel rounded-2xl p-4 transition-colors hover:border-white/[0.14]",
        glowClass,
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        <div className={cn("rounded-lg border border-white/[0.08] bg-black/20 p-2 [&>svg]:h-4 [&>svg]:w-4", iconColor)}>{icon}</div>
      </div>
      <div className="text-3xl font-semibold leading-none text-white">{value}</div>
      {subtitle && <div className="mt-2 text-sm text-zinc-500">{subtitle}</div>}
      {trend && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1 text-[11px]",
            trend.value > 0
              ? "text-emerald-400"
              : trend.value < 0
                ? "text-red-400"
                : "text-zinc-500",
          )}
        >
          <span>{trend.value > 0 ? "up" : trend.value < 0 ? "down" : "flat"}</span>
          <span>{Math.abs(trend.value)}</span>
          {trend.label && <span className="text-zinc-500">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
