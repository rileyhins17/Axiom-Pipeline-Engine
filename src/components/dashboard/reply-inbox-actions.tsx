"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";

type ReplyInboxItem = {
  id: number;
  businessName: string;
  city: string | null;
  niche: string | null;
  email: string | null;
  replyAgeLabel: string;
  replyAgeHours: number;
};

export function ReplyInboxPanel({ items: initialItems }: { items: ReplyInboxItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [actioning, setActioning] = useState<number | null>(null);

  if (items.length === 0) return null;

  async function moveToStage(id: number, stage: string) {
    setActioning(id);
    try {
      const res = await fetch(`/api/leads/${id}/deal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealStage: stage }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      // silently fail
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="v2-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-cyan-400" />
          <div>
            <div className="text-sm font-semibold text-white">Reply Inbox</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {items.length} unhandled {items.length === 1 ? "reply" : "replies"} — respond fast
            </div>
          </div>
        </div>
        <Link
          href="/clients"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium flex items-center gap-1"
        >
          Open board <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="divide-y divide-white/[0.05]">
        {items.map((item) => {
          const urgency =
            item.replyAgeHours >= 4
              ? "text-red-400"
              : item.replyAgeHours >= 1
                ? "text-amber-400"
                : "text-emerald-400";
          const isActioning = actioning === item.id;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <Link href={`/clients/${item.id}`} className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white truncate">{item.businessName}</div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {item.city} · {item.niche}
                  {item.email ? ` · ${item.email}` : ""}
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isActioning}
                  onClick={() => void moveToStage(item.id, "NEGOTIATING")}
                  className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-300 disabled:opacity-50 cursor-pointer"
                >
                  Pipeline
                </button>
                <button
                  type="button"
                  disabled={isActioning}
                  onClick={() => void moveToStage(item.id, "LOST")}
                  className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-500 transition hover:border-red-500/30 hover:text-red-300 disabled:opacity-50 cursor-pointer"
                >
                  Dismiss
                </button>
                <span className={`font-mono text-[11px] font-medium ${urgency}`}>
                  {item.replyAgeLabel}
                </span>
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${
                    item.replyAgeHours >= 4
                      ? "bg-red-400"
                      : item.replyAgeHours >= 1
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
