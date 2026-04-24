"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Rocket, Settings2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TIME_ZONE_LABEL } from "@/lib/time";
import type { AutomationSettings } from "./types";

type Props = {
  settings: AutomationSettings;
  onChange: (fn: (prev: AutomationSettings) => AutomationSettings) => void;
  onSave: () => Promise<void>;
  busyKey: string | null;
  dailyTarget: number;
};

/**
 * "Max throughput" preset — one click sets every knob to the fastest
 * sensible values: 24/7 window, 1-5 min first-touch delay, 25-step claim
 * batch. Still respects per-mailbox caps (40/day, 12/hour, 120s gap)
 * which are backend constants and protect sender reputation.
 */
const MAX_THROUGHPUT_PRESET = {
  globalPaused: false,
  sendWindowStartHour: 0,
  sendWindowStartMinute: 0,
  sendWindowEndHour: 23,
  sendWindowEndMinute: 59,
  weekdaysOnly: false,
  initialDelayMinMinutes: 1,
  initialDelayMaxMinutes: 5,
  schedulerClaimBatch: 25,
  replySyncStaleMinutes: 15,
} as const;

export function RulesTab({ settings, onChange, onSave, busyKey, dailyTarget }: Props) {
  const up = (patch: Partial<AutomationSettings>) => onChange((p) => ({ ...p, ...patch }));
  const applyMax = () => onChange((p) => ({ ...p, ...MAX_THROUGHPUT_PRESET }));

  const atMax =
    settings.globalPaused === MAX_THROUGHPUT_PRESET.globalPaused &&
    settings.sendWindowStartHour === MAX_THROUGHPUT_PRESET.sendWindowStartHour &&
    settings.sendWindowEndHour === MAX_THROUGHPUT_PRESET.sendWindowEndHour &&
    settings.initialDelayMinMinutes === MAX_THROUGHPUT_PRESET.initialDelayMinMinutes &&
    settings.initialDelayMaxMinutes === MAX_THROUGHPUT_PRESET.initialDelayMaxMinutes &&
    settings.schedulerClaimBatch === MAX_THROUGHPUT_PRESET.schedulerClaimBatch;

  return (
    <div className="max-w-2xl space-y-5">
      {/* Max-throughput preset — the one-click path to "just send emails" */}
      <div className="rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-300">
            Max throughput — ~{dailyTarget} emails/day across connected mailboxes
          </h3>
        </div>
        <p className="text-xs leading-5 text-zinc-400">
          One click sets everything for the fastest safe sending: 24/7 window,
          1-5 min first-touch delay, 25-step batch per run. Per-mailbox caps
          (40/day, 12/hour, 2 min between sends) still apply so you don&apos;t
          risk deliverability.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            onClick={applyMax}
            disabled={atMax}
            size="sm"
            className="h-8 cursor-pointer gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-emerald-200/60"
          >
            <Zap className="h-3 w-3" />
            {atMax ? "Max throughput active" : "Apply max throughput"}
          </Button>
          <span className="text-[10px] text-zinc-500">
            Remember to hit &ldquo;Save rules&rdquo; below.
          </span>
        </div>
      </div>

      <Group title="Engine control">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-200">Global automation</div>
            <div className="text-xs text-zinc-500">
              When paused, no sends fire. Queue keeps growing and resumes where it left off.
            </div>
          </div>
          <Toggle
            active={!settings.globalPaused}
            onClick={() => up({ globalPaused: !settings.globalPaused })}
          />
        </div>
      </Group>

      <Group title="Send window">
        <p className="mb-3 text-xs text-zinc-500">
          Sends only fire inside this window ({APP_TIME_ZONE_LABEL}). For true
          24/7 operation set 00:00 &rarr; 23:59.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Start hour"
            value={settings.sendWindowStartHour}
            onChange={(v) => up({ sendWindowStartHour: v })}
          />
          <Field
            label="Start minute"
            value={settings.sendWindowStartMinute}
            onChange={(v) => up({ sendWindowStartMinute: v })}
          />
          <Field
            label="End hour"
            value={settings.sendWindowEndHour}
            onChange={(v) => up({ sendWindowEndHour: v })}
          />
          <Field
            label="End minute"
            value={settings.sendWindowEndMinute}
            onChange={(v) => up({ sendWindowEndMinute: v })}
          />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Current window:{" "}
          {(
            settings.sendWindowEndHour +
            settings.sendWindowEndMinute / 60 -
            (settings.sendWindowStartHour + settings.sendWindowStartMinute / 60)
          ).toFixed(1)}{" "}
          hrs / day.
        </p>
      </Group>

      <Group title="Initial outreach throughput">
        <p className="mb-3 text-xs text-zinc-500">
          Controls for the first cold email sent to each lead. Lower delays and
          a larger claim batch = faster draining of the queue.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Min delay (min)"
            value={settings.initialDelayMinMinutes}
            onChange={(v) => up({ initialDelayMinMinutes: v })}
          />
          <Field
            label="Max delay (min)"
            value={settings.initialDelayMaxMinutes}
            onChange={(v) => up({ initialDelayMaxMinutes: v })}
          />
          <Field
            label="Claim batch size"
            value={settings.schedulerClaimBatch}
            onChange={(v) => up({ schedulerClaimBatch: v })}
          />
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Max-throughput preset: min 1, max 5, batch 25.
        </p>
      </Group>

      <Group title="Follow-up cadence">
        <p className="mb-3 text-xs text-zinc-500">
          After the initial email, follow-up 1 sends N days later, then
          follow-up 2 sends N more days after that. Calendar days when
          weekdays-only is off (24/7 mode).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Follow-up 1 (days)"
            value={settings.followUp1BusinessDays}
            onChange={(v) => up({ followUp1BusinessDays: v })}
          />
          <Field
            label="Follow-up 2 (days)"
            value={settings.followUp2BusinessDays}
            onChange={(v) => up({ followUp2BusinessDays: v })}
          />
        </div>
      </Group>

      <Group title="Automatic reply detection">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Stale check interval (min)"
            value={settings.replySyncStaleMinutes}
            onChange={(v) => up({ replySyncStaleMinutes: v })}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Active sequences are checked for replies every{" "}
          {settings.replySyncStaleMinutes} minutes. When a reply is found the
          sequence stops automatically — no manual sync needed.
        </p>
      </Group>

      <Group title="Mailbox rotation">
        <p className="text-xs leading-5 text-zinc-500">
          New sequences round-robin across active mailboxes by least-loaded
          first. Once a lead is assigned a mailbox, that sender is retained
          for all follow-up steps so Gmail keeps the thread intact. Paused or
          at-cap mailboxes are skipped.
        </p>
      </Group>

      <Group title="Stop conditions">
        <p className="text-xs leading-5 text-zinc-500">
          Sequences auto-stop when: a reply is received, the lead is
          suppressed, outreach status becomes incompatible, or all 3 steps
          have sent. Manual stop / pause is always available from the Queue tab.
        </p>
      </Group>

      <div className="flex items-center justify-between pt-2">
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 cursor-pointer rounded-lg border border-white/10 px-3 text-xs text-zinc-400 hover:bg-white/[0.04]"
        >
          <Link href="/outreach">
            Open outreach <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={() => void onSave()}
          disabled={busyKey === "settings"}
          className="h-8 cursor-pointer rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed"
        >
          {busyKey === "settings" ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Settings2 className="mr-1 h-3 w-3" />
          )}
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="h-8 border-white/10 bg-black/30 text-sm text-zinc-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
        active ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          active ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
