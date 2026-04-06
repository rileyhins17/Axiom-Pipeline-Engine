"use client";

import { AutomationConsole } from "@/components/automation/console";

export function AutomationPageClient({ initialOverview }: { initialOverview: any }) {
  return <AutomationConsole initialOverview={initialOverview} />;
}
