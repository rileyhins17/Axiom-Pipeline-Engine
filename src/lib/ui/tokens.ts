import type { ReactNode } from "react";

/**
 * Shared UI tokens for the Axiom operations console.
 *
 * These values support older components and the newer operator page system.
 * They intentionally avoid decorative glow so dense screens stay readable.
 */

export type StatusTone = "neutral" | "success" | "info" | "warning" | "danger" | "accent";
export type MetricTone = StatusTone;

export type OperatorAction = {
  label: string;
  href?: string;
  tone?: StatusTone;
};

export type TableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
};

export type EmptyStateConfig = {
  title: string;
  description: string;
  actionLabel?: string;
};

export const TIER_CONFIG = {
  S: {
    label: "S-Tier",
    color: "emerald",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/25",
    ring: "ring-emerald-400/20",
    dot: "bg-emerald-400",
    glow: "",
    gradient: "from-emerald-400 to-emerald-600",
  },
  A: {
    label: "A-Tier",
    color: "cyan",
    text: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-400/25",
    ring: "ring-cyan-400/20",
    dot: "bg-cyan-400",
    glow: "",
    gradient: "from-cyan-400 to-cyan-600",
  },
  B: {
    label: "B-Tier",
    color: "amber",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-400/25",
    ring: "ring-amber-400/20",
    dot: "bg-amber-400",
    glow: "",
    gradient: "from-amber-400 to-amber-600",
  },
  C: {
    label: "C-Tier",
    color: "orange",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-400/25",
    ring: "ring-orange-400/20",
    dot: "bg-orange-400",
    glow: "",
    gradient: "from-orange-400 to-orange-600",
  },
  D: {
    label: "D-Tier",
    color: "red",
    text: "text-red-300/80",
    bg: "bg-red-500/10",
    border: "border-red-400/20",
    ring: "ring-red-400/15",
    dot: "bg-red-400/80",
    glow: "",
    gradient: "from-red-400 to-red-600",
  },
} as const;

export type Tier = keyof typeof TIER_CONFIG;

export function getTierConfig(tier: string | null | undefined) {
  return TIER_CONFIG[(tier as Tier) || "D"] || TIER_CONFIG.D;
}

export const STATUS_CONFIG = {
  running: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/25",
    dot: "bg-emerald-400",
    label: "Running",
  },
  pending: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-400/25",
    dot: "bg-amber-400",
    label: "Pending",
  },
  done: {
    text: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-400/25",
    dot: "bg-cyan-400",
    label: "Complete",
  },
  failed: {
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-400/25",
    dot: "bg-red-400",
    label: "Failed",
  },
  idle: {
    text: "text-zinc-300",
    bg: "bg-white/[0.04]",
    border: "border-white/10",
    dot: "bg-zinc-500",
    label: "Idle",
  },
} as const;

export type Status = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: string | null | undefined) {
  return STATUS_CONFIG[(status as Status) || "idle"] || STATUS_CONFIG.idle;
}

export const SIGNAL_CONFIG = {
  NO_WEBSITE: { text: "text-red-300", bg: "bg-red-500/10", icon: "globe", label: "No Website" },
  SPEED: { text: "text-orange-300", bg: "bg-orange-500/10", icon: "zap", label: "Speed" },
  CONVERSION: { text: "text-amber-300", bg: "bg-amber-500/10", icon: "target", label: "Conversion" },
  TRUST: { text: "text-indigo-300", bg: "bg-indigo-500/10", icon: "shield", label: "Trust" },
  SEO: { text: "text-cyan-300", bg: "bg-cyan-500/10", icon: "search", label: "SEO" },
  DESIGN: { text: "text-pink-300", bg: "bg-pink-500/10", icon: "palette", label: "Design" },
  FUNCTIONALITY: { text: "text-blue-300", bg: "bg-blue-500/10", icon: "settings", label: "Functionality" },
} as const;

export function getSignalConfig(type: string) {
  return (
    SIGNAL_CONFIG[type as keyof typeof SIGNAL_CONFIG] || {
      text: "text-zinc-300",
      bg: "bg-white/[0.04]",
      icon: "help-circle",
      label: type,
    }
  );
}

export const GLASS = {
  base: "rounded-xl border border-white/10 bg-white/[0.025]",
  strong: "rounded-xl border border-white/10 bg-white/[0.035]",
  ultra: "rounded-xl border border-white/10 bg-white/[0.045]",
  holo: "rounded-xl border border-white/10 bg-white/[0.035]",
} as const;

export const CARD_STYLES = {
  stat: "rounded-xl border border-white/10 bg-white/[0.025] p-4",
  panel: "overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]",
  section: "rounded-xl border border-white/10 bg-white/[0.035]",
} as const;

export const NICHE_COLORS = [
  "from-emerald-500 to-emerald-600",
  "from-cyan-500 to-cyan-600",
  "from-indigo-500 to-indigo-600",
  "from-amber-500 to-amber-600",
  "from-rose-500 to-rose-600",
  "from-blue-500 to-blue-600",
  "from-lime-500 to-lime-600",
  "from-orange-500 to-orange-600",
] as const;

export function getNicheColor(index: number) {
  return NICHE_COLORS[index % NICHE_COLORS.length];
}
