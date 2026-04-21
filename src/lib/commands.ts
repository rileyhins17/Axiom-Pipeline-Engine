import {
  Activity,
  Database,
  Download,
  FileText,
  Keyboard,
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Bot,
  Play,
  Search,
  Settings,
  Shield,
  Star,
  Target,
  type LucideIcon,
  Zap,
  Globe,
} from "lucide-react";

export type CommandCategory = "navigate" | "filter" | "export" | "run" | "system";

export interface Command {
  id: string;
  category: CommandCategory;
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string;
  keywords?: string[];
  action: CommandAction;
}

export type CommandAction =
  | { type: "navigate"; path: string }
  | { type: "navigate-filter"; path: string; params: Record<string, string> }
  | { type: "export"; format: string; tiers?: string }
  | { type: "run"; task: string }
  | { type: "modal"; modal: string };

export const CATEGORY_META: Record<CommandCategory, { label: string; order: number }> = {
  navigate: { label: "Navigation", order: 0 },
  filter: { label: "Quick Filters", order: 1 },
  export: { label: "Export", order: 2 },
  run: { label: "Actions", order: 3 },
  system: { label: "System", order: 4 },
};

export const COMMANDS: Command[] = [
  {
    id: "nav-dashboard",
    category: "navigate",
    label: "Dashboard",
    description: "Open the operations home",
    icon: LayoutDashboard,
    shortcut: "Cmd+1",
    keywords: ["home", "overview", "status"],
    action: { type: "navigate", path: "/dashboard" },
  },
  {
    id: "nav-ops",
    category: "navigate",
    label: "Ops — Pipeline Health",
    description: "Scheduler, mailboxes, recent runs, send queue",
    icon: Activity,
    shortcut: "Cmd+0",
    keywords: ["ops", "health", "scheduler", "runs", "mailbox", "queue", "status"],
    action: { type: "navigate", path: "/ops" },
  },
  {
    id: "nav-hunt",
    category: "navigate",
    label: "Lead Generator",
    description: "Build and launch lead generation campaigns",
    icon: Target,
    shortcut: "Cmd+2",
    keywords: ["search", "scrape", "extract", "find", "generator", "campaign"],
    action: { type: "navigate", path: "/hunt" },
  },
  {
    id: "nav-vault",
    category: "navigate",
    label: "Vault",
    description: "Browse the lead database",
    icon: Database,
    shortcut: "Cmd+3",
    keywords: ["leads", "table", "data"],
    action: { type: "navigate", path: "/vault" },
  },
  {
    id: "nav-automation",
    category: "navigate",
    label: "Automation",
    description: "Run the autonomous outreach engine",
    icon: Bot,
    shortcut: "Cmd+4",
    keywords: ["automation", "scheduler", "sequence", "mailbox", "auto send"],
    action: { type: "navigate", path: "/automation" },
  },
  {
    id: "nav-settings",
    category: "navigate",
    label: "Settings",
    description: "Review runtime controls",
    icon: Settings,
    shortcut: "Cmd+6",
    keywords: ["config", "preferences", "runtime"],
    action: { type: "navigate", path: "/settings" },
  },
  {
    id: "nav-outreach",
    category: "navigate",
    label: "Outreach",
    description: "Manage manual outreach and the email log",
    icon: MessageSquareText,
    shortcut: "Cmd+5",
    keywords: ["pipeline", "follow-up", "crm", "contacted", "manual"],
    action: { type: "navigate", path: "/outreach" },
  },
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
    label: "Tier S and A leads",
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
    label: "High rating leads",
    description: "Show leads rated four stars or above",
    icon: Star,
    keywords: ["rating", "stars", "quality"],
    action: { type: "navigate-filter", path: "/vault", params: { minRating: "4" } },
  },
  {
    id: "export-xlsx-sab",
    category: "export",
    label: "Export S/A/B as XLSX",
    description: "Download qualified leads as spreadsheet",
    icon: Download,
    keywords: ["download", "spreadsheet", "xlsx", "excel"],
    action: { type: "export", format: "xlsx", tiers: "S,A,B" },
  },
  {
    id: "export-csv-all",
    category: "export",
    label: "Export all leads CSV",
    description: "Download the full database as CSV",
    icon: FileText,
    keywords: ["download", "all", "full", "csv"],
    action: { type: "export", format: "csv" },
  },
  {
    id: "run-open-hunt",
    category: "run",
    label: "Open Lead Generator",
    description: "Open the lead generation workspace",
    icon: Play,
    keywords: ["start", "new", "hunt", "extract", "lead generator", "campaign"],
    action: { type: "navigate", path: "/hunt" },
  },
  {
    id: "run-open-automation",
    category: "run",
    label: "Open Automation",
    description: "Open the autonomous sending workspace",
    icon: Bot,
    keywords: ["automation", "scheduler", "auto send", "mailboxes"],
    action: { type: "navigate", path: "/automation" },
  },
  {
    id: "sys-search",
    category: "system",
    label: "Search commands",
    description: "Open command palette",
    icon: Search,
    shortcut: "Cmd+K",
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
    label: "Toggle performance mode",
    description: "Reduce animations for better FPS",
    icon: Zap,
    keywords: ["performance", "motion", "reduce", "fps"],
    action: { type: "modal", modal: "perf-toggle" },
  },
];

export function searchCommands(query: string): Command[] {
  if (!query.trim()) return COMMANDS;

  const normalizedQuery = query.toLowerCase();
  return COMMANDS.filter((command) => {
    const fields = [
      command.label,
      command.description || "",
      command.shortcut || "",
      ...(command.keywords || []),
    ];
    return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
  });
}

export function groupByCategory(commands: Command[]) {
  const grouped = commands.reduce<Record<CommandCategory, Command[]>>(
    (groups, command) => {
      groups[command.category].push(command);
      return groups;
    },
    {
      navigate: [],
      filter: [],
      export: [],
      run: [],
      system: [],
    },
  );

  return (Object.keys(CATEGORY_META) as CommandCategory[])
    .map((category) => ({
      category,
      label: CATEGORY_META[category].label,
      commands: grouped[category],
      order: CATEGORY_META[category].order,
    }))
    .filter((group) => group.commands.length > 0)
    .sort((a, b) => a.order - b.order);
}
