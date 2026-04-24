"use client";

import { Search } from "lucide-react";

export function SearchTrigger() {
  return (
    <button
      className="hidden h-9 min-w-[26rem] items-center gap-2 rounded-md border border-white/[0.1] bg-[#0f1822] px-3 text-zinc-500 transition-colors hover:border-white/[0.16] hover:text-zinc-200 xl:inline-flex"
      onClick={() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
      }}
      type="button"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left text-xs">Search leads, companies, actions...</span>
      <kbd className="ml-1 rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        ⌘ K
      </kbd>
    </button>
  );
}
