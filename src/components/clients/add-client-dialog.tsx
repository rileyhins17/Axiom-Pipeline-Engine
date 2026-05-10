"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2Icon, PlusIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type VaultLead = {
  id: number;
  businessName: string;
  niche: string;
  city: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
};

type AddClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (lead: Record<string, unknown>) => void;
};

export function AddClientDialog({ open, onOpenChange, onAdded }: AddClientDialogProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VaultLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("NEGOTIATING");

  const reset = useCallback(() => {
    setSearch("");
    setResults([]);
    setSelectedId(null);
    setError(null);
    setStage("NEGOTIATING");
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    fetch(`/api/vault/leads?search=${encodeURIComponent(q)}&limit=20`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { leads: VaultLead[] }) => {
        setResults(data.leads ?? []);
      })
      .catch(() => {})
      .finally(() => setSearching(false));

    return () => controller.abort();
  }, [search, open]);

  async function handleAdd() {
    if (!selectedId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${selectedId}/deal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealStage: stage }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Failed to add client");
      }

      const updated = await res.json();
      onAdded(updated);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
          <DialogDescription>
            Search the Vault for a lead to move into the CRM pipeline.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Search Vault Leads</Label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedId(null);
                }}
                placeholder="Search by name, city, niche..."
                className="pl-9"
              />
            </div>
          </div>

          {searching && (
            <div className="flex items-center justify-center py-4">
              <Loader2Icon className="size-4 animate-spin text-zinc-500" />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/30 divide-y divide-white/[0.06]">
              {results.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className={cn(
                    "w-full px-3 py-2.5 text-left transition-colors cursor-pointer",
                    selectedId === lead.id
                      ? "bg-emerald-500/10 border-l-2 border-l-emerald-500"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <div className="text-sm font-medium text-white">{lead.businessName}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {lead.city} / {lead.niche}
                    {lead.email ? ` · ${lead.email}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && search.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-4">
              No leads found. Try a different search term.
            </p>
          )}

          {selectedId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Initial Stage</Label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              >
                <option value="NEGOTIATING">Negotiating</option>
                <option value="PROPOSAL_SENT">Proposal Sent</option>
                <option value="SIGNED">Signed</option>
                <option value="ACTIVE">Active</option>
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={saving || !selectedId}>
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Add to Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
