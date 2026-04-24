"use client";

import { useState, type FormEvent } from "react";

import { AlertTriangle, KeyRound, LockKeyhole, Monitor, ShieldCheck, TimerReset, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatusPill({
  label,
  state,
}: {
  label: string;
  state: "ready" | "attention";
}) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-widest ${
        state === "ready"
          ? "bg-emerald-400/10 text-emerald-400"
          : "bg-amber-400/10 text-amber-400"
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Operator-safe controls
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Account controls, display preferences, runtime status, integration readiness, and irreversible actions.
        </p>
      </section>

      <Card
        className="rounded-xl border-white/10 bg-white/[0.025]"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Monitor className="h-5 w-5 text-emerald-400" />
            Display & Performance
          </CardTitle>
          <CardDescription className="text-xs">
            Client-only display preferences remain local to the operator browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="glass flex items-center justify-between rounded-xl p-4 transition-colors hover:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="glass-strong flex h-9 w-9 items-center justify-center rounded-lg">
                <Zap className={`h-4 w-4 ${reducedMotion ? "text-amber-400" : "text-emerald-400"}`} />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Performance Mode</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Reduce decorative effects for longer sessions or lower-powered devices.
                </div>
              </div>
            </div>
            <button
              aria-label="Toggle performance mode"
              className={`relative h-6 w-11 rounded-full border transition-all duration-300 ${
                reducedMotion
                  ? "border-amber-400/40 bg-amber-400/30"
                  : "border-white/[0.06] bg-white/[0.08]"
              }`}
              onClick={toggle}
              type="button"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full transition-all duration-300 ${
                  reducedMotion
                    ? "left-[22px] bg-amber-400 shadow-lg shadow-amber-400/30"
                    : "left-0.5 bg-zinc-400"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
        className="rounded-xl border-white/10 bg-white/[0.025]"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              Security Posture
            </CardTitle>
            <CardDescription className="text-xs">
              Sensitive configuration is server-side only and never editable from this screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>Gemini server key</span>
              <StatusPill
                label={runtimeStatus.geminiConfigured ? "Configured" : "Missing"}
                state={runtimeStatus.geminiConfigured ? "ready" : "attention"}
              />
            </div>
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>Allowed sign-up emails</span>
              <span className="font-mono text-xs text-muted-foreground">{runtimeStatus.authAllowedCount}</span>
            </div>
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>Admin emails</span>
              <span className="font-mono text-xs text-muted-foreground">{runtimeStatus.adminEmailCount}</span>
            </div>
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>App base URL</span>
              <span className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground">
                {runtimeStatus.appBaseUrl}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card
          className="rounded-xl border-white/10 bg-white/[0.025]"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <TimerReset className="h-5 w-5 text-emerald-400" />
              Runtime Controls
            </CardTitle>
            <CardDescription className="text-xs">
              Cloudflare-safe limits for auth, exports, and scrape operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>Database target</span>
              <StatusPill
                label={runtimeStatus.databaseTarget === "cloudflare-d1" ? "D1" : "Missing"}
                state={runtimeStatus.databaseTarget === "cloudflare-d1" ? "ready" : "attention"}
              />
            </div>
            <div className="glass flex items-center justify-between rounded-xl p-3">
              <span>Browser rendering binding</span>
              <StatusPill
                label={runtimeStatus.browserRenderingConfigured ? "Bound" : "Local fallback"}
                state={runtimeStatus.browserRenderingConfigured ? "ready" : "attention"}
              />
            </div>
            <div className="glass rounded-xl p-3 text-xs text-muted-foreground">
              <div>Auth requests: {runtimeStatus.rateLimitMaxAuth} per {runtimeStatus.rateLimitWindowSeconds}s</div>
              <div>Export requests: {runtimeStatus.rateLimitMaxExport} per {runtimeStatus.rateLimitWindowSeconds}s</div>
              <div>Scrape requests: {runtimeStatus.rateLimitMaxScrape} per {runtimeStatus.rateLimitWindowSeconds}s</div>
              <div>Scrape concurrency: {runtimeStatus.scrapeConcurrencyLimit}</div>
              <div>Scrape timeout: {Math.round(runtimeStatus.scrapeTimeoutMs / 1000)}s</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="rounded-xl border-white/10 bg-white/[0.025]"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <KeyRound className="h-5 w-5 text-emerald-400" />
              Change Password
            </CardTitle>
            <CardDescription className="text-xs">
              Update the password for the currently signed-in account. Other sessions will be revoked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    autoComplete="current-password"
                    disabled={passwordSaving}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    value={currentPassword}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    autoComplete="new-password"
                    disabled={passwordSaving}
                    onChange={(event) => setNewPassword(event.target.value)}
                    type="password"
                    value={newPassword}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  autoComplete="new-password"
                  disabled={passwordSaving}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  value={confirmPassword}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Signed in as {runtimeStatus.currentUserEmail}</span>
                <Button disabled={passwordSaving} type="submit" variant="default">
                  <LockKeyhole className="h-4 w-4" />
                  {passwordSaving ? "Updating..." : "Change Password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card
          className="rounded-xl border-white/10 bg-white/[0.025]"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Trash2 className="h-5 w-5 text-amber-400" />
              Delete All Leads
            </CardTitle>
            <CardDescription className="text-xs">
              Permanently remove every lead in the database. This does not touch auth, jobs, or audit history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleDeleteAllLeads}>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/90">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Danger zone
                </div>
                <div className="mt-1 text-muted-foreground">
                  Current lead count: <span className="font-mono text-foreground">{runtimeStatus.leadCount}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Type DELETE ALL LEADS to confirm</Label>
                <Input
                  id="delete-confirm"
                  autoComplete="off"
                  disabled={deletingLeads}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE ALL LEADS"
                  value={deleteConfirm}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Irreversible once submitted.</span>
                <Button
                  disabled={deletingLeads || runtimeStatus.leadCount === 0}
                  type="submit"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingLeads ? "Deleting..." : "Delete All Leads"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
