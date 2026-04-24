"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

type SendResult = {
  leadId: number;
  businessName: string;
  status: "sent" | "failed";
  error?: string;
};

type EmailComposerProps = {
  leadIds: number[];
  onClose: () => void;
  onComplete: (results: SendResult[]) => void;
};

export function EmailComposer({ leadIds, onClose, onComplete }: EmailComposerProps) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"confirm" | "sending" | "done">("confirm");
  const [results, setResults] = useState<SendResult[]>([]);

  const handleSend = async () => {
    setPhase("sending");

    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Send failed (${res.status})`);
      }

      const data = await res.json();
      setResults(data.results || []);
      setPhase("done");
      onComplete(data.results || []);

      const sent = data.results?.filter((r: SendResult) => r.status === "sent").length || 0;
      toast(`Sent ${sent} email${sent !== 1 ? "s" : ""} successfully`, {
        type: "success",
        icon: "note",
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Send failed", {
        type: "error",
        icon: "note",
      });
      setPhase("confirm");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={phase !== "sending" ? onClose : undefined} />

      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">
              {phase === "confirm" && "Manual send override"}
              {phase === "sending" && "Sending emails"}
              {phase === "done" && "Manual send complete"}
            </h2>
          </div>
          {phase !== "sending" && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {phase === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Send personalized email to {leadIds.length} selected lead{leadIds.length !== 1 ? "s" : ""}?
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      This is the guaranteed manual path: Axiom generates the message and sends through Gmail without waiting for automation queue rules.
                      Mailbox capacity and Gmail connection still apply.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 text-xs text-zinc-400">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Leads selected</span>
                    <span className="font-mono text-white">{leadIds.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Email generation</span>
                    <span className="text-purple-400">DeepSeek AI</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span className="text-emerald-400">Gmail API</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Automation queue</span>
                    <span className="text-amber-400">Manual override</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase === "sending" && (
            <div className="flex flex-col items-center py-8">
              <div className="relative mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
                <Send className="absolute inset-0 m-auto h-5 w-5 text-white" />
              </div>
              <div className="text-sm font-semibold text-white">
                Generating and sending emails
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                AI is crafting personalized emails for each lead. This may take a moment.
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">
                    {results.filter((r) => r.status === "sent").length}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-400/60">Sent</div>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {results.filter((r) => r.status === "failed").length}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-red-400/60">Failed</div>
                </div>
              </div>

              {/* Per-lead results */}
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-2">
                {results.map((r) => (
                  <div
                    key={r.leadId}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                  >
                    {r.status === "sent" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span className="flex-1 truncate text-white">{r.businessName}</span>
                    {r.error && (
                      <span className="truncate text-red-400/70" title={r.error}>
                        {r.error.slice(0, 40)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          {phase === "confirm" && (
            <>
              <Button
                variant="ghost"
                onClick={onClose}
                className="border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                className="gap-1.5 bg-emerald-500 font-semibold text-emerald-950 hover:bg-emerald-400"
              >
                <Send className="h-3.5 w-3.5" />
                Send manually
              </Button>
            </>
          )}
          {phase === "done" && (
            <Button
              onClick={onClose}
              className="gap-1.5 bg-emerald-500 font-semibold text-emerald-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
