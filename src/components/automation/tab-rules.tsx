"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TIME_ZONE_LABEL } from "@/lib/time";
import type { AutomationSettings, AutomationOverview } from "./types";

type Props = {
  settings: AutomationSettings;
  onChange: (fn: (prev: AutomationSettings) => AutomationSettings) => void;
  onSave: () => Promise<void>;
  busyKey: string | null;
};

export function RulesTab({ settings, onChange, onSave, busyKey }: Props) {
  const up = (patch: Partial<AutomationSettings>) => onChange((p) => ({ ...p, ...patch }));

  return (
    <div className="max-w-2xl space-y-5">
      {/* Engine control */}
      <Group title="Engine control">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-200">Global automation</div>
            <div className="text-xs text-zinc-500">When paused, no sends fire (initial or follow-up).</div>
          </div>
          <Toggle active={!settings.globalPaused} onClick={() => up({ globalPaused: !settings.globalPaused })} />
        </div>
      </Group>

      {/* Business hours */}
      <Group title="Business hours">
        <p className="mb-3 text-xs text-zinc-500">Sends only fire inside this window ({APP_TIME_ZONE_LABEL}, weekdays).</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start hour" value={settings.sendWindowStartHour} onChange={(v) => up({ sendWindowStartHour: v })} />
          <Field label="Start minute" value={settings.sendWindowStartMinute} onChange={(v) => up({ sendWindowStartMinute: v })} />
          <Field label="End hour" value={settings.sendWindowEndHour} onChange={(v) => up({ sendWindowEndHour: v })} />
          <Field label="End minute" value={settings.sendWindowEndMinute} onChange={(v) => up({ sendWindowEndMinute: v })} />
        </div>
      </Group>

      {/* Initial outreach rules */}
      <Group title="Initial outreach">
        <p className="mb-3 text-xs text-zinc-500">Controls for the first cold email sent to each lead.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min delay before send (min)" value={settings.initialDelayMinMinutes} onChange={(v) => up({ initialDelayMinMinutes: v })} />
          <Field label="Max delay before send (min)" value={settings.initialDelayMaxMinutes} onChange={(v) => up({ initialDelayMaxMinutes: v })} />
          <Field label="Claim batch size" value={settings.schedulerClaimBatch} onChange={(v) => up({ schedulerClaimBatch: v })} />
        </div>
      </Group>

      {/* Follow-up timing */}
      <Group title="Follow-up timing">
        <p className="mb-3 text-xs text-zinc-500">Business days between sequence steps.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Follow-up 1 (business days)" value={settings.followUp1BusinessDays} onChange={(v) => up({ followUp1BusinessDays: v })} />
          <Field label="Follow-up 2 (business days)" value={settings.followUp2BusinessDays} onChange={(v) => up({ followUp2BusinessDays: v })} />
        </div>
      </Group>

      {/* Reply detection */}
      <Group title="Reply detection">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stale check interval (min)" value={settings.replySyncStaleMinutes} onChange={(v) => up({ replySyncStaleMinutes: v })} />
        </div>
        <p className="mt-2 text-xs text-zinc-500 leading-5">
          Active sequences are checked for replies every {settings.replySyncStaleMinutes} minutes.
          When a reply is found, the sequence stops automatically.
        </p>
      </Group>

      {/* Mailbox rotation */}
      <Group title="Mailbox rotation">
        <p className="text-xs text-zinc-500 leading-5">
          New sequences round-robin across active mailboxes. Once a lead is assigned a mailbox,
          all follow-ups use the same sender to preserve thread continuity.
          Paused or at-cap mailboxes are skipped during rotation.
        </p>
      </Group>

      {/* Stop conditions */}
      <Group title="Stop conditions">
        <p className="text-xs text-zinc-500 leading-5">
          Sequences auto-stop when: a reply is received, the lead is suppressed, outreach status
          becomes incompatible, or all scheduled steps are complete. Manual stop/pause is always available.
        </p>
      </Group>

      <div className="flex items-center justify-between pt-2">
        <Button asChild size="sm" variant="ghost" className="h-8 rounded-lg border border-white/8 px-3 text-xs text-zinc-400 hover:bg-white/[0.04]">
          <Link href="/outreach">Open outreach <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
        <Button size="sm" onClick={() => void onSave()} disabled={busyKey === "settings"} className="h-8 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200">
          {busyKey === "settings" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Settings2 className="mr-1 h-3 w-3" />}
          Save rules
        </Button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="h-8 border-white/8 bg-black/30 text-sm text-zinc-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-zinc-700"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${active ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
