"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, ShieldIcon, ShieldOffIcon, UserXIcon, UserCheckIcon, UsersIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean;
  createdAt: string;
  hasImage: boolean;
};

type PendingAction = {
  userId: string;
  userName: string;
  action: string;
  label: string;
  description: string;
};

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: { users: AdminUser[] }) => setUsers(data.users ?? []))
      .catch(() => setError("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction() {
    if (!pendingAction) return;
    setActioning(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pendingAction.userId, action: pendingAction.action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed");
      }
      // Refresh user list
      const refreshRes = await fetch("/api/admin/users");
      const refreshData = await refreshRes.json() as { users: AdminUser[] };
      setUsers(refreshData.users ?? []);
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400 py-4">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(v) => { if (!v) setPendingAction(null); }}
        title={pendingAction?.label ?? "Confirm"}
        description={pendingAction?.description ?? ""}
        confirmLabel={pendingAction?.label ?? "Confirm"}
        variant={pendingAction?.action === "ban" ? "destructive" : "default"}
        loading={actioning}
        onConfirm={handleAction}
      />

      <div className="flex items-center gap-2 mb-4">
        <UsersIcon className="size-4 text-emerald-300" />
        <h3 className="text-sm font-semibold text-white">User Management</h3>
        <span className="font-mono text-[10px] text-zinc-500 border border-white/[0.09] bg-black/30 rounded px-1 py-0.5">
          {users.length}
        </span>
      </div>

      <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-black/20">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                fallback={user.name}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{user.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {user.role === "admin" && (
                <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Admin
                </span>
              )}
              {user.banned && (
                <span className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                  Banned
                </span>
              )}

              <div className="flex gap-1">
                {user.role === "admin" ? (
                  <ActionButton
                    icon={<ShieldOffIcon className="size-3.5" />}
                    title="Remove admin"
                    onClick={() => setPendingAction({
                      userId: user.id,
                      userName: user.name,
                      action: "remove_admin",
                      label: "Remove Admin",
                      description: `Remove admin privileges from ${user.name}?`,
                    })}
                  />
                ) : (
                  <ActionButton
                    icon={<ShieldIcon className="size-3.5" />}
                    title="Make admin"
                    onClick={() => setPendingAction({
                      userId: user.id,
                      userName: user.name,
                      action: "make_admin",
                      label: "Make Admin",
                      description: `Grant admin privileges to ${user.name}?`,
                    })}
                  />
                )}

                {user.banned ? (
                  <ActionButton
                    icon={<UserCheckIcon className="size-3.5" />}
                    title="Unban"
                    onClick={() => setPendingAction({
                      userId: user.id,
                      userName: user.name,
                      action: "unban",
                      label: "Unban User",
                      description: `Unban ${user.name} and restore their access?`,
                    })}
                  />
                ) : (
                  <ActionButton
                    icon={<UserXIcon className="size-3.5" />}
                    title="Ban"
                    tone="destructive"
                    onClick={() => setPendingAction({
                      userId: user.id,
                      userName: user.name,
                      action: "ban",
                      label: "Ban User",
                      description: `Ban ${user.name}? They will be unable to sign in.`,
                    })}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  title,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "destructive";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex size-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
        tone === "destructive"
          ? "border-white/[0.06] text-zinc-500 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
          : "border-white/[0.06] text-zinc-500 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-zinc-300"
      }`}
    >
      {icon}
    </button>
  );
}
