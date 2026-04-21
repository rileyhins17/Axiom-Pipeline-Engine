"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { CommandPalette } from "./command-palette";
import { ShortcutsModal } from "./shortcuts-modal";

export function HotkeyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openShortcuts = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(true);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        const routes: Record<string, Route> = {
          "0": "/ops",
          "1": "/dashboard",
          "2": "/hunt",
          "3": "/vault",
          "4": "/automation",
          "5": "/outreach",
          "6": "/settings",
        };
        if (routes[event.key]) {
          event.preventDefault();
          router.push(routes[event.key]);
          return;
        }
      }

      if (event.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          event.preventDefault();
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, router, shortcutsOpen]);

  return (
    <>
      {children}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenShortcuts={openShortcuts}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
