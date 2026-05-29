#!/usr/bin/env node
import { mkdtemp, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const MACOS_CAPTURE_SMOKE_MARKER =
  "macOS capture smoke verifies protected Caveman window cannot be captured by window ID.";

export const CAVEMAN_WINDOW_QUERY_SWIFT = `
import CoreGraphics
import Foundation

let windows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var rows: [[String: Any]] = []
for window in windows {
  let owner = window[kCGWindowOwnerName as String] as? String ?? ""
  let name = window[kCGWindowName as String] as? String ?? ""
  if owner.lowercased().contains("caveman") {
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    rows.append([
      "ownerName": owner,
      "windowName": name,
      "windowNumber": window[kCGWindowNumber as String] as? Int ?? 0,
      "sharingState": window[kCGWindowSharingState as String] as? Int ?? -1,
      "isOnscreen": window[kCGWindowIsOnscreen as String] as? Int ?? 0,
      "width": bounds["Width"] as? Int ?? 0,
      "height": bounds["Height"] as? Int ?? 0,
      "x": bounds["X"] as? Int ?? 0,
      "y": bounds["Y"] as? Int ?? 0
    ])
  }
}
let data = try JSONSerialization.data(withJSONObject: rows)
print(String(data: data, encoding: .utf8)!)
`;

export function parseCavemanWindowRows(output) {
  const rows = JSON.parse(String(output || "[]"));
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      ownerName: String(row.ownerName ?? ""),
      windowName: String(row.windowName ?? ""),
      windowNumber: Number(row.windowNumber) || 0,
      sharingState: Number(row.sharingState),
      isOnscreen: Number(row.isOnscreen) || 0,
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      x: Number(row.x) || 0,
      y: Number(row.y) || 0
    }))
    .filter((row) => row.ownerName.toLowerCase().includes("caveman"));
}

export function selectProtectedCavemanWindow(rows) {
  return rows.find(
    (row) =>
      row.windowName === "Caveman" &&
      row.windowNumber > 0 &&
      row.sharingState === 0 &&
      row.width >= 1024 &&
      row.height >= 720
  );
}

export function summarizeMacosCaptureProtection({ platform, window, captureBlocked, captureDetail }) {
  if (platform !== "darwin") {
    return {
      status: "skipped",
      messages: ["macOS capture smoke only runs on macOS."]
    };
  }

  const messages = [];
  if (window) {
    messages.push(
      `Protected Caveman window ${window.windowNumber} is ${window.width}x${window.height} with sharingState=${window.sharingState}.`
    );
  } else {
    messages.push("No protected Caveman window with usable bounds was found.");
  }

  if (captureBlocked) {
    messages.push(`Window capture was blocked: ${captureDetail}`);
  } else {
    messages.push(`Window capture was not blocked: ${captureDetail}`);
  }

  return {
    status: window && captureBlocked ? "ready" : "blocked",
    messages
  };
}

export async function runMacosCaptureProtectionSmoke({
  platform = process.platform,
  commandRunner = execFileAsync
} = {}) {
  if (platform !== "darwin") {
    return summarizeMacosCaptureProtection({ platform });
  }

  keepMarkerReachable();
  const { stdout } = await commandRunner("swift", ["-e", CAVEMAN_WINDOW_QUERY_SWIFT], {
    maxBuffer: 1024 * 1024
  });
  const window = selectProtectedCavemanWindow(parseCavemanWindowRows(stdout));
  if (!window) {
    return summarizeMacosCaptureProtection({
      platform,
      window,
      captureBlocked: false,
      captureDetail: "no protected Caveman window was available to capture"
    });
  }

  const tempDir = await mkdtemp(join(tmpdir(), "caveman-capture-smoke-"));
  const capturePath = join(tempDir, "window.png");
  try {
    const capture = await runCaptureCommand(commandRunner, window.windowNumber, capturePath);
    const outputSize = await fileSize(capturePath);
    const captureBlocked = !capture.ok || outputSize === 0;
    const detail = capture.ok
      ? `screencapture wrote ${outputSize} bytes`
      : capture.stderr || capture.stdout || "screencapture did not create an image";
    return summarizeMacosCaptureProtection({
      platform,
      window,
      captureBlocked,
      captureDetail: detail.trim()
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runCaptureCommand(commandRunner, windowNumber, outputPath) {
  try {
    const result = await commandRunner("screencapture", ["-x", "-l", String(windowNumber), outputPath], {
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? String(error)
    };
  }
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function keepMarkerReachable() {
  return MACOS_CAPTURE_SMOKE_MARKER;
}

export async function main() {
  const result = await runMacosCaptureProtectionSmoke();
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
