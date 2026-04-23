"use client";

/**
 * Shared primitives for the Automation console.
 *
 * Design rules applied (UI/UX Pro Max):
 *  - No layout-shifting hover transforms (color / border / bg only).
 *  - cursor-pointer on every interactive surface.
 *  - focus-visible rings for keyboard nav (never removed).
 *  - Consistent spacing scale (4 / 5 / 6) and radius (rounded-xl).
 *  - Border opacity >= 10% so surfaces stay visible in high-light environments.
 *  - Sentence case; no shouty UPPERCASE labels on CTAs.
 */

import { cn } from "@/lib/utils";
import type React from "react";

/** Panel — the base surface for every automation section. */
export function Panel({
  className,
  children,
  tone = "default",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "accent" | "warn" | "success";
}) {
  const toneCls =
    tone === "accent"
      ? "border-emerald-400/20 bg-emerald-500/[0.03]"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-500/[0.03]"
      : tone === "success"
      ? "border-emerald-400/20 bg-emerald-500/[0.04]"
      : "border-white/10 bg-white/[0.02]";
  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border p-5 transition-colors duration-200",
        toneCls,
        className
      )}
    >
      {children}
    </div>
  );
}

/** Section header used inside a Panel — sentence case, compact, with optional lead icon. */
export function SectionHeader({
  icon: Icon,
  title,
  hint,
  action,
  tone = "default",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "accent" | "warn";
}) {
  const iconTone =
    tone === "accent"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-amber-400"
      : "text-zinc-400";
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          {Icon ? <Icon className={cn("h-4 w-4", iconTone)} /> : null}
          <span>{title}</span>
        </h3>
        {hint ? (
          <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A single cell in the top-of-page stats strip. */
export function StatCell({
  label,
  value,
  tone = "default",
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warn" | "success";
  emphasis?: boolean;
}) {
  const valueCls =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-zinc-100";
  return (
    <div className="flex flex-col gap-0.5 border-white/5 px-4 py-3 first:border-l-0 sm:border-l">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "text-lg font-semibold" : "text-sm font-medium",
          valueCls
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Accessible toggle switch. Uses role="switch" + aria-checked per WAI-ARIA APG.
 * No layout-shifting transforms; only color/opacity/left transitions.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={description ? `${label}-desc` : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
        "border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "border-emerald-400/40 bg-emerald-500/80"
          : "border-white/10 bg-zinc-800"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out",
          checked ? "left-[calc(100%-1.125rem)]" : "left-0.5"
        )}
      />
    </button>
  );
}

/** Tiny inline status dot with aria-hidden and a label slot. */
export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: "emerald" | "amber" | "cyan" | "rose" | "zinc";
  pulse?: boolean;
  className?: string;
}) {
  const color =
    tone === "emerald"
      ? "bg-emerald-400"
      : tone === "amber"
      ? "bg-amber-400"
      : tone === "cyan"
      ? "bg-cyan-400"
      : tone === "rose"
      ? "bg-rose-400"
      : "bg-zinc-500";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        color,
        pulse && "animate-pulse",
        className
      )}
    />
  );
}

/** Shorthand Chip for status badges — uses aria-label if icon-only is ever needed. */
export function Chip({
  tone = "zinc",
  children,
  className,
}: {
  tone?: "emerald" | "amber" | "cyan" | "rose" | "zinc" | "blue";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-300",
    zinc: "border-white/15 bg-white/[0.04] text-zinc-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Subtle horizontal separator that doesn't fight the surface. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-white/5", className)} aria-hidden="true" />;
}
