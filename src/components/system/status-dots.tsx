"use client";

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SystemPulse {
  automation: "active" | "paused" | "unknown";
  inboxes: number;
}

/**
 * Tiny colored dots in the header showing system health at a glance.
 */
export function StatusDots() {
  const [pulse, setPulse] = useState<SystemPulse>({
    automation: "unknown",
    inboxes: 0,
  });

  useEffect(() => {
    fetch("/api/outreach/automation/status")
      .then((r) => r.json())
      .then((d) => {
        setPulse({
          automation:
            d?.masterEnabled === true
              ? "active"
              : d?.masterEnabled === false
                ? "paused"
                : "unknown",
          inboxes: d?.connectedInboxes ?? d?.inboxes?.length ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  const autoColor =
    pulse.automation === "active"
      ? "bg-emerald-400"
      : pulse.automation === "paused"
        ? "bg-amber-400"
        : "bg-zinc-600";

  const autoLabel =
    pulse.automation === "active"
      ? "Automation active"
      : pulse.automation === "paused"
        ? "Automation paused"
        : "Automation status unknown";

  const inboxLabel =
    pulse.inboxes > 0
      ? `${pulse.inboxes} inbox${pulse.inboxes !== 1 ? "es" : ""} connected`
      : "No inboxes";

  return (
    <div className="hidden md:flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${autoColor} transition-colors ${pulse.automation === "active" ? "shadow-[0_0_4px_rgba(52,211,153,0.5)]" : ""}`}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {autoLabel}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${pulse.inboxes > 0 ? "bg-cyan-400" : "bg-zinc-600"}`}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {inboxLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
