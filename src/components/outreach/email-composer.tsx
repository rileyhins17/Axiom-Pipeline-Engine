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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={phase !== "sending" ? onClose : undefined} />

      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">
              {phase === "confirm" && "Confirm Email Outreach"}
              {phase === "sending" && "Sending Emails..."}
              {phase === "done" && "Outreach Complete"}
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
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Send personalized emails to {leadIds.length} lead{leadIds.length !== 1 ? "s" : ""}?
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      AI will generate a unique, personalized cold email for each lead using their enrichment data,
                      then send it from your connected Gmail account. This action cannot be undone.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-400">
                <div className="space-y-1">
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
                    <span>Dedup protection</span>
                    <span className="text-cyan-400">30-day window</span>
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
                Generating & sending emails...
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                AI is crafting personalized emails for each lead. This may take a moment.
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                  style={{ width: "100%", animation: "pulse 2s ease-in-out infinite" }}
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
                className="gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 font-bold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-cyan-500"
              >
                <Send className="h-3.5 w-3.5" />
                Send {leadIds.length} Email{leadIds.length !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {phase === "done" && (
            <Button
              onClick={onClose}
              className="gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 font-bold text-white hover:from-emerald-500 hover:to-cyan-500"
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
