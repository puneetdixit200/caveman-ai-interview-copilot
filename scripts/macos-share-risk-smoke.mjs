#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  CAVEMAN_WINDOW_QUERY_SWIFT,
  parseCavemanWindowRows
} from "./macos-capture-protection-smoke.mjs";

const execFileAsync = promisify(execFile);

export const MACOS_SHARE_RISK_SMOKE_MARKER =
  "macOS share-risk smoke verifies Caveman hides during active screencapture and restores after risk clears.";

const DEFAULT_BUNDLE_ID = "com.caveman.desktop";
const QUERY_MAX_BUFFER = 1024 * 1024;
const INITIAL_WAIT_MS = 6_000;
const ACTIVE_RISK_WAIT_MS = 5_000;
const RESTORE_WAIT_MS = 12_000;
const POLL_INTERVAL_MS = 250;

export function selectVisibleUsableCavemanWindow(rows) {
  return rows.find(
    (row) =>
      row.windowName === "Caveman" &&
      row.windowNumber > 0 &&
      row.sharingState === 0 &&
      row.isOnscreen === 1 &&
      row.width >= 1024 &&
      row.height >= 720
  );
}

export function summarizeMacosShareRiskSmoke({
  platform,
  initialWindow,
  hiddenDuringRisk,
  restoredWindow,
  detail
}) {
  if (platform !== "darwin") {
    return {
      status: "skipped",
      messages: ["macOS share-risk smoke only runs on macOS."]
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

  messages.push(
    hiddenDuringRisk
      ? "Caveman left protected onscreen usable window state while screencapture was active."
      : "Caveman stayed in protected onscreen usable window state while screencapture was active."
  );

  if (restoredWindow) {
    messages.push(
      `Caveman restored protected onscreen window ${restoredWindow.windowNumber} at ${restoredWindow.width}x${restoredWindow.height}.`
    );
  } else {
    messages.push("Caveman did not restore a protected onscreen usable window after screencapture cleared.");
  }

  if (detail) {
    messages.push(detail);
  }

  return {
    status: initialWindow && hiddenDuringRisk && restoredWindow ? "ready" : "blocked",
    messages
  };
}

export async function runMacosShareRiskSmoke({
  platform = process.platform,
  commandRunner = execFileAsync,
  processSpawner = spawn,
  bundleId = process.env.CAVEMAN_BUNDLE_ID || DEFAULT_BUNDLE_ID
} = {}) {
  if (platform !== "darwin") {
    return summarizeMacosShareRiskSmoke({ platform });
  }

  keepMarkerReachable();
  await activateCaveman(commandRunner, bundleId);
  const initialWindow = await waitForVisibleUsableWindow({ commandRunner, timeoutMs: INITIAL_WAIT_MS });
  if (!initialWindow) {
    return summarizeMacosShareRiskSmoke({
      platform,
      initialWindow,
      hiddenDuringRisk: false,
      restoredWindow: null
    });
  }

  const tempDir = await mkdtemp(join(tmpdir(), "caveman-share-risk-smoke-"));
  const capturePath = join(tempDir, "screen.png");
  const riskProcess = processSpawner("screencapture", ["-x", "-T", "8", capturePath], {
    stdio: "ignore"
  });
  let riskProcessError = null;
  let riskProcessExited = false;
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
    await stopProcess(riskProcess);
    const restoredWindow = await waitForVisibleUsableWindow({ commandRunner, timeoutMs: RESTORE_WAIT_MS });
    return summarizeMacosShareRiskSmoke({
      platform,
      initialWindow,
      hiddenDuringRisk,
      restoredWindow,
      detail: riskProcessError ? `screencapture failed to start: ${riskProcessError.message}` : null
    });
  } finally {
    await stopProcess(riskProcess);
    await rm(tempDir, { recursive: true, force: true });
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
  return MACOS_SHARE_RISK_SMOKE_MARKER;
}

export async function main() {
  const result = await runMacosShareRiskSmoke();
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
