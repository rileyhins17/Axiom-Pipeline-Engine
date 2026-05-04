import {
  Bot,
  Database,
  LayoutDashboard,
  Settings,
  Users,
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
  badgeKey?: "readyForTouch" | "followUp" | "replied" | "total" | "clients";
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
    title: "Vault",
    label: "Vault",
    description: "Lead database",
    url: "/vault",
    icon: Database,
    shortcut: "⌘2",
    keywords: ["database", "records", "export", "leads"],
    badgeKey: "total",
  },
  {
    title: "Clients",
    label: "Clients",
    description: "Deal pipeline & client management",
    url: "/clients",
    icon: Users,
    shortcut: "⌘3",
    keywords: ["crm", "deal", "client", "pipeline", "retainer", "revenue"],
    badgeKey: "replied",
  },
  {
    title: "Automation",
    label: "Automation",
    description: "Sequences & sends",
    url: "/automation",
    icon: Bot,
    shortcut: "⌘4",
    keywords: ["scheduler", "sequence", "mailbox", "follow-up"],
    badgeKey: "followUp",
  },
  {
    title: "Settings",
    label: "Settings",
    description: "Mailbox connections",
    url: "/settings",
    icon: Settings,
    shortcut: "⌘5",
    keywords: ["runtime", "gmail", "config", "preferences"],
  },
];

export function getNavItemForPath(pathname: string | null | undefined) {
  if (!pathname) return null;
  return APP_NAV_ITEMS.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`)) ?? null;
}
