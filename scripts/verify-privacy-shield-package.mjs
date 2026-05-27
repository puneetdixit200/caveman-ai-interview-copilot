#!/usr/bin/env node
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RELEASE_DIR = path.join(REPO_ROOT, "src-tauri", "target", "release");
const DEFAULT_APP_NAME = "Caveman";
const COMMAND_MAX_BUFFER = 1024 * 1024 * 100;

export const PACKAGE_TARGETS = {
  "windows-x64": { platform: "win32", arch: "x64", binaryName: "caveman.exe" },
  "macos-x64": { platform: "darwin", arch: "x64", binaryName: "caveman" },
  "macos-arm64": { platform: "darwin", arch: "arm64", binaryName: "caveman" },
  "linux-x64": { platform: "linux", arch: "x64", binaryName: "caveman" }
};

export const COMMON_PRIVACY_SHIELD_MARKERS = [
  "Screen-share guard failed closed:",
  "Capture exclusion is not enforced:",
  "Native privacy shield denied showing",
  "Native privacy shield denied screen OCR capture.",
  "msedgewebview2.exe",
  "teams.microsoft.com",
  "meet.google.com"
];

export const TARGET_PRIVACY_SHIELD_MARKERS = {
  "windows-x64": [...COMMON_PRIVACY_SHIELD_MARKERS, "SetWindowDisplayAffinity", "GetWindowDisplayAffinity"],
  "macos-x64": [...COMMON_PRIVACY_SHIELD_MARKERS, "set_content_protected", "macOS rejected NSWindow content protection"],
  "macos-arm64": [...COMMON_PRIVACY_SHIELD_MARKERS, "set_content_protected", "macOS rejected NSWindow content protection"],
  "linux-x64": [...COMMON_PRIVACY_SHIELD_MARKERS, "Capture exclusion is only implemented on Windows and macOS"]
};

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

export function privacyShieldAttestationName(target) {
  if (!PACKAGE_TARGETS[target]) {
    throw new Error(`Unsupported package target: ${target}`);
  }
  return `privacy-shield-${target}.json`;
}

export function evaluateBinaryPrivacyMarkers(binary, markers) {
  const content = Buffer.isBuffer(binary) ? binary : Buffer.from(String(binary));
  const missingMarkers = markers.filter((marker) => !content.includes(Buffer.from(marker)));
  return {
    status: missingMarkers.length === 0 ? "ready" : "blocked",
    missingMarkers
  };
}

export async function verifyPrivacyShieldPackage({
  targetSelector = "current",
  releaseDir = DEFAULT_RELEASE_DIR,
  appName = DEFAULT_APP_NAME,
  commandRunner = runCommand,
  writeAttestationPath
} = {}) {
  const target = resolvePackageTarget(targetSelector);
  const markers = TARGET_PRIVACY_SHIELD_MARKERS[target];
  const checked = [];
  const cleanup = [];

  try {
    const binaryPath = await resolvePackageBinary({
      target,
      releaseDir,
      appName,
      commandRunner,
      cleanup
    });
    checked.push(binaryPath);
    const binary = await readFile(binaryPath);
    const markerResult = evaluateBinaryPrivacyMarkers(binary, markers);
    if (markerResult.status !== "ready") {
      throw new Error(
        `Packaged ${target} binary is missing native privacy shield markers: ${markerResult.missingMarkers.join(", ")}`
      );
    }

    const result = { target, status: "ready", checked, markers };
    if (writeAttestationPath) {
      await writePrivacyShieldAttestation({ outputPath: writeAttestationPath, ...result });
    }
    return result;
  } finally {
    await Promise.all(cleanup.map((candidate) => rm(candidate, { recursive: true, force: true })));
  }
}

async function resolvePackageBinary({ target, releaseDir, appName, commandRunner, cleanup }) {
  if (target.startsWith("macos-")) {
    const binaryPath = await firstExistingFile(
      [
        path.join(releaseDir, "bundle", "macos", `${appName}.app`, "Contents", "MacOS", "caveman"),
        path.join(releaseDir, "macos", `${appName}.app`, "Contents", "MacOS", "caveman")
      ],
      `${target} app binary`
    );
    await assertNonEmptyFile(binaryPath, `${target} app binary`);
    return binaryPath;
  }

  if (target === "windows-x64") {
    const msiFiles = [
      ...(await findFiles(path.join(releaseDir, "bundle", "msi"), (file) => file.endsWith(".msi"))),
      ...(await findFiles(path.join(releaseDir, "msi"), (file) => file.endsWith(".msi")))
    ];
    assertAny(msiFiles, "Windows MSI installer");
    const extractDir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-msi-"));
    cleanup.push(extractDir);
    await commandRunner("msiexec.exe", ["/a", msiFiles[0], "/qn", `TARGETDIR=${extractDir}`], {
      maxBuffer: COMMAND_MAX_BUFFER
    });
    return findFirstFileNamed(extractDir, PACKAGE_TARGETS[target].binaryName);
  }

  if (target === "linux-x64") {
    const appImages = [
      ...(await findFiles(path.join(releaseDir, "bundle", "appimage"), (file) => file.endsWith(".AppImage"))),
      ...(await findFiles(path.join(releaseDir, "appimage"), (file) => file.endsWith(".AppImage")))
    ];
    assertAny(appImages, "Linux AppImage");
    const extractDir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-appimage-"));
    cleanup.push(extractDir);
    await chmod(appImages[0], 0o755);
    await commandRunner(appImages[0], ["--appimage-extract"], {
      cwd: extractDir,
      maxBuffer: COMMAND_MAX_BUFFER
    });
    return findFirstFileNamed(path.join(extractDir, "squashfs-root"), PACKAGE_TARGETS[target].binaryName);
  }

  throw new Error(`Unsupported package target: ${target}`);
}

async function firstExistingFile(candidates, label) {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Missing ${label}: ${candidates.join(" or ")}`);
}

export async function writePrivacyShieldAttestation({ outputPath, target, checked, markers }) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        status: "ready",
        target,
        checked,
        markers
      },
      null,
      2
    )}\n`
  );
}

async function findFiles(root, predicate) {
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

async function findFirstFileNamed(root, name) {
  const lowerName = name.toLowerCase();
  const matches = await findFiles(root, (fileName) => fileName.toLowerCase() === lowerName);
  if (matches.length === 0) {
    throw new Error(`Could not find ${name} under ${root}`);
  }
  return matches[0];
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

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, options = {}) {
  return execFileAsync(command, args, options);
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
      case "--write-attestation":
        options.writeAttestationPath = path.resolve(next());
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
  return `Usage: node scripts/verify-privacy-shield-package.mjs [options]

Options:
  --target <target>             current, windows-x64, macos-x64, macos-arm64, or linux-x64.
  --release-dir <path>          Tauri release directory. Defaults to src-tauri/target/release.
  --app-name <name>             macOS app name. Defaults to Caveman.
  --write-attestation <path>    Write a JSON attestation after verification.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await verifyPrivacyShieldPackage(options);
  console.log(`Verified packaged privacy shield for ${result.target}`);
  for (const checked of result.checked) {
    console.log(checked);
  }
  if (options.writeAttestationPath) {
    console.log(options.writeAttestationPath);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
