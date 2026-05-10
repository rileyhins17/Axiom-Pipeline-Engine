"use client";

import { useState } from "react";
import Link from "next/link";
import { DatabaseIcon, PlusIcon, UsersIcon } from "lucide-react";

import { AddLeadDialog } from "@/components/vault/add-lead-dialog";

export function QuickActions() {
  const [showAddLead, setShowAddLead] = useState(false);

  return (
    <>
      <AddLeadDialog
        open={showAddLead}
        onOpenChange={setShowAddLead}
        onCreated={() => setShowAddLead(false)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddLead(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 cursor-pointer"
        >
          <PlusIcon className="size-3.5" />
          Add Lead
        </button>
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
        >
          <DatabaseIcon className="size-3.5" />
          View Vault
        </Link>
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
        >
          <UsersIcon className="size-3.5" />
          Client Board
        </Link>
      </div>
    </>
  );
}
