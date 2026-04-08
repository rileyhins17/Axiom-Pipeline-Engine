"use client";

import { useState, useEffect } from "react";

/**
 * Compact live clock for the top bar.
 * Updates every minute, shows HH:mm in the user's local timezone.
 */
export function LiveClock() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

    setTime(fmt());

    const id = setInterval(() => setTime(fmt()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 select-none tabular-nums">
      <span className="inline-block h-1 w-1 rounded-full bg-emerald-500/50 animate-pulse" />
      {time}
    </span>
  );
}
