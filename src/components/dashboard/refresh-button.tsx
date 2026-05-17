"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Server-rendered data is "current as of" the page load.
  useEffect(() => {
    // Queue the state update so it doesn't fire synchronously inside the effect,
    // which the lint rule flags as a cascading-render risk.
    const handle = window.requestAnimationFrame(() => {
      setLastUpdated(formatLastUpdated(new Date()));
    });
    return () => window.cancelAnimationFrame(handle);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {lastUpdated ? (
        <span className="hidden text-[11px] text-zinc-500 sm:inline" aria-live="polite">
          Last updated <span className="font-mono text-zinc-400">{lastUpdated}</span>
        </span>
      ) : null}
      <button
        type="button"
        disabled={refreshing}
        aria-label={refreshing ? "Refreshing data" : "Refresh data"}
        title="Re-run all dashboard queries"
        onClick={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => {
            setLastUpdated(formatLastUpdated(new Date()));
            setRefreshing(false);
          }, 1500);
        }}
        className="v2-focus-ring inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer"
      >
        {refreshing ? (
          <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCwIcon className="size-3" aria-hidden="true" />
        )}
        Refresh
      </button>
    </div>
  );
}
