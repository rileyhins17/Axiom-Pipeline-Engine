"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AutomationPanel } from "@/components/outreach/automation-panel";
import { ToastProvider } from "@/components/ui/toast-provider";
import { fetchJsonWithCache, setCachedJson } from "@/lib/client-json-cache";

type AutomationPageClientProps = {
  initialOverview: any;
};

const AUTOMATION_OVERVIEW_CACHE_KEY = "automation-overview";
const AUTOMATION_OVERVIEW_TTL_MS = 5_000;

export function AutomationPageClient({ initialOverview }: AutomationPageClientProps) {
  const [overview, setOverview] = useState(initialOverview);
  const mountedRef = useRef(true);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCachedJson(AUTOMATION_OVERVIEW_CACHE_KEY, initialOverview, AUTOMATION_OVERVIEW_TTL_MS);
  }, [initialOverview]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestAbortRef.current?.abort();
    };
  }, []);

  const refreshOverview = useCallback(async (nextOverview?: any) => {
    if (nextOverview) {
      setOverview(nextOverview);
      setCachedJson(AUTOMATION_OVERVIEW_CACHE_KEY, nextOverview, AUTOMATION_OVERVIEW_TTL_MS);
      return;
    }

    const controller = new AbortController();
    requestAbortRef.current = controller;

    try {
      const data = await fetchJsonWithCache<any>(
        AUTOMATION_OVERVIEW_CACHE_KEY,
        "/api/outreach/automation/overview",
        {
          ttlMs: AUTOMATION_OVERVIEW_TTL_MS,
          signal: controller.signal,
        },
      );

      if (mountedRef.current && !controller.signal.aborted) {
        setOverview(data);
      }
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
    }
  }, []);

  return (
    <ToastProvider>
      <AutomationPanel overview={overview} onOverviewUpdated={refreshOverview} />
    </ToastProvider>
  );
}
