import assert from "node:assert/strict";
import test from "node:test";

import {
  MACOS_SHARE_RISK_SMOKE_MARKER,
  selectVisibleUsableCavemanWindow,
  summarizeMacosShareRiskSmoke
} from "./macos-share-risk-smoke.mjs";

test("selects only protected onscreen usable Caveman windows", () => {
  const rows = [
    {
      ownerName: "Caveman",
      windowName: "Caveman",
      windowNumber: 1,
      sharingState: 0,
      isOnscreen: 0,
      width: 1280,
      height: 820
    },
    {
      ownerName: "Caveman",
      windowName: "Caveman",
      windowNumber: 2,
      sharingState: 0,
      isOnscreen: 1,
      width: 640,
      height: 410
    },
    {
      ownerName: "Caveman",
      windowName: "Caveman",
      windowNumber: 3,
      sharingState: 1,
      isOnscreen: 1,
      width: 1280,
      height: 820
    },
    {
      ownerName: "Caveman",
      windowName: "Caveman",
      windowNumber: 4,
      sharingState: 0,
      isOnscreen: 1,
      width: 1280,
      height: 820
    }
  ];

  assert.equal(selectVisibleUsableCavemanWindow(rows).windowNumber, 4);
});

test("summarizes active share-risk hide and restore states", () => {
  assert.ok(MACOS_SHARE_RISK_SMOKE_MARKER.includes("active screencapture"));

  const window = {
    ownerName: "Caveman",
    windowName: "Caveman",
    windowNumber: 10,
    sharingState: 0,
    isOnscreen: 1,
    width: 1280,
    height: 820
  };

  assert.equal(
    summarizeMacosShareRiskSmoke({
      platform: "darwin",
      initialWindow: window,
      hiddenDuringRisk: true,
      restoredWindow: window
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosShareRiskSmoke({
      platform: "darwin",
      initialWindow: window,
      hiddenDuringRisk: false,
      restoredWindow: window
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeMacosShareRiskSmoke({
      platform: "linux",
      initialWindow: null,
      hiddenDuringRisk: false,
      restoredWindow: null
    }).status,
    "skipped"
  );
});
