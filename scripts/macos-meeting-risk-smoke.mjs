#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  CAVEMAN_WINDOW_QUERY_SWIFT,
  parseCavemanWindowRows
} from "./macos-capture-protection-smoke.mjs";
import { selectVisibleUsableCavemanWindow } from "./macos-share-risk-smoke.mjs";

const execFileAsync = promisify(execFile);

export const MACOS_MEETING_RISK_SMOKE_MARKER =
  "macOS meeting-risk smoke verifies Caveman hides during simulated Google Meet and Teams windows and restores after risk clears.";

const DEFAULT_BUNDLE_ID = "com.caveman.desktop";
const QUERY_MAX_BUFFER = 1024 * 1024;
const INITIAL_WAIT_MS = 6_000;
const ACTIVE_RISK_WAIT_MS = 8_000;
const RESTORE_WAIT_MS = 12_000;
const POLL_INTERVAL_MS = 250;
const FAKE_MEETING_DURATION_MS = 10_000;

const FAKE_MEETING_APP_SWIFT = `
import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.regular)

let title = CommandLine.arguments.dropFirst().first ?? "Google Meet - Candidate Screen"
let durationMs = Double(CommandLine.arguments.dropFirst(2).first ?? "10000") ?? 10000
let window = NSWindow(
  contentRect: NSRect(x: 160, y: 160, width: 720, height: 420),
  styleMask: [.titled, .closable, .resizable],
  backing: .buffered,
  defer: false
)

window.title = title
window.center()
window.makeKeyAndOrderFront(nil)
NSApp.activate(ignoringOtherApps: true)
DispatchQueue.main.asyncAfter(deadline: .now() + (durationMs / 1000.0)) {
  NSApp.terminate(nil)
}
app.run()
`;

const DEFAULT_SCENARIOS = [
  {
    id: "google-meet-browser",
    label: "Google Meet browser window",
    executableName: "Google Chrome",
    windowTitle: "Google Meet - Candidate Screen"
  },
  {
    id: "teams-browser",
    label: "Microsoft Teams browser window",
    executableName: "Microsoft Edge",
    windowTitle: "teams.microsoft.com - Interview"
  },
  {
    id: "teams-native",
    label: "Microsoft Teams native process",
    executableName: "MSTeams",
    windowTitle: "Microsoft Teams - Interview"
  }
];

export function summarizeMacosMeetingRiskSmoke({
  platform,
  initialWindow,
  scenarioResults = [],
  restoredWindow,
  detail
}) {
  if (platform !== "darwin") {
    return {
      status: "skipped",
      messages: ["macOS meeting-risk smoke only runs on macOS."]
    };
  }

  const messages = [];
  if (initialWindow) {
    messages.push(
      `Initial Caveman window ${initialWindow.windowNumber} is ${initialWindow.width}x${initialWindow.height} and protected.`
    );
  } else {
    messages.push("No initial protected onscreen Caveman window was found.");
  }

  for (const result of scenarioResults) {
    messages.push(
      result.hiddenDuringRisk
        ? `${result.label}: Caveman hid while the simulated meeting window was visible.`
        : `${result.label}: Caveman stayed visible while the simulated meeting window was visible.`
    );
  }

  if (restoredWindow) {
    messages.push(
      `Caveman restored protected onscreen window ${restoredWindow.windowNumber} at ${restoredWindow.width}x${restoredWindow.height}.`
    );
  } else {
    messages.push("Caveman did not restore a protected onscreen usable window after meeting risk cleared.");
  }

  if (detail) {
    messages.push(detail);
  }

  const allScenariosHid =
    scenarioResults.length > 0 && scenarioResults.every((result) => result.hiddenDuringRisk);
  return {
    status: initialWindow && allScenariosHid && restoredWindow ? "ready" : "blocked",
    messages
  };
}

