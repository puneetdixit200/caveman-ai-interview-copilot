#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export function parseMacAudioDevices(output) {
  const devices = [];
  let current = null;

  for (const line of String(output).split(/\r?\n/)) {
    const deviceMatch = line.match(/^ {8}([^:]+):\s*$/);
    if (deviceMatch) {
      current = {
        name: deviceMatch[1].trim(),
        defaultInput: false,
        defaultOutput: false,
        inputChannels: 0,
        outputChannels: 0
      };
      devices.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const valueMatch = line.match(/^ {10}([^:]+):\s*(.+)$/);
    if (!valueMatch) {
      continue;
    }

    const [, key, rawValue] = valueMatch;
    const value = rawValue.trim();
    if (key === "Default Input Device" && value === "Yes") {
      current.defaultInput = true;
    } else if (key === "Default Output Device" && value === "Yes") {
      current.defaultOutput = true;
    } else if (key === "Input Channels") {
      current.inputChannels = Number(value) || 0;
    } else if (key === "Output Channels") {
      current.outputChannels = Number(value) || 0;
    }
  }

  return devices;
}

export function summarizeAudioEnvironment({ devices, audioContractTestPassed }) {
  const inputCount = devices.filter((device) => device.inputChannels > 0 || device.defaultInput).length;
  const outputCount = devices.filter((device) => device.outputChannels > 0 || device.defaultOutput).length;
  const messages = [
    `Detected ${inputCount} input audio ${inputCount === 1 ? "device" : "devices"}.`,
    `Detected ${outputCount} output audio ${outputCount === 1 ? "device" : "devices"}.`
  ];

  if (audioContractTestPassed) {
    messages.push("Native audio contract tests passed.");
  } else {
    messages.push("Native audio contract tests failed.");
  }

  return {
    status: inputCount > 0 && outputCount > 0 && audioContractTestPassed ? "ready" : "blocked",
    messages
  };
}

export async function runAudioEnvironmentSmoke() {
  const devices =
    process.platform === "darwin"
      ? parseMacAudioDevices(await commandOutput("system_profiler", ["SPAudioDataType"]))
      : [];
  const audioContractTestPassed = await runAudioContracts();
  return summarizeAudioEnvironment({ devices, audioContractTestPassed });
}

async function runAudioContracts() {
  try {
    await execFileAsync("cargo", ["test", "audio::tests", "--manifest-path", "src-tauri/Cargo.toml"], {
      maxBuffer: 1024 * 1024 * 20
    });
    return true;
  } catch {
    return false;
  }
}

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 20 });
    return stdout;
  } catch {
    return "";
  }
}

export async function main() {
  const result = await runAudioEnvironmentSmoke();
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
