"use client";

import type { ComponentType, ReactNode } from "react";
import { CheckCircle2, Mail, Monitor, ShieldCheck, TimerReset, XCircle } from "lucide-react";

type RuntimeStatus = {
  currentUserEmail: string;
  appBaseUrl: string;
  browserRenderingConfigured: boolean;
  databaseTarget: "cloudflare-d1" | "binding-missing";
  geminiConfigured: boolean;
  scrapeConcurrencyLimit: number;
  scrapeTimeoutMs: number;
  cloudScrapeEnabled: string;
};

type MailboxStatus = {
  email: string;
  connected: boolean;
  status: string | null;
};

function StatusPill({ label, state }: { label: string; state: "ready" | "attention" }) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-widest ${
        state === "ready"
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border-amber-400/25 bg-amber-400/10 text-amber-300"
      }`}
    >
      {label}
    </span>
  );
}

export function SettingsClient({
  runtimeStatus,
  mailboxes,
}: {
  runtimeStatus: RuntimeStatus;
  mailboxes: MailboxStatus[];
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Settings</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Operator console</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              The pipeline is fully autonomous. The only human action ever required is the one-time Gmail OAuth
              for each sender mailbox.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">
            Signed in as <span className="font-mono text-zinc-300">{runtimeStatus.currentUserEmail}</span>
          </div>
        </div>
      </header>

      <section>
        <Panel>
          <SectionTitle icon={Mail} title="Sender mailboxes" detail="Connect once via Google OAuth. Caps at 40 sends/day each (= 80/day total)." />
          <div className="space-y-3">
            {mailboxes.map((mailbox) => (
              <MailboxRow key={mailbox.email} mailbox={mailbox} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={ShieldCheck} title="Runtime posture" detail="Read-only signals from Cloudflare bindings." />
          <div className="space-y-2 text-sm">
            <StatusRow label="Database target">
              <StatusPill
                label={runtimeStatus.databaseTarget === "cloudflare-d1" ? "D1" : "Missing"}
                state={runtimeStatus.databaseTarget === "cloudflare-d1" ? "ready" : "attention"}
              />
            </StatusRow>
            <StatusRow label="Browser rendering">
              <StatusPill
                label={runtimeStatus.browserRenderingConfigured ? "Bound" : "Missing"}
                state={runtimeStatus.browserRenderingConfigured ? "ready" : "attention"}
              />
            </StatusRow>
            <StatusRow label="Gemini API key">
              <StatusPill
                label={runtimeStatus.geminiConfigured ? "Configured" : "Missing"}
                state={runtimeStatus.geminiConfigured ? "ready" : "attention"}
              />
            </StatusRow>
            <StatusRow label="App base URL">
              <span className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground">{runtimeStatus.appBaseUrl}</span>
            </StatusRow>
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={TimerReset} title="Scrape engine" detail="Cloudflare cron runs every 60s." />
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <Limit label="Cloud scrape" value={runtimeStatus.cloudScrapeEnabled} />
            <Limit label="Concurrency" value={String(runtimeStatus.scrapeConcurrencyLimit)} />
            <Limit label="Timeout" value={`${Math.round(runtimeStatus.scrapeTimeoutMs / 1000)}s`} />
            <Limit label="Cron" value="*/1 * * * *" />
          </div>
        </Panel>
      </section>

      <section>
        <Panel>
          <SectionTitle icon={Monitor} title="What runs autonomously" detail="No human input is required after Gmail OAuth." />
          <ul className="space-y-2 text-sm text-zinc-400">
            <Bullet>Scrape intake dispatches the next due target every cron tick (capped at 50 adequate leads/day).</Bullet>
            <Bullet>Cloudflare Browser Rendering executes the scrape and persists leads.</Bullet>
            <Bullet>Auto-pipeline enriches, qualifies, and queues leads on a rolling basis.</Bullet>
            <Bullet>Scheduler sends emails only to non-generic owner/staff inboxes (40/day per mailbox).</Bullet>
            <Bullet>Reply detection stops sequences when a recipient replies.</Bullet>
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function MailboxRow({ mailbox }: { mailbox: MailboxStatus }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${mailbox.connected ? "border-emerald-400/30 bg-emerald-400/[0.08]" : "border-zinc-700 bg-black/30"}`}>
          {mailbox.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-zinc-500" />}
        </div>
        <div>
          <div className="font-mono text-sm text-white">{mailbox.email}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {mailbox.connected ? `Connected · ${mailbox.status?.toLowerCase() ?? "warming"}` : "Not connected"}
          </div>
        </div>
      </div>
      {mailbox.connected ? (
        <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-emerald-300">
          Active
        </span>
      ) : (
        <a
          href="/api/outreach/gmail/connect"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
        >
          <Mail className="h-4 w-4" />
          Connect Gmail
        </a>
      )}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">{children}</div>;
}

function SectionTitle({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Icon className="h-4 w-4 text-zinc-400" />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-3">
      <span className="text-zinc-300">{label}</span>
      {children}
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-200">{value}</div>
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
      <span>{children}</span>
    </li>
  );
}
