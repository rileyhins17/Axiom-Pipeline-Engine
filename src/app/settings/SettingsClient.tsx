"use client";

import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";

import { AlertTriangle, KeyRound, LockKeyhole, Mail, Monitor, ShieldCheck, TimerReset, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { usePerformance } from "@/lib/ui/performance";

type RuntimeStatus = {
  currentUserEmail: string;
  appBaseUrl: string;
  authAllowedCount: number;
  adminEmailCount: number;
  leadCount: number;
  browserRenderingConfigured: boolean;
  databaseTarget: "cloudflare-d1" | "binding-missing";
  geminiConfigured: boolean;
  rateLimitMaxAuth: number;
  rateLimitMaxExport: number;
  rateLimitMaxScrape: number;
  rateLimitWindowSeconds: number;
  scrapeConcurrencyLimit: number;
  scrapeTimeoutMs: number;
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

export function SettingsClient({ runtimeStatus }: { runtimeStatus: RuntimeStatus }) {
  const { reducedMotion, toggle } = usePerformance();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingLeads, setDeletingLeads] = useState(false);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword) {
      toast("Enter your current and new password.", { type: "error" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast("New passwords do not match.", { type: "error" });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Failed to change password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password updated. Other sessions were revoked.", { type: "success" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to change password.", { type: "error" });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleDeleteAllLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const confirmation = deleteConfirm.trim();
    if (confirmation !== "DELETE ALL LEADS") {
      toast('Type "DELETE ALL LEADS" to confirm.', { type: "error" });
      return;
    }

    if (!window.confirm(`Delete all ${runtimeStatus.leadCount} leads from the database? This cannot be undone.`)) {
      return;
    }

    setDeletingLeads(true);
    try {
      const response = await fetch("/api/leads/delete-all", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirm: confirmation,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string; deletedCount?: number } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete all leads.");
      }

      setDeleteConfirm("");
      toast(`Deleted ${data?.deletedCount ?? runtimeStatus.leadCount} leads.`, { type: "info" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete all leads.", { type: "error" });
    } finally {
      setDeletingLeads(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <OperatorLabel>Settings</OperatorLabel>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Operator controls</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Runtime posture, account security, browser preference, and isolated destructive actions.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">
            Signed in as <span className="font-mono text-zinc-300">{runtimeStatus.currentUserEmail}</span>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <SectionTitle icon={Monitor} title="Display and performance" detail="Local browser preference." />
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                <Zap className={`h-4 w-4 ${reducedMotion ? "text-amber-300" : "text-emerald-300"}`} />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Performance mode</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Reduce decorative motion and effects.</div>
              </div>
            </div>
            <button
              aria-label="Toggle performance mode"
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                reducedMotion ? "border-amber-400/40 bg-amber-400/30" : "border-white/10 bg-white/[0.08]"
              }`}
              onClick={toggle}
              type="button"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
                  reducedMotion ? "left-[22px] bg-amber-400 shadow-lg shadow-amber-400/30" : "left-0.5 bg-zinc-400"
                }`}
              />
            </button>
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={ShieldCheck} title="Security posture" detail="Read-only runtime signals." />
          <div className="space-y-2 text-sm">
            <StatusRow label="Gemini server key">
              <StatusPill label={runtimeStatus.geminiConfigured ? "Configured" : "Missing"} state={runtimeStatus.geminiConfigured ? "ready" : "attention"} />
            </StatusRow>
            <StatusRow label="Allowed sign-up emails">
              <span className="font-mono text-xs text-muted-foreground">{runtimeStatus.authAllowedCount}</span>
            </StatusRow>
            <StatusRow label="Admin emails">
              <span className="font-mono text-xs text-muted-foreground">{runtimeStatus.adminEmailCount}</span>
            </StatusRow>
            <StatusRow label="App base URL">
              <span className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground">{runtimeStatus.appBaseUrl}</span>
            </StatusRow>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={TimerReset} title="Runtime limits" detail="Cloudflare-safe request and scrape limits." />
          <div className="space-y-2 text-sm">
            <StatusRow label="Database target">
              <StatusPill label={runtimeStatus.databaseTarget === "cloudflare-d1" ? "D1" : "Missing"} state={runtimeStatus.databaseTarget === "cloudflare-d1" ? "ready" : "attention"} />
            </StatusRow>
            <StatusRow label="Browser rendering">
              <StatusPill label={runtimeStatus.browserRenderingConfigured ? "Bound" : "Local fallback"} state={runtimeStatus.browserRenderingConfigured ? "ready" : "attention"} />
            </StatusRow>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <Limit label="Auth" value={`${runtimeStatus.rateLimitMaxAuth}/${runtimeStatus.rateLimitWindowSeconds}s`} />
            <Limit label="Export" value={`${runtimeStatus.rateLimitMaxExport}/${runtimeStatus.rateLimitWindowSeconds}s`} />
            <Limit label="Scrape" value={`${runtimeStatus.rateLimitMaxScrape}/${runtimeStatus.rateLimitWindowSeconds}s`} />
            <Limit label="Concurrency" value={String(runtimeStatus.scrapeConcurrencyLimit)} />
            <Limit label="Timeout" value={`${Math.round(runtimeStatus.scrapeTimeoutMs / 1000)}s`} />
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={KeyRound} title="Change password" detail="Other sessions are revoked after update." />
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Current password" id="current-password">
                <Input
                  id="current-password"
                  autoComplete="current-password"
                  disabled={passwordSaving}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  value={currentPassword}
                />
              </Field>
              <Field label="New password" id="new-password">
                <Input
                  id="new-password"
                  autoComplete="new-password"
                  disabled={passwordSaving}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  value={newPassword}
                />
              </Field>
            </div>
            <Field label="Confirm new password" id="confirm-password">
              <Input
                id="confirm-password"
                autoComplete="new-password"
                disabled={passwordSaving}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </Field>
            <div className="flex items-center justify-end">
              <Button disabled={passwordSaving} type="submit" variant="default">
                <LockKeyhole className="h-4 w-4" />
                {passwordSaving ? "Updating..." : "Change password"}
              </Button>
            </div>
          </form>
        </Panel>
      </section>

      <section>
        <Panel>
          <SectionTitle icon={Mail} title="Gmail integration" detail="Connect your Gmail account to send emails from the automation engine." />
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-100">Connect a Gmail sender account</p>
              <p className="text-xs text-zinc-500">You can connect multiple Gmail accounts to spread sends across inboxes.</p>
            </div>
            <a
              href="/api/outreach/gmail/connect"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 cursor-pointer whitespace-nowrap"
            >
              <Mail className="h-4 w-4" />
              Connect Gmail
            </a>
          </div>
        </Panel>
      </section>

      <section className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-5 shadow-[0_22px_80px_rgba(0,0,0,0.18)]">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
              <AlertTriangle className="h-4 w-4" />
              Danger zone
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Delete all leads</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Permanently removes every lead in the database. Auth, jobs, and audit history are not touched.
            </p>
            <div className="mt-4 inline-flex rounded-lg border border-rose-400/20 bg-black/20 px-3 py-2 text-xs text-rose-100/90">
              Current lead count: <span className="ml-1 font-mono text-white">{runtimeStatus.leadCount}</span>
            </div>
          </div>

          <form className="space-y-4 rounded-xl border border-rose-400/20 bg-black/20 p-4" onSubmit={handleDeleteAllLeads}>
            <Field label="Type DELETE ALL LEADS to confirm" id="delete-confirm">
              <Input
                id="delete-confirm"
                autoComplete="off"
                disabled={deletingLeads}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder="DELETE ALL LEADS"
                value={deleteConfirm}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Irreversible once submitted.</span>
              <Button disabled={deletingLeads || runtimeStatus.leadCount === 0} type="submit" variant="destructive">
                <Trash2 className="h-4 w-4" />
                {deletingLeads ? "Deleting..." : "Delete all leads"}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function OperatorLabel({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">{children}</p>;
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

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
