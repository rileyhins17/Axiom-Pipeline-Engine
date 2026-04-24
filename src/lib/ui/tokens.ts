/**
 * The Omniscient — Unified Design Tokens
 *
 * Single source of truth for all visual tokens used across the UI.
 * Import these constants instead of using ad-hoc color/class strings.
 */

// ═══════════════════════════════════════════════
// TIER COLORS  (S = elite, A = high, B = mid, C = low, D = disqualified)
// ═══════════════════════════════════════════════
export const TIER_CONFIG = {
    S: { label: "S-Tier", color: "emerald", text: "text-emerald-400", bg: "bg-emerald-400/15", border: "border-emerald-400/30", ring: "ring-emerald-400/20", dot: "bg-emerald-400", glow: "glow-emerald", gradient: "from-emerald-400 to-emerald-600" },
    A: { label: "A-Tier", color: "cyan", text: "text-cyan-400", bg: "bg-cyan-400/15", border: "border-cyan-400/30", ring: "ring-cyan-400/20", dot: "bg-cyan-400", glow: "glow-cyan", gradient: "from-cyan-400 to-cyan-600" },
    B: { label: "B-Tier", color: "amber", text: "text-amber-400", bg: "bg-amber-400/15", border: "border-amber-400/30", ring: "ring-amber-400/20", dot: "bg-amber-400", glow: "glow-amber", gradient: "from-amber-400 to-amber-600" },
    C: { label: "C-Tier", color: "orange", text: "text-orange-400", bg: "bg-orange-400/15", border: "border-orange-400/30", ring: "ring-orange-400/20", dot: "bg-orange-400", glow: "glow-amber", gradient: "from-orange-400 to-orange-600" },
    D: { label: "D-Tier", color: "red", text: "text-red-400/70", bg: "bg-red-400/10", border: "border-red-400/20", ring: "ring-red-400/15", dot: "bg-red-400/70", glow: "glow-red", gradient: "from-red-400 to-red-600" },
} as const;

export type Tier = keyof typeof TIER_CONFIG;

export function getTierConfig(tier: string | null | undefined) {
    return TIER_CONFIG[(tier as Tier) || "D"] || TIER_CONFIG.D;
}

// ═══════════════════════════════════════════════
// STATUS COLORS  (for queue items, operations)
// ═══════════════════════════════════════════════
export const STATUS_CONFIG = {
    running: { text: "text-emerald-400", bg: "bg-emerald-400/15", border: "border-emerald-400/30", dot: "bg-emerald-400", label: "Running" },
    pending: { text: "text-amber-400", bg: "bg-amber-400/15", border: "border-amber-400/30", dot: "bg-amber-400", label: "Pending" },
    done: { text: "text-cyan-400", bg: "bg-cyan-400/15", border: "border-cyan-400/30", dot: "bg-cyan-400", label: "Complete" },
    failed: { text: "text-red-400", bg: "bg-red-400/15", border: "border-red-400/30", dot: "bg-red-400", label: "Failed" },
    idle: { text: "text-zinc-400", bg: "bg-zinc-400/10", border: "border-zinc-400/20", dot: "bg-zinc-500", label: "Idle" },
} as const;

export type Status = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: string | null | undefined) {
    return STATUS_CONFIG[(status as Status) || "idle"] || STATUS_CONFIG.idle;
}

// ═══════════════════════════════════════════════
// SIGNAL / PAIN TYPE COLORS
// ═══════════════════════════════════════════════
export const SIGNAL_CONFIG = {
    NO_WEBSITE: { text: "text-red-400", bg: "bg-red-400/15", icon: "globe", label: "No Website" },
    SPEED: { text: "text-orange-400", bg: "bg-orange-400/15", icon: "zap", label: "Speed" },
    CONVERSION: { text: "text-amber-400", bg: "bg-amber-400/15", icon: "target", label: "Conversion" },
    TRUST: { text: "text-purple-400", bg: "bg-purple-400/15", icon: "shield", label: "Trust" },
    SEO: { text: "text-cyan-400", bg: "bg-cyan-400/15", icon: "search", label: "SEO" },
    DESIGN: { text: "text-pink-400", bg: "bg-pink-400/15", icon: "palette", label: "Design" },
    FUNCTIONALITY: { text: "text-blue-400", bg: "bg-blue-400/15", icon: "settings", label: "Functionality" },
} as const;

export function getSignalConfig(type: string) {
    return SIGNAL_CONFIG[type as keyof typeof SIGNAL_CONFIG] || { text: "text-zinc-400", bg: "bg-zinc-400/10", icon: "help-circle", label: type };
}

// ═══════════════════════════════════════════════
// GLASS PRESETS  (use these class strings for consistent glass styling)
// ═══════════════════════════════════════════════
export const GLASS = {
    base: "app-panel rounded-md",
    strong: "app-section rounded-md",
    ultra: "app-section-flat rounded-md",
    holo: "app-section rounded-md",
} as const;

// ═══════════════════════════════════════════════
// COMMON CLASS COMPOSITES
// ═══════════════════════════════════════════════
export const CARD_STYLES = {
    stat: "app-section rounded-md p-4 transition-colors duration-200 hover:bg-white/[0.04]",
    panel: "app-section rounded-md overflow-hidden",
    section: "app-section-flat rounded-md",
} as const;

// ═══════════════════════════════════════════════
// NICHE COLORS (bar chart / breakdown palette)
// ═══════════════════════════════════════════════
export const NICHE_COLORS = [
    "from-emerald-500 to-emerald-600",
    "from-cyan-500 to-cyan-600",
    "from-purple-500 to-purple-600",
    "from-amber-500 to-amber-600",
    "from-rose-500 to-rose-600",
    "from-blue-500 to-blue-600",
    "from-lime-500 to-lime-600",
    "from-orange-500 to-orange-600",
] as const;

export function getNicheColor(index: number) {
    return NICHE_COLORS[index % NICHE_COLORS.length];
}
