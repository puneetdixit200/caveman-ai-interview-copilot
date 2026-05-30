import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  MACOS_MEETING_RISK_ACTIVE_WAIT_MS,
  MACOS_MEETING_RISK_FAKE_MEETING_DURATION_MS,
  MACOS_MEETING_RISK_SMOKE_MARKER,
  cavemanActivationArgs,
  runMacosMeetingRiskSmoke,
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
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams native process", hiddenDuringRisk: true }
      ],
      restoredWindow: null,
      requireRestore: false
    }).status,
    "ready"
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

test("keeps simulated meeting windows alive long enough for macOS title scans", () => {
  assert.ok(MACOS_MEETING_RISK_ACTIVE_WAIT_MS >= 15_000);
  assert.ok(MACOS_MEETING_RISK_FAKE_MEETING_DURATION_MS > MACOS_MEETING_RISK_ACTIVE_WAIT_MS);
});

test("lets simulated meeting apps exit before checking Caveman restoration", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const killSignals = [];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killSignals.push(signal);
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit");
    }, 0);
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(killSignals, []);
});

test("terminates simulated meeting apps promptly when restoration is not required", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const killSignals = [];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killSignals.push(signal);
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit");
    }, 0);
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: false,
    restoreWaitMs: 0,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(killSignals, ["SIGTERM"]);
});
