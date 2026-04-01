"use client";
import { cn } from "@/lib/utils";
import { Keyboard, X } from "lucide-react";

interface ShortcutsModalProps {
    open: boolean;
    onClose: () => void;
}

const SHORTCUT_GROUPS = [
    {
        title: "Navigation",
        shortcuts: [
            { keys: ["Cmd", "1"], description: "Go to Dashboard" },
            { keys: ["Cmd", "2"], description: "Go to The Hunt" },
            { keys: ["Cmd", "3"], description: "Go to The Vault" },
            { keys: ["Cmd", "4"], description: "Go to Settings" },
            { keys: ["Cmd", "5"], description: "Go to Triage" },
            { keys: ["Cmd", "6"], description: "Go to Outreach" },
        ],
    },
    {
        title: "Command Palette",
        shortcuts: [
            { keys: ["Cmd", "K"], description: "Open command palette" },
            { keys: ["Up", "Down"], description: "Navigate results" },
            { keys: ["Enter"], description: "Execute command" },
            { keys: ["Esc"], description: "Close palette / modal" },
        ],
    },
    {
        title: "System",
        shortcuts: [
            { keys: ["?"], description: "Show this help" },
        ],
    },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className="relative flex items-start justify-center pt-[12vh]">
                <div
                    className="w-full max-w-[480px] glass-ultra rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden animate-scale-in"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                            <Keyboard className="w-4 h-4 text-emerald-400" />
                            <h2 className="text-sm font-bold text-foreground">Keyboard Shortcuts</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                        {SHORTCUT_GROUPS.map(group => (
                            <div key={group.title}>
                                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2.5">
                                    {group.title}
                                </h3>
                                <div className="space-y-1">
                                    {group.shortcuts.map((shortcut, index) => (
                                        <div key={index} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                                            <span className="text-xs text-muted-foreground">{shortcut.description}</span>
                                            <div className="flex items-center gap-1">
                                                {shortcut.keys.map((key, keyIndex) => (
                                                    <kbd
                                                        key={keyIndex}
                                                        className={cn(
                                                            "min-w-[24px] h-6 inline-flex items-center justify-center rounded border text-[11px] font-mono",
                                                            "bg-white/[0.03] border-white/[0.08] text-muted-foreground/60",
                                                            key.length === 1 ? "px-2" : "px-1.5"
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

                    <div className="px-5 py-3 border-t border-white/[0.06]">
                        <p className="text-[10px] text-muted-foreground/30 text-center">
                            Press <kbd className="mx-0.5 px-1 py-0.5 rounded border border-white/[0.06] bg-white/[0.03] text-[10px]">?</kbd> anytime to toggle this panel
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
