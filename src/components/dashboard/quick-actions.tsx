"use client";

import { useState } from "react";
import Link from "next/link";
import { DatabaseIcon, MailIcon, PlusIcon, UsersIcon } from "lucide-react";

import { AddLeadDialog } from "@/components/vault/add-lead-dialog";

export function QuickActions() {
  const [showAddLead, setShowAddLead] = useState(false);
  const [digestState, setDigestState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSendDigest() {
    setDigestState("sending");
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      setDigestState("sent");
      setTimeout(() => setDigestState("idle"), 3000);
    } catch {
      setDigestState("error");
      setTimeout(() => setDigestState("idle"), 3000);
    }
  }

  return (
    <>
      <AddLeadDialog
        open={showAddLead}
        onOpenChange={setShowAddLead}
        onCreated={() => setShowAddLead(false)}
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setShowAddLead(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3.5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 cursor-pointer"
        >
          <PlusIcon className="size-3.5" />
          Add Lead
        </button>
        <Link
          href="/vault"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3.5 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
        >
          <DatabaseIcon className="size-3.5" />
          View Vault
        </Link>
        <Link
          href="/clients"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3.5 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
        >
          <UsersIcon className="size-3.5" />
          Client Board
        </Link>
        <button
          type="button"
          onClick={handleSendDigest}
          disabled={digestState === "sending"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-3.5 py-2 text-sm font-semibold text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer"
        >
          <MailIcon className="size-3.5" />
          {digestState === "sending" ? "Sending..." : digestState === "sent" ? "Sent!" : digestState === "error" ? "Failed" : "Send Digest"}
        </button>
      </div>
    </>
  );
}
