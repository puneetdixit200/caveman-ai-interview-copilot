import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  WINDOWS_MEETING_RISK_ACTIVE_WAIT_MS,
  WINDOWS_MEETING_RISK_FAKE_MEETING_DURATION_MS,
  WINDOWS_MEETING_RISK_INITIAL_WAIT_MS,
  WINDOWS_MEETING_RISK_SMOKE_MARKER,
  parseWindowsWindowRows,
  runWindowsMeetingRiskSmoke,
  selectVisibleUsableCavemanWindow,
  selectVisibleUsableProtectedCavemanWindow,
  summarizeWindowsMeetingRiskSmoke,
  windowsPowerShellArgs
} from "./windows-meeting-risk-smoke.mjs";

const PROTECTED_WINDOW = {
  processId: 4242,
  processName: "caveman.exe",
  title: "Caveman",
  visible: true,
  width: 1280,
  height: 820,
  affinityOk: true,
  affinity: 17
};

test("selects only visible usable protected Caveman windows", () => {
  assert.ok(WINDOWS_MEETING_RISK_SMOKE_MARKER.includes("Windows EXE"));
  assert.ok(WINDOWS_MEETING_RISK_SMOKE_MARKER.includes("Google Meet"));
  assert.ok(WINDOWS_MEETING_RISK_SMOKE_MARKER.includes("Teams"));

  const rows = parseWindowsWindowRows(
    JSON.stringify([
      { ...PROTECTED_WINDOW, processName: "notepad.exe" },
      { ...PROTECTED_WINDOW, processName: "caveman.exe", width: 640 },
      { ...PROTECTED_WINDOW, processName: "caveman.exe", visible: false },
      { ...PROTECTED_WINDOW, processName: "caveman.exe", affinity: 0 },
      PROTECTED_WINDOW
    ])
  );

  assert.equal(selectVisibleUsableCavemanWindow(rows)?.affinity, 0);
  assert.equal(selectVisibleUsableProtectedCavemanWindow(rows)?.affinity, 17);
});

test("summarizes Windows meeting risk hide states", () => {
  assert.equal(
    summarizeWindowsMeetingRiskSmoke({
      platform: "win32",
      initialWindow: PROTECTED_WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams browser share window", hiddenDuringRisk: true },
        { label: "Microsoft Teams native process window", hiddenDuringRisk: true }
      ],
      restoredWindow: null,
      requireRestore: false
    }).status,
    "ready"
  );

  assert.equal(
    summarizeWindowsMeetingRiskSmoke({
      platform: "win32",
      initialWindow: PROTECTED_WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams native process window", hiddenDuringRisk: false }
      ],
      restoredWindow: null,
      requireRestore: false
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeWindowsMeetingRiskSmoke({
      platform: "linux",
      initialWindow: null,
      scenarioResults: [],
      restoredWindow: null
    }).status,
    "skipped"
  );
});

test("uses PowerShell command mode for Windows window enumeration", () => {
  assert.deepEqual(windowsPowerShellArgs("Get-Process").slice(0, 3), [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass"
  ]);
});

test("keeps simulated meeting windows alive long enough for Windows title scans", () => {
  assert.ok(WINDOWS_MEETING_RISK_INITIAL_WAIT_MS >= 30_000);
  assert.ok(WINDOWS_MEETING_RISK_ACTIVE_WAIT_MS >= 18_000);
  assert.ok(WINDOWS_MEETING_RISK_FAKE_MEETING_DURATION_MS > WINDOWS_MEETING_RISK_ACTIVE_WAIT_MS);
});

test("runs the Windows EXE against simulated Google Meet and Teams windows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "caveman-windows-risk-run-"));
  const appExePath = join(dir, "caveman.exe");
  const spawned = [];
  const killSignals = [];
  const commands = [];
  const visibleRows = JSON.stringify([PROTECTED_WINDOW]);
  const hiddenRows = "[]";
  const queryOutputs = [visibleRows, hiddenRows, hiddenRows, hiddenRows];

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(appExePath, "fake exe");

    const commandRunner = async (command, args) => {
      commands.push([command, args]);
      if (command === "taskkill") {
        return { stdout: "", stderr: "" };
      }
      return { stdout: queryOutputs.shift() ?? hiddenRows, stderr: "" };
    };

    const processSpawner = (command, args = []) => {
      spawned.push([command, args]);
      const child = new EventEmitter();
      child.exitCode = null;
      child.signalCode = null;
      child.kill = (signal) => {
        killSignals.push([command, signal]);
        child.signalCode = signal;
        child.emit("exit");
        return true;
      };
      return child;
    };

    const result = await runWindowsMeetingRiskSmoke({
      platform: "win32",
      appExePath,
      commandRunner,
      processSpawner
    });

    assert.equal(result.status, "ready");
    assert.equal(spawned[0][0], appExePath);
    assert.equal(spawned.filter(([, args]) => args.includes("-File")).length, 3);
    assert.ok(spawned.some(([, args]) => args.includes("Google Meet - Candidate Screen")));
    assert.ok(spawned.some(([, args]) => args.includes("This window is being shared")));
    assert.ok(spawned.some(([, args]) => args.includes("Microsoft Teams - Interview")));
    assert.ok(commands.some(([command, args]) => command === "taskkill" && args.includes("caveman.exe")));
    assert.ok(killSignals.some(([command]) => command === appExePath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips Windows meeting-risk smoke outside Windows", async () => {
  const result = await runWindowsMeetingRiskSmoke({ platform: "darwin" });

  assert.equal(result.status, "skipped");
});
