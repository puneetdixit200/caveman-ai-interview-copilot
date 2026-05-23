#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TAURI_DIR = path.join(REPO_ROOT, "src-tauri");
const DEFAULT_CACHE_DIR = path.join(tmpdir(), "caveman-whisper-sidecars");

export const WHISPER_CPP_RELEASE_TAG = "v1.8.4";
export const WHISPER_CPP_REPO = "https://github.com/ggml-org/whisper.cpp.git";
export const SIDECAR_BASE_PATH = "binaries/whisper-runtime/caveman-whisper";
export const WINDOWS_RUNTIME_RESOURCE_GLOB = "binaries/whisper-runtime/*.dll";

export const SIDECAR_TARGETS = {
  "windows-x64": {
    label: "Windows x64",
    platform: "win32",
    arch: "x64",
    triple: "x86_64-pc-windows-msvc",
    executableExtension: ".exe",
    strategy: "download-windows-release",
    releaseAssetUrl:
      "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip"
  },
  "macos-x64": {
    label: "macOS Intel",
    platform: "darwin",
    arch: "x64",
    triple: "x86_64-apple-darwin",
    executableExtension: "",
    strategy: "build-from-source"
  },
  "macos-arm64": {
    label: "macOS Apple Silicon",
    platform: "darwin",
    arch: "arm64",
    triple: "aarch64-apple-darwin",
    executableExtension: "",
    strategy: "build-from-source"
  },
  "linux-x64": {
    label: "Linux x64",
    platform: "linux",
    arch: "x64",
    triple: "x86_64-unknown-linux-gnu",
    executableExtension: "",
    strategy: "build-from-source"
  }
};

const TARGET_ORDER = ["windows-x64", "macos-x64", "macos-arm64", "linux-x64"];

export function expectedSidecarFilename(target) {
  const definition = requireTarget(target);
  return `caveman-whisper-${definition.triple}${definition.executableExtension}`;
}

export function expectedSidecarPath(target, tauriDir = DEFAULT_TAURI_DIR) {
  return path.join(tauriDir, "binaries", "whisper-runtime", expectedSidecarFilename(target));
}

export function resolveCurrentTarget(platform = process.platform, arch = process.arch) {
  const target = TARGET_ORDER.find((candidate) => {
    const definition = SIDECAR_TARGETS[candidate];
    return definition.platform === platform && definition.arch === arch;
  });

  if (!target) {
    throw new Error(`Unsupported sidecar host: ${platform}/${arch}`);
  }

  return target;
}

export function resolveTargets(selector = "current", currentTarget = resolveCurrentTarget()) {
  if (selector === "current") {
    return [currentTarget];
  }
  if (selector === "all") {
    return [...TARGET_ORDER];
  }
  requireTarget(selector);
  return [selector];
}

export function renderSidecarConfig({ includeWindowsRuntimeResources = false } = {}) {
  const bundle = {
    externalBin: [SIDECAR_BASE_PATH]
  };

  if (includeWindowsRuntimeResources) {
    bundle.resources = [WINDOWS_RUNTIME_RESOURCE_GLOB];
  }

  return { bundle };
}

export function mergeSidecarConfig(baseConfig = {}, options = {}) {
  const sidecarConfig = renderSidecarConfig(options);
  const baseBundle = isObject(baseConfig.bundle) ? baseConfig.bundle : {};

  return {
    ...baseConfig,
    bundle: {
      ...baseBundle,
      ...sidecarConfig.bundle
    }
  };
}

export async function copyPreparedSidecar({ sourcePath, target, tauriDir = DEFAULT_TAURI_DIR }) {
  requireTarget(target);
  const outputPath = expectedSidecarPath(target, tauriDir);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);

  if (target !== "windows-x64") {
    await chmod(outputPath, 0o755);
  }

  return outputPath;
}

export function sourceBuildCmakeArgs(sourceDir, buildDir) {
  return [
    "-S",
    sourceDir,
    "-B",
    buildDir,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DBUILD_SHARED_LIBS=OFF",
    "-DWHISPER_BUILD_TESTS=OFF",
    "-DWHISPER_BUILD_EXAMPLES=ON"
  ];
}

