#!/usr/bin/env node
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_WINDOWS_APP_EXE = join(REPO_ROOT, "src-tauri", "target", "release", "caveman.exe");
const POWERSHELL = process.env.CAVEMAN_WINDOWS_POWERSHELL || "powershell.exe";
const QUERY_MAX_BUFFER = 1024 * 1024 * 8;
const RESTORE_WAIT_MS = 8_000;
const POLL_INTERVAL_MS = 250;
const WDA_MONITOR = 1;
const WDA_EXCLUDEFROMCAPTURE = 17;

export const WINDOWS_MEETING_RISK_ACTIVE_WAIT_MS = 18_000;
export const WINDOWS_MEETING_RISK_FAKE_MEETING_DURATION_MS = 24_000;
export const WINDOWS_MEETING_RISK_INITIAL_WAIT_MS = 30_000;
export const WINDOWS_MEETING_RISK_SMOKE_MARKER =
  "Windows EXE meeting-risk smoke launches the built app and verifies Caveman hides during simulated Google Meet and Teams windows.";

export const WINDOWS_CAVEMAN_WINDOW_QUERY_POWERSHELL = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CavemanWindowQuery {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool QueryFullProcessImageNameW(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

  public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
}
"@

function Read-WindowTitle([IntPtr]$Hwnd) {
  $length = [CavemanWindowQuery]::GetWindowTextLengthW($Hwnd)
  if ($length -le 0) {
    return ""
  }
  $builder = [System.Text.StringBuilder]::new($length + 1)
  [void][CavemanWindowQuery]::GetWindowTextW($Hwnd, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Read-ProcessPath([uint32]$ProcessId) {
  if ($ProcessId -eq 0) {
    return ""
  }
  $handle = [CavemanWindowQuery]::OpenProcess([CavemanWindowQuery]::PROCESS_QUERY_LIMITED_INFORMATION, $false, $ProcessId)
  if ($handle -eq [IntPtr]::Zero) {
    return ""
  }
  try {
    $capacity = 4096
    $builder = [System.Text.StringBuilder]::new($capacity)
    if ([CavemanWindowQuery]::QueryFullProcessImageNameW($handle, 0, $builder, [ref]$capacity)) {
      return $builder.ToString()
    }
    return ""
  } finally {
    [void][CavemanWindowQuery]::CloseHandle($handle)
  }
}

$rows = [System.Collections.Generic.List[object]]::new()
[void][CavemanWindowQuery]::EnumWindows({
  param([IntPtr]$hwnd, [IntPtr]$lparam)

  [uint32]$processId = 0
  [void][CavemanWindowQuery]::GetWindowThreadProcessId($hwnd, [ref]$processId)
  $rect = [CavemanWindowQuery+RECT]::new()
  [void][CavemanWindowQuery]::GetWindowRect($hwnd, [ref]$rect)
  [uint32]$affinity = 0
  $affinityOk = [CavemanWindowQuery]::GetWindowDisplayAffinity($hwnd, [ref]$affinity)
  $path = Read-ProcessPath $processId
  $processName = if ([string]::IsNullOrWhiteSpace($path)) { [string]$processId } else { [System.IO.Path]::GetFileName($path) }

  [void]$rows.Add([pscustomobject]@{
    processId = $processId
    processName = $processName
    path = $path
    title = Read-WindowTitle $hwnd
    visible = [CavemanWindowQuery]::IsWindowVisible($hwnd)
    width = [Math]::Max(0, $rect.Right - $rect.Left)
    height = [Math]::Max(0, $rect.Bottom - $rect.Top)
    x = $rect.Left
    y = $rect.Top
    affinityOk = $affinityOk
    affinity = $affinity
  })
  return $true
}, [IntPtr]::Zero)

$json = ConvertTo-Json -InputObject @($rows.ToArray()) -Compress -Depth 4
if ([string]::IsNullOrWhiteSpace($json)) {
  "[]"
} else {
  $json
}
`;

const FAKE_MEETING_WINDOW_POWERSHELL = `
param(
  [string]$Title = "Google Meet - Candidate Screen",
  [int]$DurationMs = 20000
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = [System.Windows.Forms.Form]::new()
$form.Text = $Title
$form.Width = 720
$form.Height = 420
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.ShowInTaskbar = $true

$label = [System.Windows.Forms.Label]::new()
$label.Text = $Title
$label.AutoSize = $false
$label.Dock = [System.Windows.Forms.DockStyle]::Fill
$label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$label.Font = [System.Drawing.Font]::new("Segoe UI", 18)
[void]$form.Controls.Add($label)

$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = [Math]::Max(1000, $DurationMs)
$timer.Add_Tick({
  $timer.Stop()
  $form.Close()
})
$timer.Start()

[void]$form.ShowDialog()
`;

const DEFAULT_SCENARIOS = [
  {
    id: "google-meet-browser",
    label: "Google Meet browser window",
    windowTitle: "Google Meet - Candidate Screen"
  },
  {
    id: "teams-browser-share",
    label: "Microsoft Teams browser share window",
    windowTitle: "This window is being shared"
  },
  {
    id: "teams-native",
    label: "Microsoft Teams native process window",
    windowTitle: "Microsoft Teams - Interview"
  }
];

export function windowsPowerShellArgs(script) {
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script];
}

export function parseWindowsWindowRows(output) {
  let parsed;
  try {
    parsed = JSON.parse(String(output || "[]"));
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row) => ({
    processId: Number(row.processId) || 0,
    processName: String(row.processName ?? ""),
    path: String(row.path ?? ""),
    title: String(row.title ?? ""),
    visible: Boolean(row.visible),
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    affinityOk: Boolean(row.affinityOk),
    affinity: Number(row.affinity) || 0
  }));
}

export function selectVisibleUsableCavemanWindow(rows) {
  return rows.find(
    (row) =>
      isCavemanProcess(row.processName) &&
      row.visible &&
      row.width >= 1024 &&
      row.height >= 720
  );
}

export function selectVisibleUsableProtectedCavemanWindow(rows) {
  return rows.find(
    (row) =>
      selectVisibleUsableCavemanWindow([row]) &&
      row.affinityOk &&
      [WDA_EXCLUDEFROMCAPTURE, WDA_MONITOR].includes(row.affinity)
  );
}

export function summarizeWindowsMeetingRiskSmoke({
  platform,
  initialWindow,
  scenarioResults = [],
  restoredWindow,
  detail,
  requireRestore = false
}) {
  if (platform !== "win32") {
    return {
      status: "skipped",
      messages: ["Windows meeting-risk smoke only runs on Windows."]
    };
  }

  const messages = [];
  if (initialWindow) {
    const affinityLabel =
      initialWindow.affinity === WDA_EXCLUDEFROMCAPTURE
        ? "WDA_EXCLUDEFROMCAPTURE"
        : initialWindow.affinity === WDA_MONITOR
          ? "WDA_MONITOR"
          : `affinity=${initialWindow.affinity}`;
    messages.push(
      `Initial Caveman window from ${initialWindow.processName} is ${initialWindow.width}x${initialWindow.height} and protected with ${affinityLabel}.`
    );
  } else {
    messages.push("No initial protected visible Caveman EXE window was found.");
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
      `Caveman restored protected visible window from ${restoredWindow.processName} at ${restoredWindow.width}x${restoredWindow.height}.`
    );
  } else if (!requireRestore) {
    messages.push("Caveman restoration check was skipped for this smoke run.");
  } else {
    messages.push("Caveman did not restore a protected visible usable window after meeting risk cleared.");
  }

  if (detail) {
    messages.push(detail);
  }

  const allScenariosHid =
    scenarioResults.length > 0 && scenarioResults.every((result) => result.hiddenDuringRisk);
  return {
    status: initialWindow && allScenariosHid && (restoredWindow || !requireRestore) ? "ready" : "blocked",
    messages
  };
}

export async function runWindowsMeetingRiskSmoke({
  platform = process.platform,
  appExePath = process.env.CAVEMAN_WINDOWS_APP_EXE || DEFAULT_WINDOWS_APP_EXE,
  commandRunner = execFileAsync,
  processSpawner = spawn,
  requireRestore = false,
  restoreWaitMs = RESTORE_WAIT_MS,
  activeRiskWaitMs = WINDOWS_MEETING_RISK_ACTIVE_WAIT_MS,
  fakeMeetingDurationMs = WINDOWS_MEETING_RISK_FAKE_MEETING_DURATION_MS,
  scenarios = DEFAULT_SCENARIOS
} = {}) {
  if (platform !== "win32") {
    return summarizeWindowsMeetingRiskSmoke({ platform });
  }

  keepMarkerReachable();
  await assertFile(appExePath, "Caveman Windows EXE");
  const appProcess = launchCavemanExe({ appExePath, processSpawner });
  let appProcessError = null;
  appProcess.once("error", (error) => {
    appProcessError = error;
  });

  const tempDir = await mkdtemp(join(tmpdir(), "caveman-windows-meeting-risk-"));
  try {
    const initialWindow = await waitForVisibleUsableProtectedWindow({
      commandRunner,
      timeoutMs: WINDOWS_MEETING_RISK_INITIAL_WAIT_MS
    });
    if (!initialWindow) {
      return summarizeWindowsMeetingRiskSmoke({
        platform,
        initialWindow,
        scenarioResults: [],
        restoredWindow: null,
        requireRestore,
        detail: appProcessError ? `Caveman EXE failed to launch: ${appProcessError.message}` : null
      });
    }

    const scenarioResults = [];
    for (const scenario of scenarios) {
      scenarioResults.push(
        await runMeetingRiskScenario({
          tempDir,
          scenario,
          commandRunner,
          processSpawner,
          requireRestore,
          restoreWaitMs,
          activeRiskWaitMs,
          fakeMeetingDurationMs
        })
      );
    }

    const restoredWindow = requireRestore
      ? await waitForVisibleUsableProtectedWindow({ commandRunner, timeoutMs: restoreWaitMs })
      : null;
    return summarizeWindowsMeetingRiskSmoke({
      platform,
      initialWindow,
      scenarioResults,
      restoredWindow,
      requireRestore
    });
  } finally {
    await stopWindowsApp({ appExeName: basename(appExePath), appProcess, commandRunner });
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runMeetingRiskScenario({
  tempDir,
  scenario,
  commandRunner,
  processSpawner,
  requireRestore,
  restoreWaitMs,
  activeRiskWaitMs,
  fakeMeetingDurationMs
}) {
  const scriptPath = join(tempDir, `${scenario.id}.ps1`);
  await writeFile(scriptPath, FAKE_MEETING_WINDOW_POWERSHELL, "utf8");

  const riskProcess = processSpawner(
    POWERSHELL,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Title",
      scenario.windowTitle,
      "-DurationMs",
      String(fakeMeetingDurationMs)
    ],
    {
      stdio: "ignore",
      windowsHide: false
    }
  );

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
      timeoutMs: activeRiskWaitMs,
      commandRunner,
      predicate: (rows) => !selectVisibleUsableCavemanWindow(rows),
      shouldStop: () => riskProcessExited
    });
    if (hiddenDuringRisk && requireRestore) {
      await waitForChildExit(riskProcess, fakeMeetingDurationMs + 5_000);
    }
    return {
      ...scenario,
      hiddenDuringRisk,
      detail: riskProcessError ? riskProcessError.message : null
    };
  } finally {
    await stopProcess(riskProcess);
    if (requireRestore) {
      await waitForVisibleUsableProtectedWindow({ commandRunner, timeoutMs: restoreWaitMs });
    }
  }
}

function launchCavemanExe({ appExePath, processSpawner }) {
  return processSpawner(appExePath, [], {
    cwd: dirname(appExePath),
    stdio: "ignore",
    windowsHide: false
  });
}

async function waitForVisibleUsableProtectedWindow({ commandRunner, timeoutMs }) {
  let selectedWindow = null;
  await waitForCondition({
    timeoutMs,
    commandRunner,
    predicate: (rows) => {
      selectedWindow = selectVisibleUsableProtectedCavemanWindow(rows) || null;
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
    const rows = await queryWindowsWindowRows(commandRunner);
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

async function queryWindowsWindowRows(commandRunner) {
  const { stdout } = await commandRunner(POWERSHELL, windowsPowerShellArgs(WINDOWS_CAVEMAN_WINDOW_QUERY_POWERSHELL), {
    maxBuffer: QUERY_MAX_BUFFER
  });
  return parseWindowsWindowRows(stdout);
}

async function stopWindowsApp({ appExeName, appProcess, commandRunner }) {
  await commandRunner("taskkill", ["/IM", appExeName, "/F", "/T"], {
    maxBuffer: QUERY_MAX_BUFFER
  }).catch(() => undefined);
  await stopProcess(appProcess);
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

async function assertFile(path, label) {
  const candidate = await stat(path).catch(() => null);
  if (!candidate?.isFile()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function isCavemanProcess(processName) {
  return ["caveman.exe", "caveman"].includes(String(processName || "").trim().toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keepMarkerReachable() {
  return WINDOWS_MEETING_RISK_SMOKE_MARKER;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--app-exe":
        options.appExePath = resolve(next());
        break;
      case "--require-restore":
        options.requireRestore = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/windows-meeting-risk-smoke.mjs [options]

Options:
  --app-exe <path>       Built Caveman EXE. Defaults to src-tauri/target/release/caveman.exe.
  --require-restore      Also require the Caveman window to restore after meeting risk clears.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await runWindowsMeetingRiskSmoke(options);
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
