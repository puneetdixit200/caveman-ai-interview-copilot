#!/usr/bin/env node
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  MACOS_PACKAGED_MEETING_RISK_SCENARIOS,
  runMacosMeetingRiskSmoke
} from "./macos-meeting-risk-smoke.mjs";

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_RELEASE_DIR = join(REPO_ROOT, "src-tauri", "target", "release");
const DEFAULT_APP_NAME = "Caveman";
const DEFAULT_BUNDLE_ID = "com.caveman.desktop";
const COMMAND_MAX_BUFFER = 1024 * 1024 * 20;
export const PACKAGED_DMG_ACTIVE_RISK_WAIT_MS = 18_000;
export const PACKAGED_DMG_FAKE_MEETING_DURATION_MS = 24_000;

export const MACOS_DMG_MEETING_RISK_SMOKE_MARKER =
  "macOS DMG meeting-risk smoke launches the mounted DMG app before simulating Google Meet and Teams windows.";

export async function runMacosDmgMeetingRiskSmoke({
  platform = process.platform,
  releaseDir = DEFAULT_RELEASE_DIR,
  appName = DEFAULT_APP_NAME,
  bundleId = DEFAULT_BUNDLE_ID,
  commandRunner = execFileAsync,
  processSpawner = spawn,
  meetingRiskRunner = runMacosMeetingRiskSmoke
} = {}) {
  if (platform !== "darwin") {
    return {
      status: "skipped",
      messages: ["macOS DMG meeting-risk smoke only runs on macOS."]
    };
  }

  keepMarkerReachable();
  const dmgPath = await findSingleMacosDmg(releaseDir);
  const mountDir = await mkdtemp(join(tmpdir(), "caveman-dmg-meeting-risk-"));
  let attached = false;

  try {
    await mountDmg({ dmgPath, mountDir, commandRunner });
    attached = true;
    const appPath = join(mountDir, `${appName}.app`);
    await assertDirectory(appPath, `${appName}.app inside mounted DMG`);

    const result = await meetingRiskRunner({
      platform,
      commandRunner,
      processSpawner,
      bundleId,
      appPath,
      requireRestore: false,
      restoreWaitMs: 5_000,
      activeRiskWaitMs: PACKAGED_DMG_ACTIVE_RISK_WAIT_MS,
      fakeMeetingDurationMs: PACKAGED_DMG_FAKE_MEETING_DURATION_MS,
      scenarios: MACOS_PACKAGED_MEETING_RISK_SCENARIOS
    });

    return {
      ...result,
      messages: [`Mounted DMG ${dmgPath}.`, ...result.messages]
    };
  } finally {
    await quitCaveman({ bundleId, commandRunner });
    if (attached) {
      await detachDmg({ mountDir, commandRunner });
    }
    await rm(mountDir, { recursive: true, force: true });
  }
}

export async function findSingleMacosDmg(releaseDir = DEFAULT_RELEASE_DIR) {
  const candidates = [
    ...(await findFiles(join(releaseDir, "bundle", "dmg"), (fileName) => fileName.endsWith(".dmg"))),
    ...(await findFiles(join(releaseDir, "dmg"), (fileName) => fileName.endsWith(".dmg")))
  ];

  if (candidates.length === 0) {
    throw new Error(`No macOS DMG found under ${releaseDir}`);
  }

  if (candidates.length > 1) {
    throw new Error(`Expected one macOS DMG under ${releaseDir}, found ${candidates.length}: ${candidates.join(", ")}`);
  }

  return candidates[0];
}

async function mountDmg({ dmgPath, mountDir, commandRunner }) {
  await commandRunner("hdiutil", ["attach", dmgPath, "-mountpoint", mountDir, "-nobrowse", "-readonly", "-quiet"], {
    maxBuffer: COMMAND_MAX_BUFFER
  });
}

async function detachDmg({ mountDir, commandRunner }) {
  try {
    await commandRunner("hdiutil", ["detach", mountDir, "-quiet"], {
      maxBuffer: COMMAND_MAX_BUFFER
    });
  } catch {
    await commandRunner("hdiutil", ["detach", mountDir, "-force", "-quiet"], {
      maxBuffer: COMMAND_MAX_BUFFER
    }).catch(() => undefined);
  }
}

async function quitCaveman({ bundleId, commandRunner }) {
  await commandRunner("osascript", ["-e", `tell application id "${bundleId}" to quit`], {
    maxBuffer: COMMAND_MAX_BUFFER
  }).catch(() => undefined);
}

async function assertDirectory(path, label) {
  const candidate = await stat(path).catch(() => null);
  if (!candidate?.isDirectory()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

async function findFiles(root, predicate) {
  const candidate = await stat(root).catch(() => null);
  if (!candidate?.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(entryPath, predicate)));
    } else if (entry.isFile() && predicate(entry.name, entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
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
      case "--release-dir":
        options.releaseDir = resolve(next());
        break;
      case "--app-name":
        options.appName = next();
        break;
      case "--bundle-id":
        options.bundleId = next();
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
  return `Usage: node scripts/macos-dmg-meeting-risk-smoke.mjs [options]

Options:
  --release-dir <path>    Tauri release directory. Defaults to src-tauri/target/release.
  --app-name <name>       App bundle name inside the DMG. Defaults to Caveman.
  --bundle-id <bundle>    Bundle id to quit after the smoke run. Defaults to ${DEFAULT_BUNDLE_ID}.
`;
}

function keepMarkerReachable() {
  return MACOS_DMG_MEETING_RISK_SMOKE_MARKER;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await runMacosDmgMeetingRiskSmoke(options);
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
