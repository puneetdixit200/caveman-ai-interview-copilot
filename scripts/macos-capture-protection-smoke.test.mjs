import assert from "node:assert/strict";
import test from "node:test";

import {
  MACOS_CAPTURE_SMOKE_MARKER,
  parseCavemanWindowRows,
  selectProtectedCavemanWindow,
  summarizeMacosCaptureProtection
} from "./macos-capture-protection-smoke.mjs";

test("parses CoreGraphics Caveman window rows", () => {
  assert.deepEqual(
    parseCavemanWindowRows(
      JSON.stringify([
        {
          ownerName: "Caveman",
          windowName: "Caveman",
          windowNumber: 2863,
          sharingState: 0,
          isOnscreen: 1,
          width: 1280,
          height: 820,
          x: 95,
          y: 58
        }
      ])
    ),
    [
      {
        ownerName: "Caveman",
        windowName: "Caveman",
        windowNumber: 2863,
        sharingState: 0,
        isOnscreen: 1,
        width: 1280,
        height: 820,
        x: 95,
        y: 58
      }
    ]
  );
});

test("selects only protected usable Caveman windows", () => {
  assert.equal(
    selectProtectedCavemanWindow([
      {
        ownerName: "Caveman",
        windowName: "Caveman",
        windowNumber: 1,
        sharingState: 1,
        width: 1280,
        height: 820
      },
      {
        ownerName: "Caveman",
        windowName: "Caveman",
        windowNumber: 2,
        sharingState: 0,
        width: 137,
        height: 142
      },
      {
        ownerName: "Caveman",
        windowName: "Caveman",
        windowNumber: 3,
        sharingState: 0,
        width: 1280,
        height: 820
      }
    ]).windowNumber,
    3
  );
});

test("summarizes blocked and ready macOS capture states", () => {
  assert.ok(MACOS_CAPTURE_SMOKE_MARKER.includes("cannot be captured by window ID"));

  assert.equal(
    summarizeMacosCaptureProtection({
      platform: "darwin",
      window: { windowNumber: 10, width: 1280, height: 820, sharingState: 0 },
      captureBlocked: true,
      captureDetail: "could not create image from window"
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosCaptureProtection({
      platform: "darwin",
      window: { windowNumber: 10, width: 1280, height: 820, sharingState: 0 },
      captureBlocked: false,
      captureDetail: "screencapture wrote 123 bytes"
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeMacosCaptureProtection({
      platform: "linux",
      window: null,
      captureBlocked: false,
      captureDetail: ""
    }).status,
    "skipped"
  );
});
