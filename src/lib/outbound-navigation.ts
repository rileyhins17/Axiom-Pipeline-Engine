export type AutomationTab = "overview" | "queue" | "mailboxes" | "blocked" | "rules";
export type AutomationQueueFilter = "all" | "initial" | "followup" | "blocked" | "paused";

type SearchParamInput =
  | string
  | string[]
  | undefined;

type SearchParamsRecord = Record<string, SearchParamInput>;

function getFirstParamValue(value: SearchParamInput) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function normalizeAutomationTab(value: string | null | undefined): AutomationTab {
  switch (value) {
    case "queue":
    case "mailboxes":
    case "blocked":
    case "rules":
      return value;
    default:
      return "overview";
  }
}

export function normalizeAutomationQueueFilter(
  value: string | null | undefined,
): AutomationQueueFilter {
  switch (value) {
    case "initial":
    case "followup":
    case "blocked":
    case "paused":
      return value;
    default:
      return "all";
  }
}

export function buildAutomationHref(options?: {
  tab?: AutomationTab;
  filter?: AutomationQueueFilter;
  gmailConnected?: boolean;
  gmailError?: string | null;
}) {
  const params = new URLSearchParams();

  if (options?.tab && options.tab !== "overview") {
    params.set("tab", options.tab);
  }

  if (options?.tab === "queue" && options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }

  if (options?.gmailConnected) {
    params.set("gmail_connected", "true");
  }

  if (options?.gmailError) {
    params.set("gmail_error", options.gmailError);
  }

  const query = params.toString();
  return query ? `/automation?${query}` : "/automation";
}

export function getAutomationHrefForLifecycleStage(stage: string | null | undefined) {
  switch (stage) {
    case "initial":
      return buildAutomationHref({ tab: "queue", filter: "initial" });
    case "followup":
      return buildAutomationHref({ tab: "queue", filter: "followup" });
    case "blocked":
      return buildAutomationHref({ tab: "blocked" });
    case "mailboxes":
      return buildAutomationHref({ tab: "mailboxes" });
    case "rules":
      return buildAutomationHref({ tab: "rules" });
    case "qualification":
    case "enrichment":
    default:
      return buildAutomationHref({ tab: "overview" });
  }
}

export function getAutomationRouteState(searchParams: SearchParamsRecord | null | undefined) {
  const rawTab = getFirstParamValue(searchParams?.tab);
  const tab = normalizeAutomationTab(rawTab);
  const rawFilter = getFirstParamValue(searchParams?.filter);
  const filter = tab === "queue" ? normalizeAutomationQueueFilter(rawFilter) : "all";
  const gmailConnected = getFirstParamValue(searchParams?.gmail_connected) === "true";
  const gmailError = getFirstParamValue(searchParams?.gmail_error) ?? null;

  return {
    tab,
    filter,
    gmailConnected,
    gmailError,
  };
}

export function getAutomationHrefFromLegacyOutreach(
  searchParams: SearchParamsRecord | null | undefined,
) {
  const stage = getFirstParamValue(searchParams?.stage);
  const gmailConnected = getFirstParamValue(searchParams?.gmail_connected) === "true";
  const gmailError = getFirstParamValue(searchParams?.gmail_error) ?? null;

  if (gmailConnected || gmailError) {
    return buildAutomationHref({
      tab: "mailboxes",
      gmailConnected,
      gmailError,
    });
  }

  return getAutomationHrefForLifecycleStage(stage);
}
