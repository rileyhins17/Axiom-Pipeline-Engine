"use client";
import { useState, useEffect, useCallback } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CommandPalette } from "./command-palette";
import { ShortcutsModal } from "./shortcuts-modal";

/**
 * HotkeyProvider — Global keyboard shortcuts and modal state manager.
 * Mount this once in the root layout.
 */
export function HotkeyProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    const openPalette = useCallback(() => {
        setShortcutsOpen(false);
        setPaletteOpen(true);
    }, []);

    const openShortcuts = useCallback(() => {
        setPaletteOpen(false);
        setShortcutsOpen(true);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

            // ⌘K / Ctrl+K  → command palette
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setPaletteOpen(prev => !prev);
                return;
            }

            // Skip remaining hotkeys if user is typing in an input
            if (isInput) return;

            // ? → shortcuts modal
            if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setShortcutsOpen(prev => !prev);
                return;
            }

            // ⌘1-5 → navigate pages
            if (e.metaKey || e.ctrlKey) {
                const routes: Record<string, Route> = {
                    "1": "/dashboard",
                    "2": "/hunt",
                    "3": "/vault",
                    "4": "/settings",
                    "5": "/triage",
                    "6": "/outreach",
                };
                if (routes[e.key]) {
                    e.preventDefault();
                    router.push(routes[e.key]);
                    return;
                }
            }

            // Escape → close modals
            if (e.key === "Escape") {
                if (paletteOpen) { setPaletteOpen(false); e.preventDefault(); }
                if (shortcutsOpen) { setShortcutsOpen(false); e.preventDefault(); }
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [router, paletteOpen, shortcutsOpen]);

    return (
        <>
            {children}
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onOpenShortcuts={openShortcuts}
            />
            <ShortcutsModal
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
            />
        </>
    );
}
