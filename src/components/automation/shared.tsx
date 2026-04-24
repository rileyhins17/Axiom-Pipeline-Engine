"use client";

import { cn } from "@/lib/utils";
import type React from "react";

/** Base command-center surface for automation sections. */
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
      ? "border-emerald-400/20 bg-emerald-500/[0.035]"
      : tone === "warn"
      ? "border-amber-400/25 bg-amber-500/[0.035]"
      : tone === "success"
      ? "border-emerald-400/20 bg-emerald-500/[0.04]"
      : "border-white/10 bg-zinc-950/55";

  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)] transition-colors duration-200",
        toneCls,
        className,
      )}
    >
      {children}
    </div>
  );
}

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
    tone === "accent" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-zinc-400";

  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
          {Icon ? <Icon className={cn("h-4 w-4", iconTone)} /> : null}
          <span>{title}</span>
        </h3>
        {hint ? <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function OperatorLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500", className)}>
      {children}
    </span>
  );
}

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
    tone === "success" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-zinc-100";

  return (
    <div className="flex flex-col gap-0.5 border-white/5 px-4 py-3 first:border-l-0 sm:border-l">
      <OperatorLabel>{label}</OperatorLabel>
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "text-lg font-semibold" : "text-sm font-medium",
          valueCls,
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60 shadow-[0_18px_60px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
      aria-describedby={description && label ? `${label}-desc` : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-emerald-400/40 bg-emerald-500/80" : "border-white/10 bg-zinc-800",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out",
          checked ? "left-[calc(100%-1.125rem)]" : "left-0.5",
        )}
      />
    </button>
  );
}

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
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", color, pulse && "animate-pulse", className)}
    />
  );
}

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
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-white/5", className)} aria-hidden="true" />;
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex w-full gap-1 overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/55 p-1", className)}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              selected ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                  selected ? "bg-zinc-950/10 text-zinc-700" : "bg-white/[0.06] text-zinc-500",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/45 px-5 py-8 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-zinc-500">{detail}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
