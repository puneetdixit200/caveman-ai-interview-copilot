#!/usr/bin/env node
import { access, chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RELEASE_DIR = path.join(REPO_ROOT, "src-tauri", "target", "release");
const DEFAULT_APP_NAME = "Caveman";
const COMMAND_MAX_BUFFER = 1024 * 1024 * 100;

export const PACKAGE_TARGETS = {
  "windows-x64": { platform: "win32", arch: "x64", sidecarName: "caveman-whisper.exe" },
  "macos-x64": { platform: "darwin", arch: "x64", sidecarName: "caveman-whisper" },
  "macos-arm64": { platform: "darwin", arch: "arm64", sidecarName: "caveman-whisper" },
  "linux-x64": { platform: "linux", arch: "x64", sidecarName: "caveman-whisper" }
};

const WINDOWS_RUNTIME_DLLS = ["ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll"];

export function resolvePackageTarget(selector = "current", platform = process.platform, arch = process.arch) {
  if (selector !== "current") {
    if (!PACKAGE_TARGETS[selector]) {
      throw new Error(`Unsupported package target: ${selector}`);
    }
    return selector;
  }

  const target = Object.entries(PACKAGE_TARGETS).find(([, definition]) => {
    return definition.platform === platform && definition.arch === arch;
  })?.[0];

  if (!target) {
    throw new Error(`Unsupported package host: ${platform}/${arch}`);
  }

  return target;
}

export function runtimeSidecarName(target) {
  const definition = PACKAGE_TARGETS[target];
  if (!definition) {
    throw new Error(`Unsupported package target: ${target}`);
  }
  return definition.sidecarName;
}

export async function verifyBundledSidecar({
  targetSelector = "current",
  releaseDir = DEFAULT_RELEASE_DIR,
  appName = DEFAULT_APP_NAME,
  commandRunner = runCommand
} = {}) {
  const target = resolvePackageTarget(targetSelector);

  if (target.startsWith("macos-")) {
    return verifyMacosPackage({ target, releaseDir, appName, commandRunner });
  }
  if (target === "windows-x64") {
    return verifyWindowsPackage({ releaseDir, commandRunner });
  }
  if (target === "linux-x64") {
    return verifyLinuxPackage({ releaseDir, commandRunner });
  }

  throw new Error(`Unsupported package target: ${target}`);
}

export async function verifyMacosPackage({
  target,
  releaseDir,
  appName = DEFAULT_APP_NAME,
  commandRunner = runCommand
}) {
  const bundleDir = path.join(releaseDir, "bundle");
  const appBundle = path.join(bundleDir, "macos", `${appName}.app`);
  const sidecarPath = path.join(appBundle, "Contents", "MacOS", runtimeSidecarName(target));
  const dmgFiles = await findFiles(path.join(bundleDir, "dmg"), (file) => file.endsWith(".dmg"));

  await assertDirectory(appBundle, "macOS app bundle");
  await assertNonEmptyFile(sidecarPath, "macOS bundled Whisper sidecar");
  await assertSidecarLaunches(sidecarPath, commandRunner);
  assertAny(dmgFiles, "macOS DMG");

  return {
    target,
    checked: [appBundle, sidecarPath, ...dmgFiles]
  };
}

async function assertSidecarLaunches(sidecarPath, commandRunner) {
  try {
    await commandRunner(sidecarPath, ["--help"], { maxBuffer: COMMAND_MAX_BUFFER });
  } catch (error) {
    const details = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join("\n");
    throw new Error(`macOS bundled Whisper sidecar did not launch: ${sidecarPath}${details ? `\n${details}` : ""}`, {
      cause: error
    });
  }
}

export async function verifyWindowsPackage({ releaseDir, commandRunner = runCommand }) {
  const bundleDir = path.join(releaseDir, "bundle");
  const nsisFiles = await findFiles(path.join(bundleDir, "nsis"), (file) => file.endsWith(".exe"));
  const msiFiles = await findFiles(path.join(bundleDir, "msi"), (file) => file.endsWith(".msi"));
  assertAny(nsisFiles, "Windows NSIS installer");
  assertAny(msiFiles, "Windows MSI installer");

  const extractDir = await mkdtemp(path.join(tmpdir(), "caveman-msi-payload-"));
  try {
    await commandRunner("msiexec.exe", ["/a", msiFiles[0], "/qn", `TARGETDIR=${extractDir}`], {
      maxBuffer: COMMAND_MAX_BUFFER
    });

    const sidecarPath = await findFirstFileNamed(extractDir, runtimeSidecarName("windows-x64"));
    await assertNonEmptyFile(sidecarPath, "Windows MSI bundled Whisper sidecar");

    const dllPaths = [];
    for (const dll of WINDOWS_RUNTIME_DLLS) {
      const dllPath = await findFirstFileNamed(extractDir, dll);
      await assertNonEmptyFile(dllPath, `Windows MSI runtime DLL ${dll}`);
      dllPaths.push(dllPath);
    }

    return {
      target: "windows-x64",
      checked: [...nsisFiles, ...msiFiles, sidecarPath, ...dllPaths]
    };
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

export async function verifyLinuxPackage({ releaseDir, commandRunner = runCommand }) {
  const bundleDir = path.join(releaseDir, "bundle");
  const appImages = await findFiles(path.join(bundleDir, "appimage"), (file) => file.endsWith(".AppImage"));
  const debFiles = await findFiles(path.join(bundleDir, "deb"), (file) => file.endsWith(".deb"));
  assertAny(appImages, "Linux AppImage");
  assertAny(debFiles, "Linux DEB package");

  const debListing = await commandRunner("dpkg-deb", ["-c", debFiles[0]], { maxBuffer: COMMAND_MAX_BUFFER });
  if (!String(debListing.stdout ?? "").includes(runtimeSidecarName("linux-x64"))) {
    throw new Error(`Linux DEB payload does not contain ${runtimeSidecarName("linux-x64")}`);
  }

  const extractDir = await mkdtemp(path.join(tmpdir(), "caveman-appimage-payload-"));
  try {
    await chmod(appImages[0], 0o755);
    await commandRunner(appImages[0], ["--appimage-extract"], {
      cwd: extractDir,
      maxBuffer: COMMAND_MAX_BUFFER
    });

    const sidecarPath = await findFirstFileNamed(
      path.join(extractDir, "squashfs-root"),
      runtimeSidecarName("linux-x64")
    );
    await assertNonEmptyFile(sidecarPath, "Linux AppImage bundled Whisper sidecar");

    return {
      target: "linux-x64",
      checked: [...appImages, ...debFiles, sidecarPath]
    };
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

export async function findFiles(root, predicate) {
  if (!(await exists(root))) {
    return [];
  }

  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(entryPath, predicate)));
    } else if (entry.isFile() && predicate(entry.name, entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function findFirstFileNamed(root, name) {
  const matches = await findFiles(root, (fileName) => fileName === name);
  if (matches.length === 0) {
    throw new Error(`Could not find ${name} under ${root}`);
  }
  return matches[0];
}

async function assertDirectory(candidate, label) {
  const candidateStat = await stat(candidate).catch((error) => {
    throw new Error(`Missing ${label}: ${candidate}`, { cause: error });
  });
  if (!candidateStat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${candidate}`);
  }
}

async function assertNonEmptyFile(candidate, label) {
  const candidateStat = await stat(candidate).catch((error) => {
    throw new Error(`Missing ${label}: ${candidate}`, { cause: error });
  });
  if (!candidateStat.isFile() || candidateStat.size <= 0) {
    throw new Error(`${label} is not a non-empty file: ${candidate}`);
  }
}

function assertAny(files, label) {
  if (files.length === 0) {
    throw new Error(`Missing ${label}`);
  }
}

async function runCommand(command, args, options = {}) {
  return execFileAsync(command, args, options);
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
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
      case "--target":
        options.targetSelector = next();
        break;
      case "--release-dir":
        options.releaseDir = path.resolve(next());
        break;
      case "--app-name":
        options.appName = next();
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
  return `Usage: node scripts/verify-bundled-sidecar.mjs [options]

Options:
  --target current|windows-x64|macos-x64|macos-arm64|linux-x64
  --release-dir <path>    Defaults to ./src-tauri/target/release
  --app-name <name>       Defaults to ${DEFAULT_APP_NAME}
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await verifyBundledSidecar(options);
  console.log(`Verified bundled Whisper sidecar for ${result.target}`);
  for (const checkedPath of result.checked) {
    console.log(checkedPath);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
