export const AVATAR_OUTPUT_SIZE = 200;
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 2.5;

export type AvatarCropSettings = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_AVATAR_CROP: AvatarCropSettings = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

export type AvatarCanvasDrawRect = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampAvatarCropSettings(
  settings: AvatarCropSettings
): AvatarCropSettings {
  return {
    zoom: clamp(settings.zoom, AVATAR_MIN_ZOOM, AVATAR_MAX_ZOOM),
    offsetX: clamp(settings.offsetX, -1, 1),
    offsetY: clamp(settings.offsetY, -1, 1),
  };
}

export function getAvatarCanvasDrawRect(
  imageWidth: number,
  imageHeight: number,
  settings: AvatarCropSettings = DEFAULT_AVATAR_CROP,
  outputSize = AVATAR_OUTPUT_SIZE
): AvatarCanvasDrawRect {
  if (imageWidth <= 0 || imageHeight <= 0 || outputSize <= 0) {
    throw new Error("Image and output dimensions must be positive");
  }

  const crop = clampAvatarCropSettings(settings);
  const scale = Math.max(outputSize / imageWidth, outputSize / imageHeight) * crop.zoom;
  const dw = imageWidth * scale;
  const dh = imageHeight * scale;
  const maxPanX = Math.max(0, (dw - outputSize) / 2);
  const maxPanY = Math.max(0, (dh - outputSize) / 2);

  return {
    dx: (outputSize - dw) / 2 + maxPanX * crop.offsetX,
    dy: (outputSize - dh) / 2 + maxPanY * crop.offsetY,
    dw,
    dh,
  };
}
