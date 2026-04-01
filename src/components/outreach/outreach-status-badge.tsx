"use client";

import { cn } from "@/lib/utils";
import { getOutreachStatusMeta } from "@/lib/outreach";

export function OutreachStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const meta = getOutreachStatusMeta(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        meta.classes,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {meta.shortLabel}
    </span>
  );
}
