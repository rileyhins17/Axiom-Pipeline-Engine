"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, Loader2Icon, Trash2Icon, PencilIcon, CheckIcon, XIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import {
  DEFAULT_AVATAR_CROP,
  type AvatarCropSettings,
} from "@/lib/avatar-resize";

type ProfileSectionProps = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string | null;
  };
};

export function ProfileSection({ user }: ProfileSectionProps) {
  const [image, setImage] = useState(user.image);
  const [name, setName] = useState(user.name || "");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [cropSettings, setCropSettings] =
    useState<AvatarCropSettings>(DEFAULT_AVATAR_CROP);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploading, error: uploadError, upload, remove } = useAvatarUpload(
    (url) => setImage(url || null)
  );

  const initials = (() => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    return user.email?.slice(0, 2).toUpperCase() ?? "?";
  })();

  useEffect(() => {
    return () => {
      if (pendingAvatar) URL.revokeObjectURL(pendingAvatar.previewUrl);
    };
  }, [pendingAvatar]);

  function clearPendingAvatar() {
    setPendingAvatar((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setCropSettings(DEFAULT_AVATAR_CROP);
  }

  function updateCropSetting(key: keyof AvatarCropSettings, value: number) {
    setCropSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleAvatarUpload() {
    if (!pendingAvatar) return;
    const ok = await upload(pendingAvatar.file, cropSettings);
    if (ok) clearPendingAvatar();
  }

  async function handleSaveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed.length > 50) {
      setNameError("Name must be 1–50 characters");
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }
      setName(trimmed);
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match" });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to change password");
      }
      setPasswordMsg({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMsg({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <div className="flex items-start gap-6">
        <div className="relative group">
          <Avatar src={image} fallback={initials} size="xl" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
          >
            {uploading ? (
              <Loader2Icon className="size-5 animate-spin text-white" />
            ) : (
              <CameraIcon className="size-5 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                clearPendingAvatar();
                setPendingAvatar({
                  file,
                  previewUrl: URL.createObjectURL(file),
                });
              }
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Profile Photo</h3>
            {image && (
              <Button
                variant="ghost"
                size="xs"
                onClick={remove}
                disabled={uploading}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2Icon className="size-3" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            JPEG, PNG, or WebP. Max 2MB. Resize before upload.
          </p>
          {uploadError && (
            <p className="text-xs text-red-400">{uploadError}</p>
          )}
        </div>
      </div>

      {pendingAvatar && (
        <div className="max-w-xl rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex items-center justify-center">
              <div className="size-40 overflow-hidden rounded-full border border-white/[0.12] bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingAvatar.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{
                    transform: `translate(${cropSettings.offsetX * 18}%, ${
                      cropSettings.offsetY * 18
                    }%) scale(${cropSettings.zoom})`,
                    transformOrigin: "center",
                  }}
                />
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Resize Profile Photo
                </h3>
                <p className="text-xs text-zinc-500">
                  Adjust the crop, then upload the final 200x200 image.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Zoom</Label>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={cropSettings.zoom}
                  onChange={(e) =>
                    updateCropSetting("zoom", Number(e.target.value))
                  }
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Horizontal</Label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={cropSettings.offsetX}
                  onChange={(e) =>
                    updateCropSetting("offsetX", Number(e.target.value))
                  }
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Vertical</Label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={cropSettings.offsetY}
                  onChange={(e) =>
                    updateCropSetting("offsetY", Number(e.target.value))
                  }
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleAvatarUpload}
                  disabled={uploading}
                >
                  {uploading && <Loader2Icon className="size-3.5 animate-spin" />}
                  Upload Photo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearPendingAvatar}
                  disabled={uploading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Display Name
        </Label>
        {editingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setNameValue(name);
                }
              }}
              className="max-w-xs"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleSaveName}
              disabled={savingName}
            >
              {savingName ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5 text-emerald-400" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setEditingName(false);
                setNameValue(name);
              }}
            >
              <XIcon className="size-3.5 text-zinc-400" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white">{name || "Not set"}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setNameValue(name);
                setEditingName(true);
              }}
            >
              <PencilIcon className="size-3 text-zinc-500" />
            </Button>
          </div>
        )}
        {nameError && <p className="text-xs text-red-400">{nameError}</p>}
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Email
        </Label>
        <p className="text-sm font-mono text-zinc-300">{user.email}</p>
      </div>

      {/* Role */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Role
        </Label>
        <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
          {user.role || "user"}
        </span>
      </div>

      {/* Password Change */}
      <div className="space-y-4 border-t border-white/[0.06] pt-6">
        <h3 className="text-sm font-semibold text-white">Change Password</h3>
        <div className="max-w-xs space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {passwordMsg && (
            <p
              className={`text-xs ${
                passwordMsg.type === "success" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {passwordMsg.text}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleChangePassword}
            disabled={savingPassword || !currentPassword || !newPassword}
          >
            {savingPassword && <Loader2Icon className="size-3.5 animate-spin" />}
            Update Password
          </Button>
        </div>
      </div>
    </div>
  );
}
