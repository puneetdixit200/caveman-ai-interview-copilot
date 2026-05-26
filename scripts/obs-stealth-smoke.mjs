#!/usr/bin/env node
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const OBS_BUNDLE_PATH = "/Applications/OBS.app";

export function buildObsLaunchCommand() {
  return ["open", ["-gj", "-a", "OBS"]];
}

export function parsePgrepOutput(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        return [];
      }
      return [{ pid: Number(match[1]), command: match[2] }];
    });
}

export function summarizeObsSmoke({
  appInstalled,
  cliInstalled,
  launchedForSmoke,
  processCount,
  screenShareGuardTestPassed
}) {
  const messages = [];
  if (appInstalled) {
    messages.push("OBS app bundle is installed.");
  } else {
    messages.push("OBS app bundle is missing.");
  }

  if (cliInstalled) {
    messages.push("OBS CLI wrapper is available.");
  } else {
    messages.push("OBS CLI wrapper is missing.");
  }

  if (launchedForSmoke) {
    if (processCount > 0) {
      messages.push("OBS launch smoke detected a running process.");
    } else {
      messages.push("OBS launch smoke did not detect a running process.");
    }
  }

  if (screenShareGuardTestPassed) {
    messages.push("Screen-share guard contract test passed for OBS process names.");
  } else {
    messages.push("Screen-share guard contract test failed for OBS process names.");
  }

  const status =
    appInstalled && cliInstalled && screenShareGuardTestPassed && (!launchedForSmoke || processCount > 0)
      ? "ready"
      : "blocked";

  return { status, messages };
}

export async function runObsStealthSmoke({ launch = false, quitAfter = false } = {}) {
  const appInstalled = await exists(OBS_BUNDLE_PATH);
  const cliInstalled = Boolean(await commandOutput("bash", ["-lc", "command -v obs || true"]));
  let processCount = parsePgrepOutput(await commandOutput("pgrep", ["-fl", "OBS"])).length;

  if (launch && appInstalled) {
    const [command, args] = buildObsLaunchCommand();
    await execFileAsync(command, args);
    await wait(3000);
    processCount = parsePgrepOutput(await commandOutput("pgrep", ["-fl", "OBS"])).length;
  }

  const screenShareGuardTestPassed = await runScreenShareGuardContract();

  if (launch && quitAfter && processCount > 0) {
    await commandOutput("osascript", ["-e", 'quit app "OBS"']);
  }

  return summarizeObsSmoke({
    appInstalled,
    cliInstalled,
    launchedForSmoke: launch,
    processCount,
    screenShareGuardTestPassed
  });
}

async function runScreenShareGuardContract() {
  try {
    await execFileAsync("cargo", [
      "test",
      "detects_meeting_browser_and_recorder_helper_process_variants",
      "--manifest-path",
      "src-tauri/Cargo.toml"
    ]);
    return true;
  } catch {
    return false;
  }
}

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(argv) {
  return {
    launch: argv.includes("--launch"),
    quitAfter: argv.includes("--quit-after")
  };
}

export async function main(argv = process.argv.slice(2)) {
  const result = await runObsStealthSmoke(parseArgs(argv));
  console.log(result.status.toUpperCase());
  for (const message of result.messages) {
    console.log(`- ${message}`);
  }
  if (result.status !== "ready") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
