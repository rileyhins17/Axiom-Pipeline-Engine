import {
  Bot,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

export type AppNavItem = {
  title: string;
  label: string;
  description: string;
  url: Route;
  icon: LucideIcon;
  shortcut: string;
  keywords: string[];
  badgeKey?: "readyForTouch" | "followUp" | "replied" | "total";
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    title: "Dashboard",
    label: "Dashboard",
    description: "Pipeline overview",
    url: "/dashboard",
    icon: LayoutDashboard,
    shortcut: "⌘1",
    keywords: ["home", "overview", "status", "dashboard"],
  },
  {
    title: "Lead Generator",
    label: "Lead Generator",
    description: "Source target markets",
    url: "/hunt",
    icon: Target,
    shortcut: "⌘2",
    keywords: ["hunt", "source", "scrape", "market", "leads"],
  },
  {
    title: "Vault",
    label: "Vault",
    description: "Lead database",
    url: "/vault",
    icon: Database,
    shortcut: "⌘3",
    keywords: ["database", "records", "export", "leads"],
    badgeKey: "total",
  },
  {
    title: "Outreach",
    label: "Outreach",
    description: "Enrich and send",
    url: "/outreach",
    icon: MessageSquareText,
    shortcut: "⌘4",
    keywords: ["email", "send", "enrich", "qualify", "pipeline"],
    badgeKey: "readyForTouch",
  },
  {
    title: "Automation",
    label: "Automation",
    description: "Queues and follow-ups",
    url: "/automation",
    icon: Bot,
    shortcut: "⌘5",
    keywords: ["scheduler", "sequence", "mailbox", "follow-up"],
    badgeKey: "followUp",
  },
  {
    title: "Settings",
    label: "Settings",
    description: "Runtime controls",
    url: "/settings",
    icon: Settings,
    shortcut: "⌘6",
    keywords: ["runtime", "security", "config", "preferences"],
  },
];

export function getNavItemForPath(pathname: string | null | undefined) {
  if (!pathname) return null;
  return APP_NAV_ITEMS.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`)) ?? null;
}
