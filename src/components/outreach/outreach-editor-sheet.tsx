"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast-provider";
import {
  formatOutreachDate,
  getOutreachChannelLabel,
  OUTREACH_CHANNEL_OPTIONS,
  OUTREACH_STATUS_OPTIONS,
  toDateInputValue,
  type OutreachLeadFields,
  type OutreachStatus,
} from "@/lib/outreach";

export type OutreachEditableLead = {
  id: number;
  businessName: string;
  city: string;
  niche: string;
  phone: string | null;
  email: string | null;
  contactName?: string | null;
  axiomScore?: number | null;
  axiomTier?: string | null;
} & OutreachLeadFields;

type OutreachEditorSheetProps = {
  lead: OutreachEditableLead;
  onSaved: (updatedLead: OutreachEditableLead) => void;
  buttonLabel?: string;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  buttonSize?: "default" | "sm" | "xs" | "icon" | "icon-sm" | "icon-xs";
  iconOnly?: boolean;
};

export function OutreachEditorSheet({
  lead,
  onSaved,
  buttonLabel = "Outreach",
  buttonClassName,
  buttonVariant = "outline",
  buttonSize = "sm",
  iconOnly = false,
}: OutreachEditorSheetProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OutreachStatus>("NOT_CONTACTED");
  const [channel, setChannel] = useState("");
  const [nextFollowUpDue, setNextFollowUpDue] = useState("");
  const [notes, setNotes] = useState("");

  const baseline = useMemo(
    () => ({
      status: (lead.outreachStatus || "NOT_CONTACTED") as OutreachStatus,
      channel: lead.outreachChannel || "",
      nextFollowUpDue: toDateInputValue(lead.nextFollowUpDue),
      notes: lead.outreachNotes || "",
    }),
    [lead],
  );

  useEffect(() => {
    if (!open) return;
    setStatus(baseline.status);
    setChannel(baseline.channel);
    setNextFollowUpDue(baseline.nextFollowUpDue);
    setNotes(baseline.notes);
  }, [baseline, open]);

  const hasChanges =
    status !== baseline.status ||
    channel !== baseline.channel ||
    nextFollowUpDue !== baseline.nextFollowUpDue ||
    notes !== baseline.notes;

  async function handleSave() {
    if (saving) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${lead.id}/outreach`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outreachStatus: status,
          outreachChannel: status === "NOT_CONTACTED" ? null : channel || null,
          nextFollowUpDue: nextFollowUpDue || null,
          outreachNotes: notes,
          touchLastContacted:
            status !== "NOT_CONTACTED" &&
            (status !== baseline.status || channel !== baseline.channel),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update outreach");
      }

      const updatedLead = (await response.json()) as OutreachEditableLead;
      onSaved(updatedLead);
      toast("Outreach updated", { type: "success", icon: "note" });
      setOpen(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update outreach", { type: "error", icon: "note" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={buttonVariant}
          size={buttonSize}
          className={buttonClassName}
          onClick={(event) => event.stopPropagation()}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          {!iconOnly ? buttonLabel : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="border-white/[0.08] bg-black/95 text-white sm:max-w-lg"
      >
        <SheetHeader className="border-b border-white/[0.06] pb-4">
          <SheetTitle className="flex items-center gap-2 text-white">
            <MessageSquareText className="h-4 w-4 text-emerald-400" />
            Outreach Workflow
          </SheetTitle>
          <SheetDescription className="text-xs text-zinc-500">
            {lead.businessName} • {lead.city} • {lead.niche}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs">
            <div className="space-y-1">
              {lead.contactName ? <div className="text-amber-300">{lead.contactName}</div> : null}
              {lead.email ? <div className="font-mono text-cyan-300">{lead.email}</div> : null}
              {lead.phone ? <div className="font-mono text-zinc-300">{lead.phone}</div> : null}
              {!lead.contactName && !lead.email && !lead.phone ? (
                <div className="italic text-zinc-600">No contact info available</div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Status</Label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as OutreachStatus)}
                className="h-9 w-full rounded-md border border-white/[0.08] bg-black/40 px-3 text-sm text-white outline-none transition-all focus:border-emerald-500/50"
              >
                {OUTREACH_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Channel</Label>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                disabled={status === "NOT_CONTACTED"}
                className="h-9 w-full rounded-md border border-white/[0.08] bg-black/40 px-3 text-sm text-white outline-none transition-all disabled:cursor-not-allowed disabled:opacity-40 focus:border-emerald-500/50"
              >
                <option value="">Select channel</option>
                {OUTREACH_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Next Follow-Up Due</Label>
            <Input
              type="date"
              value={nextFollowUpDue}
              onChange={(event) => setNextFollowUpDue(event.target.value)}
              className="border-white/[0.08] bg-black/40 text-white focus:border-emerald-500/50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-zinc-500">Outreach Notes</Label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Log reply context, objections, timing, or next step."
              className="min-h-36 w-full resize-none rounded-md border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50"
            />
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-zinc-500">Current Timeline</div>
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <div>
                <div className="text-zinc-500">Status</div>
                <div className="text-white">{OUTREACH_STATUS_OPTIONS.find((option) => option.value === status)?.label || status}</div>
              </div>
              <div>
                <div className="text-zinc-500">Channel</div>
                <div className="text-white">{getOutreachChannelLabel(channel)}</div>
              </div>
              <div>
                <div className="text-zinc-500">First Contacted</div>
                <div className="text-white">{formatOutreachDate(lead.firstContactedAt, true)}</div>
              </div>
              <div>
                <div className="text-zinc-500">Last Contacted</div>
                <div className="text-white">{formatOutreachDate(lead.lastContactedAt, true)}</div>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t border-white/[0.06] pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Outreach"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
