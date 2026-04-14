"use client";

import { AutomationConsole } from "@/components/automation/console";
import type { AutomationConsoleRouteState, AutomationOverview } from "@/components/automation/types";

export function AutomationPageClient({
  initialOverview,
  initialRouteState,
}: {
  initialOverview: AutomationOverview;
  initialRouteState: AutomationConsoleRouteState;
}) {
  return (
    <AutomationConsole
      initialOverview={initialOverview}
      initialRouteState={initialRouteState}
    />
  );
}
