"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, RefreshCw } from "lucide-react";

type ReactivateResult = {
  ok: boolean;
  needsReconnect?: boolean;
  message?: string;
  connectUrl?: string;
  error?: string;
};

export function MailboxReactivateButton({ mailboxId, gmailAddress }: { mailboxId: string; gmailAddress: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReactivateResult | null>(null);

  async function onClick() {
    setResult(null);
    try {
      const res = await fetch(`/api/outreach/automation/mailboxes/${mailboxId}/reactivate`, {
        method: "POST",
      });
      const data = (await res.json()) as ReactivateResult;
      setResult(data);
      if (data.ok) {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Request failed" });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/[0.16] disabled:opacity-50"
      >
        {pending ? <RefreshCw className="size-3 animate-spin" /> : <Power className="size-3" />}
        Reactivate inbox
      </button>
      {result ? (
        <div className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${
          result.ok
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : result.needsReconnect
              ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-200"
              : "border-red-400/30 bg-red-400/[0.08] text-red-200"
        }`}>
          {result.message || result.error || (result.ok ? "Reactivated." : "Failed.")}
          {result.needsReconnect && result.connectUrl ? (
            <a
              href={result.connectUrl}
              className="ml-2 underline hover:text-white"
            >
              Reconnect {gmailAddress}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
