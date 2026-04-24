"use client";

import { Keyboard, X } from "lucide-react";

import { APP_NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: APP_NAV_ITEMS.map((item) => ({
      keys: ["Cmd", item.shortcut.replace("⌘", "")],
      description: `Go to ${item.label}`,
    })),
  },
  {
    title: "Command Palette",
    shortcuts: [
      { keys: ["Cmd", "K"], description: "Open command palette" },
      { keys: ["Up", "Down"], description: "Navigate results" },
      { keys: ["Enter"], description: "Run selected command" },
      { keys: ["Esc"], description: "Close palette or modal" },
    ],
  },
  {
    title: "System",
    shortcuts: [{ keys: ["?"], description: "Show this help" }],
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative flex items-start justify-center px-4 pt-[12vh]">
        <div
          className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl animate-scale-in"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Keyboard className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Keyboard Shortcuts</h2>
            </div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-5 overflow-y-auto p-5">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="mb-3 text-[11px] font-medium text-zinc-500">{group.title}</h3>
                <div className="space-y-1.5">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                    >
                      <span className="text-sm text-zinc-300">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd
                            key={keyIndex}
                            className={cn(
                              "inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] font-mono text-zinc-400",
                              key.length === 1 ? "px-2.5" : "px-2",
                            )}
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
