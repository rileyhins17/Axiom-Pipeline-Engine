"use client";

import { useState, useCallback } from "react";

import {
  AVATAR_OUTPUT_SIZE,
  DEFAULT_AVATAR_CROP,
  type AvatarCropSettings,
  getAvatarCanvasDrawRect,
} from "@/lib/avatar-resize";

const MAX_RAW_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function resizeImage(
  file: File,
  cropSettings: AvatarCropSettings = DEFAULT_AVATAR_CROP
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      const { dx, dy, dw, dh } = getAvatarCanvasDrawRect(
        img.width,
        img.height,
        cropSettings
      );
      ctx.drawImage(img, dx, dy, dw, dh);

      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export function useAvatarUpload(onSuccess?: (imageUrl: string) => void) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, cropSettings: AvatarCropSettings = DEFAULT_AVATAR_CROP) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Please upload a JPEG, PNG, or WebP image");
        return false;
      }

      if (file.size > MAX_RAW_SIZE) {
        setError("Image must be under 2MB");
        return false;
      }

      setUploading(true);
      try {
        const dataUri = await resizeImage(file, cropSettings);

        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUri }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Upload failed");
        }

        onSuccess?.(dataUri);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        return false;
      } finally {
        setUploading(false);
      }
    },
    [onSuccess]
  );

  const remove = useCallback(async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Remove failed");
      }
      onSuccess?.("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }, [onSuccess]);

  return { uploading, error, upload, remove };
}
