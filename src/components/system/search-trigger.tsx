"use client";

import { useSyncExternalStore } from "react";
import { Search } from "lucide-react";

const subscribePlatform = () => () => {};

function isApplePlatform() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function SearchTrigger() {
  const isMac = useSyncExternalStore(subscribePlatform, isApplePlatform, () => false);

  const shortcut = `${isMac ? "⌘" : "Ctrl"} K`;
  return (
    <button
      aria-label={`Open command palette (${shortcut})`}
      title={`Open command palette · ${shortcut}`}
      className="v2-focus-ring hidden h-9 min-w-[26rem] items-center gap-2 rounded-md border border-white/[0.1] bg-[#0f1822] px-3 text-zinc-500 transition-colors hover:border-white/[0.16] hover:text-zinc-200 xl:inline-flex"
      onClick={() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }));
      }}
      type="button"
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="flex-1 text-left text-xs">Search leads, clients, companies, actions…</span>
      <kbd className="ml-1 rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        {shortcut}
      </kbd>
    </button>
  );
}
