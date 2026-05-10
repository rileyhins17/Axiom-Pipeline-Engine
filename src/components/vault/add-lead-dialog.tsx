"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

type AddLeadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (lead: Record<string, unknown>) => void;
};

export function AddLeadDialog({ open, onOpenChange, onCreated }: AddLeadDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: "",
    niche: "",
    city: "",
    email: "",
    phone: "",
    contactName: "",
    websiteUrl: "",
    category: "",
    address: "",
    tacticalNote: "",
  });

  function reset() {
    setForm({
      businessName: "",
      niche: "",
      city: "",
      email: "",
      phone: "",
      contactName: "",
      websiteUrl: "",
      category: "",
      address: "",
      tacticalNote: "",
    });
    setError(null);
  }

  async function handleSubmit() {
    if (!form.businessName.trim() || !form.niche.trim() || !form.city.trim()) {
      setError("Business name, niche, and city are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/vault/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create lead");
      }

      const data = await res.json();
      onCreated(data.lead);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
          <DialogDescription>
            Manually add a new lead to the Vault.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">
                Business Name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="Acme Web Design"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">
                Niche <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.niche}
                onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                placeholder="Web Design"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">
                City <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Toronto"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Digital Agency"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="info@acme.ca"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 416-555-0100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Contact Name</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Website</Label>
              <Input
                value={form.websiteUrl}
                onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                placeholder="https://acme.ca"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="123 Main St, Toronto ON"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Notes</Label>
            <Textarea
              value={form.tacticalNote}
              onChange={(e) => setForm((f) => ({ ...f, tacticalNote: e.target.value }))}
              placeholder="Any tactical notes about this lead..."
              className="min-h-[60px]"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Add Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