export async function assertPreparedSidecars(targets, tauriDir = DEFAULT_TAURI_DIR) {
  for (const target of targets) {
    const sidecarPath = expectedSidecarPath(target, tauriDir);
    try {
      const sidecarStat = await stat(sidecarPath);
      if (!sidecarStat.isFile() || sidecarStat.size <= 0) {
        throw new Error("not a non-empty file");
      }
    } catch (error) {
      throw new Error(
        `Missing prepared Whisper sidecar for ${target}: expected ${sidecarPath}. Run npm run sidecars:prepare -- --target ${target}.`,
        { cause: error }
      );
    }
  }
}

export async function prepareSidecars({
  targetSelector = "current",
  currentTarget = resolveCurrentTarget(),
  tauriDir = DEFAULT_TAURI_DIR,
  cacheDir = DEFAULT_CACHE_DIR,
  sourceBinary,
  checkOnly = false,
  baseConfigPath,
  outputConfigPath,
  whisperTag = WHISPER_CPP_RELEASE_TAG
} = {}) {
  const targets = resolveTargets(targetSelector, currentTarget);

  if (sourceBinary && targets.length !== 1) {
    throw new Error("--source-binary can only be used with one target");
  }

  if (checkOnly) {
    await assertPreparedSidecars(targets, tauriDir);
  } else if (sourceBinary) {
    await copyPreparedSidecar({ sourcePath: sourceBinary, target: targets[0], tauriDir });
  } else {
    for (const target of targets) {
      await prepareCurrentHostSidecar({ target, currentTarget, tauriDir, cacheDir, whisperTag });
    }
  }

  if (outputConfigPath) {
    await writeMergedConfig({
      baseConfigPath,
      outputConfigPath,
      includeWindowsRuntimeResources: targets.includes("windows-x64")
    });
  }

  return {
    targets,
    sidecars: targets.map((target) => expectedSidecarPath(target, tauriDir))
  };
}

async function prepareCurrentHostSidecar({ target, currentTarget, tauriDir, cacheDir, whisperTag }) {
  if (target !== currentTarget) {
    throw new Error(
      `Cannot prepare ${target} from ${currentTarget}. Build each redistributable sidecar on its matching CI runner.`
    );
  }

  const definition = requireTarget(target);
  if (definition.strategy === "download-windows-release") {
    await prepareWindowsReleaseSidecar({ target, tauriDir, cacheDir });
    return;
  }

  await prepareSourceBuiltSidecar({ target, tauriDir, cacheDir, whisperTag });
}

async function prepareWindowsReleaseSidecar({ target, tauriDir, cacheDir }) {
  const definition = requireTarget(target);
  const archivePath = path.join(cacheDir, WHISPER_CPP_RELEASE_TAG, "whisper-bin-x64.zip");
  const extractDir = path.join(cacheDir, WHISPER_CPP_RELEASE_TAG, "windows-x64");
  await mkdir(path.dirname(archivePath), { recursive: true });

  if (!(await exists(archivePath))) {
    await downloadFile(definition.releaseAssetUrl, archivePath);
  }

  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  await extractZip(archivePath, extractDir);

  const releaseDir = path.join(extractDir, "Release");
  await copyPreparedSidecar({
    sourcePath: path.join(releaseDir, "whisper-cli.exe"),
    target,
    tauriDir
  });

  const runtimeDir = path.join(tauriDir, "binaries", "whisper-runtime");
  for (const dll of ["ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll"]) {
    const sourcePath = path.join(releaseDir, dll);
    if (await exists(sourcePath)) {
      await copyFile(sourcePath, path.join(runtimeDir, dll));
    }
  }
}