export async function runMacosMeetingRiskSmoke({
  platform = process.platform,
  commandRunner = execFileAsync,
  processSpawner = spawn,
  bundleId = process.env.CAVEMAN_BUNDLE_ID || DEFAULT_BUNDLE_ID,
  scenarios = DEFAULT_SCENARIOS
} = {}) {
  if (platform !== "darwin") {
    return summarizeMacosMeetingRiskSmoke({ platform });
  }

  keepMarkerReachable();
  await activateCaveman(commandRunner, bundleId);
  const initialWindow = await waitForVisibleUsableWindow({ commandRunner, timeoutMs: INITIAL_WAIT_MS });
  if (!initialWindow) {
    return summarizeMacosMeetingRiskSmoke({
      platform,
      initialWindow,
      scenarioResults: [],
      restoredWindow: null
    });
  }

  const tempDir = await mkdtemp(join(tmpdir(), "caveman-meeting-risk-smoke-"));
  try {
    const scenarioResults = [];
    for (const scenario of scenarios) {
      scenarioResults.push(
        await runMeetingRiskScenario({
          tempDir,
          scenario,
          commandRunner,
          processSpawner
        })
      );
    }

    const restoredWindow = await waitForVisibleUsableWindow({ commandRunner, timeoutMs: RESTORE_WAIT_MS });
    return summarizeMacosMeetingRiskSmoke({
      platform,
      initialWindow,
      scenarioResults,
      restoredWindow
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runMeetingRiskScenario({ tempDir, scenario, commandRunner, processSpawner }) {
  const binaryPath = join(tempDir, scenario.executableName);
  const sourcePath = join(tempDir, `${scenario.id}.swift`);
  await writeFile(sourcePath, FAKE_MEETING_APP_SWIFT, "utf8");
  await commandRunner("swiftc", ["-o", binaryPath, sourcePath], { maxBuffer: QUERY_MAX_BUFFER });

  const riskProcess = processSpawner(binaryPath, [scenario.windowTitle, String(FAKE_MEETING_DURATION_MS)], {
    stdio: "ignore"
  });
  let riskProcessExited = false;
  let riskProcessError = null;
  riskProcess.once("error", (error) => {
    riskProcessError = error;
    riskProcessExited = true;
  });
  riskProcess.once("exit", () => {
    riskProcessExited = true;
  });

  try {
    const hiddenDuringRisk = await waitForCondition({
      timeoutMs: ACTIVE_RISK_WAIT_MS,
      commandRunner,
      predicate: (rows) => !selectVisibleUsableCavemanWindow(rows),
      shouldStop: () => riskProcessExited
    });
    return {
      ...scenario,
      hiddenDuringRisk,
      detail: riskProcessError ? riskProcessError.message : null
    };
  } finally {
    await stopProcess(riskProcess);
    await waitForVisibleUsableWindow({ commandRunner, timeoutMs: RESTORE_WAIT_MS });
  }
}

async function activateCaveman(commandRunner, bundleId) {
  try {
    await commandRunner("open", ["-b", bundleId], { maxBuffer: QUERY_MAX_BUFFER });
  } catch {
    // The wait below will produce the actionable failure if Caveman cannot be launched.
  }
}

async function waitForVisibleUsableWindow({ commandRunner, timeoutMs }) {
  let selectedWindow = null;
  await waitForCondition({
    timeoutMs,
    commandRunner,
    predicate: (rows) => {
      selectedWindow = selectVisibleUsableCavemanWindow(rows) || null;
      return Boolean(selectedWindow);
    }
  });
  return selectedWindow;
}

async function waitForCondition({
  timeoutMs,
  commandRunner,
  predicate,
  shouldStop = () => false,
  intervalMs = POLL_INTERVAL_MS
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const rows = await queryCavemanWindowRows(commandRunner);
    if (predicate(rows)) {
      return true;
    }
    if (shouldStop()) {
      return false;
    }
    await delay(intervalMs);
  }
  return false;
}

async function queryCavemanWindowRows(commandRunner) {
  const { stdout } = await commandRunner("swift", ["-e", CAVEMAN_WINDOW_QUERY_SWIFT], {
    maxBuffer: QUERY_MAX_BUFFER
  });
  return parseCavemanWindowRows(stdout);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exited = await waitForChildExit(child, 1_000);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 1_000);
  }
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keepMarkerReachable() {
  return MACOS_MEETING_RISK_SMOKE_MARKER;
}

export async function main() {
  const result = await runMacosMeetingRiskSmoke();
  console.log(result.status.toUpperCase());
  for (const message of result.messages) {
    console.log(`- ${message}`);
  }
  if (result.status === "blocked") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
