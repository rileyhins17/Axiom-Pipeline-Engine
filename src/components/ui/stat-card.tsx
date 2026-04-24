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
        "rounded-xl border border-white/10 bg-white/[0.025] p-4",
        glowClass,
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <div className={cn("[&>svg]:h-4 [&>svg]:w-4", iconColor)}>{icon}</div>
      </div>
      <div className={cn("text-3xl font-semibold leading-none", iconColor)}>{value}</div>
      {subtitle && <div className="mt-2 text-sm leading-5 text-muted-foreground">{subtitle}</div>}
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
