"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Rocket, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TIME_ZONE_LABEL } from "@/lib/time";
import { DAILY_TARGET } from "./types";
import type { AutomationSettings } from "./types";

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
      <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-300">Daily Send Target: {DAILY_TARGET} emails</h3>
        </div>
        <p className="text-xs leading-5 text-zinc-400">
          The engine targets {DAILY_TARGET} outreach emails per day across the connected inboxes. To achieve this, make sure:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          <li>- At least 2 mailboxes are connected with 20/day caps each</li>
          <li>- Claim batch is set to 10+ so enough leads enter the queue per run</li>
          <li>- Initial delay is kept short (3-12 min) for fast queue throughput</li>
          <li>- Business hours window is at least 7 hours to spread sends naturally</li>
        </ul>
      </div>

      <Group title="Engine control">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-200">Global automation</div>
            <div className="text-xs text-zinc-500">When paused, no sends fire.</div>
          </div>
          <Toggle active={!settings.globalPaused} onClick={() => up({ globalPaused: !settings.globalPaused })} />
        </div>
      </Group>

      <Group title="Business hours">
        <p className="mb-3 text-xs text-zinc-500">Sends only fire inside this window ({APP_TIME_ZONE_LABEL}).</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start hour" value={settings.sendWindowStartHour} onChange={(v) => up({ sendWindowStartHour: v })} />
          <Field label="Start minute" value={settings.sendWindowStartMinute} onChange={(v) => up({ sendWindowStartMinute: v })} />
          <Field label="End hour" value={settings.sendWindowEndHour} onChange={(v) => up({ sendWindowEndHour: v })} />
          <Field label="End minute" value={settings.sendWindowEndMinute} onChange={(v) => up({ sendWindowEndMinute: v })} />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          For {DAILY_TARGET}/day: window needs ~{Math.ceil(DAILY_TARGET / 6)} hrs minimum. Current:{" "}
          {((settings.sendWindowEndHour + settings.sendWindowEndMinute / 60) - (settings.sendWindowStartHour + settings.sendWindowStartMinute / 60)).toFixed(1)} hrs.
        </p>
      </Group>

      <Group title="Initial outreach throughput">
        <p className="mb-3 text-xs text-zinc-500">
          Controls for the first cold email sent to each lead. Lower delays and higher batch sizes mean faster throughput.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min delay (min)" value={settings.initialDelayMinMinutes} onChange={(v) => up({ initialDelayMinMinutes: v })} />
          <Field label="Max delay (min)" value={settings.initialDelayMaxMinutes} onChange={(v) => up({ initialDelayMaxMinutes: v })} />
          <Field label="Claim batch size" value={settings.schedulerClaimBatch} onChange={(v) => up({ schedulerClaimBatch: v })} />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">Recommended for {DAILY_TARGET}/day: min delay 3, max delay 12, batch 10+.</p>
      </Group>

      <Group title="Sequence policy">
        <p className="text-xs leading-5 text-zinc-500">
          This sender currently runs initial outreach only. Reply detection is automatic, and any reply stops the sequence without manual sync.
        </p>
      </Group>

      <Group title="Automatic reply detection">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stale check interval (min)" value={settings.replySyncStaleMinutes} onChange={(v) => up({ replySyncStaleMinutes: v })} />
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Active sequences are checked for replies every {settings.replySyncStaleMinutes} minutes. When a reply is found, the sequence stops automatically.
        </p>
      </Group>

      <Group title="Mailbox rotation">
        <p className="text-xs leading-5 text-zinc-500">
          New sequences round-robin across active mailboxes. Once a lead is assigned a mailbox, that sender is retained for any future thread steps to preserve continuity. Paused or at-cap mailboxes are skipped during rotation.
        </p>
      </Group>

      <Group title="Stop conditions">
        <p className="text-xs leading-5 text-zinc-500">
          Sequences auto-stop when: a reply is received, the lead is suppressed, outreach status becomes incompatible, or all scheduled steps are complete. Manual stop/pause is always available.
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
