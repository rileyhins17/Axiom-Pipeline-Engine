"use client";

import { Search } from "lucide-react";

export function SearchTrigger() {
  return (
    <button
      className="hidden h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 text-zinc-500 transition-colors hover:border-white/[0.14] hover:text-zinc-200 sm:inline-flex"
      onClick={() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
      }}
      type="button"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="text-xs">Search</span>
      <kbd className="ml-1 rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
        Cmd K
      </kbd>
    </button>
  );
}
