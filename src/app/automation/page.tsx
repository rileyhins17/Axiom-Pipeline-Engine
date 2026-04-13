import { AutomationPageClient } from "@/app/automation/AutomationPageClient";
import { createEmptyAutomationOverview } from "@/lib/automation-overview";
import { getAutomationRouteState } from "@/lib/outbound-navigation";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { requireSession } from "@/lib/session";

export const dynamic = 'force-dynamic';

export default async function AutomationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();

  const routeState = getAutomationRouteState((await searchParams) ?? {});
  const overview = await listAutomationOverview().catch(() => createEmptyAutomationOverview());

  return (
    <div className="mx-auto max-w-7xl">
      <AutomationPageClient initialOverview={overview} initialRouteState={routeState} />
    </div>
  );
}