async function prepareSourceBuiltSidecar({ target, tauriDir, cacheDir, whisperTag }) {
  const sourceDir = path.join(cacheDir, `whisper.cpp-${whisperTag}`);
  const buildDir = path.join(sourceDir, "build-caveman");
  await ensureWhisperSource({ sourceDir, whisperTag });

  await execFileLogged("cmake", sourceBuildCmakeArgs(sourceDir, buildDir));
  await execFileLogged("cmake", ["--build", buildDir, "--config", "Release", "--target", "whisper-cli"]);

  const builtBinary = await findFirstExisting([
    path.join(buildDir, "bin", "Release", "whisper-cli"),
    path.join(buildDir, "bin", "whisper-cli"),
    path.join(buildDir, "examples", "Release", "whisper-cli"),
    path.join(buildDir, "examples", "whisper-cli")
  ]);

  await copyPreparedSidecar({ sourcePath: builtBinary, target, tauriDir });
}

async function ensureWhisperSource({ sourceDir, whisperTag }) {
  if (await exists(path.join(sourceDir, ".git"))) {
    await execFileLogged("git", ["-C", sourceDir, "fetch", "--depth", "1", "origin", whisperTag]);
    await execFileLogged("git", ["-C", sourceDir, "checkout", "--detach", `FETCH_HEAD`]);
    return;
  }

  await mkdir(path.dirname(sourceDir), { recursive: true });
  await execFileLogged("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    whisperTag,
    WHISPER_CPP_REPO,
    sourceDir
  ]);
}

async function writeMergedConfig({ baseConfigPath, outputConfigPath, includeWindowsRuntimeResources }) {
  const baseConfig = baseConfigPath ? JSON.parse(await readFile(baseConfigPath, "utf8")) : {};
  const merged = mergeSidecarConfig(baseConfig, { includeWindowsRuntimeResources });
  await mkdir(path.dirname(outputConfigPath), { recursive: true });
  await writeFile(outputConfigPath, `${JSON.stringify(merged, null, 2)}\n`);
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(response.body, createWriteStream(outputPath));
}

async function extractZip(archivePath, outputDir) {
  if (process.platform === "win32") {
    await execFileLogged("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${quotePowerShell(archivePath)} -DestinationPath ${quotePowerShell(outputDir)} -Force`
    ]);
    return;
  }

  await execFileLogged("unzip", ["-q", archivePath, "-d", outputDir]);
}

async function findFirstExisting(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find whisper-cli after build. Checked: ${candidates.join(", ")}`);
}

async function execFileLogged(command, args) {
  try {
    await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 20 });
  } catch (error) {
    const stderr = error?.stderr ? `\n${error.stderr}` : "";
    const stdout = error?.stdout ? `\n${error.stdout}` : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${stdout}${stderr}`, { cause: error });
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

function requireTarget(target) {
  const definition = SIDECAR_TARGETS[target];
  if (!definition) {
    throw new Error(`Unsupported sidecar target: ${target}`);
  }
  return definition;
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      case "--tauri-dir":
        options.tauriDir = path.resolve(next());
        break;
      case "--cache-dir":
        options.cacheDir = path.resolve(next());
        break;
      case "--source-binary":
        options.sourceBinary = path.resolve(next());
        break;
      case "--base-config":
        options.baseConfigPath = path.resolve(next());
        break;
      case "--output-config":
        options.outputConfigPath = path.resolve(next());
        break;
      case "--whisper-tag":
        options.whisperTag = next();
        break;
      case "--check":
        options.checkOnly = true;
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
  return `Usage: node scripts/prepare-whisper-sidecars.mjs [options]

Options:
  --target current|all|windows-x64|macos-x64|macos-arm64|linux-x64
  --source-binary <path>   Copy an already-built whisper-cli binary for one target
  --check                  Verify expected sidecar files instead of building/downloading
  --base-config <path>     Merge generated sidecar config into an existing Tauri config
  --output-config <path>   Write generated Tauri config for the build command
  --tauri-dir <path>       Defaults to ./src-tauri
  --cache-dir <path>       Defaults to the OS temp directory
  --whisper-tag <tag>      Defaults to ${WHISPER_CPP_RELEASE_TAG}
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await prepareSidecars(options);
  console.log(`Prepared Whisper sidecars for: ${result.targets.join(", ")}`);
  for (const sidecar of result.sidecars) {
    console.log(sidecar);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
