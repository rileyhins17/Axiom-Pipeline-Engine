/**
 * Omniscient v4 — Command Registry
 *
 * Central registry of all actions available in the command palette and hotkeys.
 * Every command has a unique id, category, label, optional shortcut, and an action type.
 */
import {
    LayoutDashboard, Target, Database, Settings, Globe, Mail, Shield,
    Download, Play, Search, Keyboard, Star, Filter, Zap, FileText, MessageSquareText,
    type LucideIcon,
} from "lucide-react";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════
export type CommandCategory = "navigate" | "filter" | "export" | "run" | "system";

export interface Command {
    id: string;
    category: CommandCategory;
    label: string;
    description?: string;
    icon: LucideIcon;
    shortcut?: string;          // display string e.g. "⌘1"
    keywords?: string[];        // extra search terms
    action: CommandAction;
}

export type CommandAction =
    | { type: "navigate"; path: string }
    | { type: "navigate-filter"; path: string; params: Record<string, string> }
    | { type: "export"; format: string; tiers?: string }
    | { type: "run"; task: string }
    | { type: "modal"; modal: string };

// ═══════════════════════════════════════════════
// Category metadata
// ═══════════════════════════════════════════════
export const CATEGORY_META: Record<CommandCategory, { label: string; order: number }> = {
    navigate: { label: "Navigation", order: 0 },
    filter: { label: "Quick Filters", order: 1 },
    export: { label: "Export", order: 2 },
    run: { label: "Actions", order: 3 },
    system: { label: "System", order: 4 },
};

