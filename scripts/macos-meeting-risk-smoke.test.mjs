import assert from "node:assert/strict";
import test from "node:test";

import {
  MACOS_MEETING_RISK_SMOKE_MARKER,
  cavemanActivationArgs,
  summarizeMacosMeetingRiskSmoke
} from "./macos-meeting-risk-smoke.mjs";

const WINDOW = {
  ownerName: "Caveman",
  windowName: "Caveman",
  windowNumber: 10,
  sharingState: 0,
  isOnscreen: 1,
  width: 1280,
  height: 820
};

test("summarizes simulated meeting risk hide and restore states", () => {
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Google Meet"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Teams"));

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams native process", hiddenDuringRisk: true }
      ],
      restoredWindow: WINDOW
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: false }
      ],
      restoredWindow: WINDOW
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "linux",
      initialWindow: null,
      scenarioResults: [],
      restoredWindow: null
    }).status,
    "skipped"
  );
});

test("can launch a specific packaged Caveman app bundle for meeting-risk smoke", () => {
  assert.deepEqual(cavemanActivationArgs({ appPath: "/Volumes/Caveman/Caveman.app" }), [
    "/Volumes/Caveman/Caveman.app"
  ]);
  assert.deepEqual(cavemanActivationArgs({ bundleId: "com.example.caveman" }), [
    "-b",
    "com.example.caveman"
  ]);
});
