import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "info" | "warning" | "danger" | "accent";
export type MetricTone = StatusTone;

export type OperatorAction = {
  label: string;
  href?: string;
  icon?: LucideIcon;
  tone?: StatusTone;
};

export type TableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type EmptyStateConfig = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

const toneMap: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-zinc-300",
  success: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  info: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
  warning: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  danger: "border-red-400/25 bg-red-500/10 text-red-200",
  accent: "border-indigo-400/25 bg-indigo-500/10 text-indigo-200",
};

const metricToneMap: Record<MetricTone, string> = {
  neutral: "text-zinc-100",
  success: "text-emerald-200",
  info: "text-cyan-200",
  warning: "text-amber-200",
  danger: "text-red-200",
  accent: "text-indigo-200",
};

export function getStatusToneClasses(tone: StatusTone = "neutral") {
  return toneMap[tone];
}

export function OperatorPage({
  children,
  className,
  size = "wide",
}: {
  children: ReactNode;
  className?: string;
  size?: "normal" | "wide" | "full";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6",
        size === "normal" && "max-w-5xl",
        size === "wide" && "max-w-7xl",
        size === "full" && "max-w-[1440px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OperatorHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.26)] md:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {title}
            </h1>
            {status}
          </div>
          {description ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export function OperatorPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  tone = "neutral",
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
  contentClassName?: string;
}) {
  const panelTone =
    tone === "warning"
      ? "border-amber-400/18 bg-amber-500/[0.035]"
      : tone === "danger"
        ? "border-red-400/18 bg-red-500/[0.035]"
        : tone === "success"
          ? "border-emerald-400/18 bg-emerald-500/[0.035]"
          : tone === "info"
            ? "border-cyan-400/18 bg-cyan-500/[0.035]"
            : "border-white/10 bg-white/[0.025]";

  return (
    <section className={cn("rounded-xl border", panelTone, className)}>
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function OperatorMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-white/[0.025] p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        {Icon ? <Icon className={cn("h-4 w-4", metricToneMap[tone])} /> : null}
      </div>
      <div className={cn("mt-3 text-2xl font-semibold tabular-nums", metricToneMap[tone])}>
        {value}
      </div>
      {detail ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function OperatorMetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </section>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OperatorEmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateConfig & { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/15 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