// ═══════════════════════════════════════════════
// Command definitions
// ═══════════════════════════════════════════════
export const COMMANDS: Command[] = [
    // ── Navigation ──
    {
        id: "nav-dashboard",
        category: "navigate",
        label: "Dashboard",
        description: "Command center overview",
        icon: LayoutDashboard,
        shortcut: "⌘1",
        keywords: ["home", "overview", "stats"],
        action: { type: "navigate", path: "/dashboard" },
    },
    {
        id: "nav-hunt",
        category: "navigate",
        label: "The Hunt",
        description: "Extract & enrich leads",
        icon: Target,
        shortcut: "⌘2",
        keywords: ["search", "scrape", "extract", "find"],
        action: { type: "navigate", path: "/hunt" },
    },
    {
        id: "nav-vault",
        category: "navigate",
        label: "The Vault",
        description: "Browse lead database",
        icon: Database,
        shortcut: "⌘3",
        keywords: ["leads", "table", "browse", "data"],
        action: { type: "navigate", path: "/vault" },
    },
    {
        id: "nav-settings",
        category: "navigate",
        label: "Settings",
        description: "Configure preferences",
        icon: Settings,
        shortcut: "⌘4",
        keywords: ["config", "preferences", "performance"],
        action: { type: "navigate", path: "/settings" },
    },
    {
        id: "nav-outreach",
        category: "navigate",
        label: "Outreach Pipeline",
        description: "Manage contacted leads and follow-ups",
        icon: MessageSquareText,
        shortcut: "âŒ˜6",
        keywords: ["outreach", "pipeline", "follow-up", "crm", "contacted"],
        action: { type: "navigate", path: "/outreach" },
    },

    // ── Dossier ──
    {
        id: "nav-dossier-recent",
        category: "navigate",
        label: "Open Most Recent Lead",
        description: "Open dossier for the newest lead",
        icon: FileText,
        keywords: ["dossier", "case", "file", "recent", "latest"],
        action: { type: "navigate", path: "/lead/latest" },
    },

    // ── Triage ──
    {
        id: "nav-triage",
        category: "navigate",
        label: "Triage Mode",
        description: "Speed triage leads one at a time",
        icon: Zap,
        shortcut: "⌘5",
        keywords: ["triage", "fast", "money", "speed", "process", "review"],
        action: { type: "navigate", path: "/triage" },
    },
    {
        id: "nav-triage-sab",
        category: "navigate",
        label: "Start Triage (S/A/B)",
        description: "Triage top-tier leads only",
        icon: Zap,
        keywords: ["triage", "tier", "top", "best"],
        action: { type: "navigate", path: "/triage?tier=S,A,B" },
    },

    // ── Quick Filters ──
    {
        id: "filter-no-website",
        category: "filter",
        label: "No Website leads",
        description: "Show leads missing a website",
        icon: Globe,
        keywords: ["missing", "no site", "prime"],
        action: { type: "navigate-filter", path: "/vault", params: { website: "missing" } },
    },
    {
        id: "filter-tier-sa",
        category: "filter",
        label: "Tier S & A leads",
        description: "Show top-tier qualified leads",
        icon: Shield,
        keywords: ["best", "top", "qualified", "s-tier", "a-tier"],
        action: { type: "navigate-filter", path: "/vault", params: { tier: "S,A" } },
    },
    {
        id: "filter-has-email",
        category: "filter",
        label: "Leads with email",
        description: "Show contactable leads only",
        icon: Mail,
        keywords: ["email", "contact", "reachable"],
        action: { type: "navigate-filter", path: "/vault", params: { hasEmail: "true" } },
    },
    {
        id: "filter-high-rating",
        category: "filter",
        label: "High rating (4★+)",
        description: "Show leads rated 4 stars or above",
        icon: Star,
        keywords: ["rating", "stars", "quality"],
        action: { type: "navigate-filter", path: "/vault", params: { minRating: "4" } },
    },

    // ── Export ──
    {
        id: "export-xlsx-sab",
        category: "export",
        label: "Export S/A/B as XLSX",
        description: "Download qualified leads as styled spreadsheet",
        icon: Download,
        keywords: ["download", "spreadsheet", "xlsx", "excel", "sheet"],
        action: { type: "export", format: "xlsx", tiers: "S,A,B" },
    },
    {
        id: "export-xlsx-all",
        category: "export",
        label: "Export all leads XLSX",
        description: "Download entire database as styled spreadsheet",
        icon: Download,
        keywords: ["download", "all", "full", "xlsx", "excel", "sheet"],
        action: { type: "export", format: "xlsx" },
    },
    {
        id: "export-csv-sab",
        category: "export",
        label: "Export S/A/B as CSV",
        description: "Download qualified leads as raw CSV",
        icon: FileText,
        keywords: ["download", "csv", "raw"],
        action: { type: "export", format: "csv", tiers: "S,A,B" },
    },
    {
        id: "export-csv-all",
        category: "export",
        label: "Export all leads CSV",
        description: "Download entire database as raw CSV",
        icon: FileText,
        keywords: ["download", "all", "full", "csv", "raw"],
        action: { type: "export", format: "csv" },
    },

    // ── Run ──
    {
        id: "run-open-hunt",
        category: "run",
        label: "Open Hunt panel",
        description: "Start a new extraction",
        icon: Play,
        keywords: ["start", "new", "hunt", "extract"],
        action: { type: "navigate", path: "/hunt" },
    },

    // ── System ──
    {
        id: "sys-search",
        category: "system",
        label: "Search commands…",
        description: "Open command palette",
        icon: Search,
        shortcut: "⌘K",
        keywords: ["palette", "search"],
        action: { type: "modal", modal: "palette" },
    },
    {
        id: "sys-shortcuts",
        category: "system",
        label: "Keyboard shortcuts",
        description: "View all hotkeys",
        icon: Keyboard,
        shortcut: "?",
        keywords: ["help", "keys", "hotkeys"],
        action: { type: "modal", modal: "shortcuts" },
    },
    {
        id: "sys-perf-mode",
        category: "system",
        label: "Toggle Performance Mode",
        description: "Reduce animations for better FPS",
        icon: Zap,
        keywords: ["performance", "motion", "reduce", "fps"],
        action: { type: "modal", modal: "perf-toggle" },
    },
];

// ═══════════════════════════════════════════════
// Fuzzy search helper
// ═══════════════════════════════════════════════
export function searchCommands(query: string): Command[] {
    if (!query.trim()) return COMMANDS;
    const q = query.toLowerCase();
    return COMMANDS.filter(cmd => {
        const haystack = [
            cmd.label,
            cmd.description || "",
            ...(cmd.keywords || []),
            cmd.category,
        ].join(" ").toLowerCase();
        // Every word in query must match somewhere in haystack
        return q.split(/\s+/).every(word => haystack.includes(word));
    });
}

// ═══════════════════════════════════════════════
// Group by category (sorted)
// ═══════════════════════════════════════════════
export function groupByCategory(commands: Command[]): { category: CommandCategory; label: string; commands: Command[] }[] {
    const groups = new Map<CommandCategory, Command[]>();
    for (const cmd of commands) {
        if (!groups.has(cmd.category)) groups.set(cmd.category, []);
        groups.get(cmd.category)!.push(cmd);
    }
    return Array.from(groups.entries())
        .map(([cat, cmds]) => ({ category: cat, label: CATEGORY_META[cat].label, commands: cmds }))
        .sort((a, b) => CATEGORY_META[a.category].order - CATEGORY_META[b.category].order);
}
