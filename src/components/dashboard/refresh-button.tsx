"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";

export function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <button
      type="button"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 1500);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer"
    >
      {refreshing ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <RefreshCwIcon className="size-3" />
      )}
      Refresh
    </button>
  );
}
