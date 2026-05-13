import test from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_OUTPUT_SIZE,
  clampAvatarCropSettings,
  getAvatarCanvasDrawRect,
} from "./avatar-resize";

test("avatar resize draws a square image at output size", () => {
  assert.deepEqual(
    getAvatarCanvasDrawRect(800, 800, {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    }),
    {
      dx: 0,
      dy: 0,
      dw: AVATAR_OUTPUT_SIZE,
      dh: AVATAR_OUTPUT_SIZE,
    }
  );
});

test("avatar resize cover-crops a wide image from the center", () => {
  assert.deepEqual(
    getAvatarCanvasDrawRect(1000, 500, {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    }),
    {
      dx: -100,
      dy: 0,
      dw: 400,
      dh: AVATAR_OUTPUT_SIZE,
    }
  );
});

test("avatar resize offsets stay inside the panning bounds", () => {
  assert.deepEqual(
    getAvatarCanvasDrawRect(1000, 500, {
      zoom: 1,
      offsetX: 1,
      offsetY: 1,
    }),
    {
      dx: 0,
      dy: 0,
      dw: 400,
      dh: AVATAR_OUTPUT_SIZE,
    }
  );

  assert.deepEqual(
    getAvatarCanvasDrawRect(1000, 500, {
      zoom: 1,
      offsetX: -1,
      offsetY: -1,
    }),
    {
      dx: -200,
      dy: 0,
      dw: 400,
      dh: AVATAR_OUTPUT_SIZE,
    }
  );
});

test("avatar resize clamps crop settings", () => {
  assert.deepEqual(
    clampAvatarCropSettings({
      zoom: 0.4,
      offsetX: 5,
      offsetY: -5,
    }),
    {
      zoom: 1,
      offsetX: 1,
      offsetY: -1,
    }
  );
});
