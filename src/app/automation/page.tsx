import { AutomationPageClient } from "@/app/automation/AutomationPageClient";
import { AUTOMATION_SETTINGS_DEFAULTS } from "@/lib/automation-policy";
import { listAutomationOverview } from "@/lib/outreach-automation";
import { requireSession } from "@/lib/session";

function emptyAutomationOverview() {
  return {
    settings: {
      ...AUTOMATION_SETTINGS_DEFAULTS,
    },
    ready: [],
    mailboxes: [],
    sequences: [],
    queued: [],
    active: [],
    finished: [],
    recentSent: [],
    recentRuns: [],
    engine: {
      mode: "ACTIVE",
      nextSendAt: null,
      scheduledToday: 0,
      blockedCount: 0,
      replyStoppedCount: 0,
      readyCount: 0,
      queuedCount: 0,
      waitingCount: 0,
      sendingCount: 0,
    },
    pipeline: {
      needsEnrichment: 0,
      enriching: 0,
      enriched: 0,
      readyForTouch: 0,
    },
    stats: {
      ready: 0,
      queued: 0,
      sending: 0,
      waiting: 0,
      blocked: 0,
      active: 0,
      paused: 0,
      stopped: 0,
      completed: 0,
      replied: 0,
      scheduledToday: 0,
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function AutomationPage() {
  await requireSession();

  const overview = await listAutomationOverview().catch(() => emptyAutomationOverview());

  return (
    <div className="mx-auto max-w-7xl">
      <AutomationPageClient initialOverview={overview} />
    </div>
  );
}
