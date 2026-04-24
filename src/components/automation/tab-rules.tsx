"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Rocket, Save, Settings2, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_TIME_ZONE_LABEL } from "@/lib/time";

import { DAILY_TARGET } from "./types";
import type { AutomationSettings } from "./types";
import { Divider, OperatorLabel, Panel, SectionHeader, Switch } from "./shared";

type Props = {
  settings: AutomationSettings;
  onChange: (fn: (prev: AutomationSettings) => AutomationSettings) => void;
  onSave: () => Promise<void>;
  busyKey: string | null;
};

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

export function RulesTab({ settings, onChange, onSave, busyKey }: Props) {
  const up = (patch: Partial<AutomationSettings>) => onChange((p) => ({ ...p, ...patch }));
  const applyMax = () => onChange((p) => ({ ...p, ...MAX_THROUGHPUT_PRESET }));

  const atMax =
    settings.globalPaused === MAX_THROUGHPUT_PRESET.globalPaused &&
    settings.sendWindowStartHour === MAX_THROUGHPUT_PRESET.sendWindowStartHour &&
    settings.sendWindowEndHour === MAX_THROUGHPUT_PRESET.sendWindowEndHour &&
    settings.initialDelayMinMinutes === MAX_THROUGHPUT_PRESET.initialDelayMinMinutes &&
    settings.initialDelayMaxMinutes === MAX_THROUGHPUT_PRESET.initialDelayMaxMinutes &&
    settings.schedulerClaimBatch === MAX_THROUGHPUT_PRESET.schedulerClaimBatch;

  const windowHours = (
    settings.sendWindowEndHour +
    settings.sendWindowEndMinute / 60 -
    (settings.sendWindowStartHour + settings.sendWindowStartMinute / 60)
  ).toFixed(1);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel tone="accent">
          <SectionHeader
            icon={Rocket}
            title={`Max throughput: about ${DAILY_TARGET}/day`}
            tone="accent"
            hint="Fastest safe outbound profile. Mailbox caps still protect deliverability."
          />
          <div className="grid gap-3 text-xs text-zinc-400 sm:grid-cols-3">
            <RuleMetric label="Window" value="24/7" />
            <RuleMetric label="First delay" value="1-5 min" />
            <RuleMetric label="Claim batch" value="25" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={applyMax}
              disabled={atMax}
              size="sm"
              className="h-9 cursor-pointer gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-emerald-200/60"
            >
              <Zap className="h-3.5 w-3.5" />
              {atMax ? "Preset active" : "Apply preset"}
            </Button>
            <span className="text-[10px] text-zinc-500">Save rules to commit the draft.</span>
          </div>
        </Panel>

        <RuleGroup title="Engine control">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-zinc-200">Global automation</div>
              <div className="text-xs text-zinc-500">Paused means no sends fire. Queue state is retained.</div>
            </div>
            <Switch checked={!settings.globalPaused} onCheckedChange={() => up({ globalPaused: !settings.globalPaused })} label="Global automation" />
          </div>
        </RuleGroup>

        <RuleGroup title="Send window" note={`Current window: ${windowHours} hrs/day in ${APP_TIME_ZONE_LABEL}.`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Start hour" value={settings.sendWindowStartHour} onChange={(v) => up({ sendWindowStartHour: v })} />
            <Field label="Start minute" value={settings.sendWindowStartMinute} onChange={(v) => up({ sendWindowStartMinute: v })} />
            <Field label="End hour" value={settings.sendWindowEndHour} onChange={(v) => up({ sendWindowEndHour: v })} />
            <Field label="End minute" value={settings.sendWindowEndMinute} onChange={(v) => up({ sendWindowEndMinute: v })} />
          </div>
        </RuleGroup>

        <RuleGroup title="Initial outreach throughput" note="Lower delay and larger claim batch drain the qualified queue faster.">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Min delay (min)" value={settings.initialDelayMinMinutes} onChange={(v) => up({ initialDelayMinMinutes: v })} />
            <Field label="Max delay (min)" value={settings.initialDelayMaxMinutes} onChange={(v) => up({ initialDelayMaxMinutes: v })} />
            <Field label="Claim batch size" value={settings.schedulerClaimBatch} onChange={(v) => up({ schedulerClaimBatch: v })} />
          </div>
        </RuleGroup>

        <RuleGroup title="Follow-up cadence" note="Follow-ups run after the initial email unless a reply or stop condition is detected.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Follow-up 1 (days)" value={settings.followUp1BusinessDays} onChange={(v) => up({ followUp1BusinessDays: v })} />
            <Field label="Follow-up 2 (days)" value={settings.followUp2BusinessDays} onChange={(v) => up({ followUp2BusinessDays: v })} />
          </div>
        </RuleGroup>

        <RuleGroup title="Reply detection" note={`Active sequences are checked every ${settings.replySyncStaleMinutes} minutes. Replies stop the sequence automatically.`}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Stale check interval (min)" value={settings.replySyncStaleMinutes} onChange={(v) => up({ replySyncStaleMinutes: v })} />
          </div>
        </RuleGroup>
      </div>

      <aside className="space-y-4">
        <Panel>
          <SectionHeader icon={Settings2} title="Rule model" />
          <div className="space-y-3 text-xs leading-5 text-zinc-500">
            <p>Mailbox rotation uses least-loaded active senders. A sequence keeps the same mailbox for follow-ups so Gmail threads remain intact.</p>
            <Divider />
            <p>Stop conditions: reply received, suppressed lead, incompatible outreach status, completed three-step cadence, or manual stop.</p>
            <Divider />
            <p>Backend mailbox caps are not edited here. This screen only drafts scheduler behavior.</p>
          </div>
        </Panel>

        <Panel className="sticky top-4">
          <SectionHeader title="Commit draft" hint="Changes stay local until saved." />
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={busyKey === "settings"}
              className="h-9 cursor-pointer rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed"
            >
              {busyKey === "settings" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save rules
            </Button>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-9 cursor-pointer rounded-lg border border-white/10 px-3 text-xs text-zinc-400 hover:bg-white/[0.04]"
            >
              <Link href="/outreach">
                Open outreach <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function RuleGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <OperatorLabel>{title}</OperatorLabel>
          {note ? <p className="mt-1 text-xs leading-5 text-zinc-500">{note}</p> : null}
        </div>
      </div>
      {children}
    </Panel>
  );
}

function RuleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <OperatorLabel>{label}</OperatorLabel>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{value}</div>
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
        className="h-9 border-white/10 bg-black/30 text-sm text-zinc-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
