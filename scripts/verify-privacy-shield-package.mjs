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
const DEFAULT_FRONTEND_DIST = path.join(REPO_ROOT, "dist");
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
  "Native privacy shield hid app windows after protection refresh failed closed.",
  "Startup privacy shield denied initial companion window show.",
  "Companion app windows stayed hidden because capture exclusion was not proven.",
  "Companion window capture exclusion is unsafe.",
  "Overlay bounds update refused before capture exclusion was proven.",
  "Overlay show was reverted because capture exclusion was not proven after visibility changed.",
  "Companion app window show was reverted because capture exclusion was not proven after visibility changed.",
  "Overlay show was reverted because screen-share risk was detected after visibility changed.",
  "Companion app window show was reverted because screen-share risk was detected after visibility changed.",
  "Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard.",
  "Native privacy shield starts before startup companion window show.",
  "Native privacy shield polls every 100ms for new screen-share risk.",
  "Native privacy shield refreshes capture exclusion before hiding for screen-share risk.",
  "Native privacy shield denied screen OCR capture.",
  "Waiting for app windows to leave capture surfaces before screen OCR capture.",
  "Native privacy shield denied active-window typing during screen-share risk.",
  "Native privacy shield denied active-window typing because capture exclusion was not proven.",
  "msedgewebview2.exe",
  "msedge_proxy.exe",
  "chrome_proxy.exe",
  "brave_proxy.exe",
  "opera_proxy.exe",
  "vivaldi_proxy.exe",
  "zen",
  "zen.exe",
  "chromium",
  "chromium.exe",
  "librewolf",
  "librewolf.exe",
  "waterfox",
  "waterfox.exe",
  "floorp",
  "floorp.exe",
  "duckduckgo",
  "duckduckgo.exe",
  "mullvad browser",
  "mullvad-browser",
  "webexhost.exe",
  "screenconnect.windowsclient.exe",
  "screenconnect.client.exe",
  "zohoassist.exe",
  "za_connect.exe",
  "teams.microsoft.com",
  "teams.live.com",
  "teams.cloud.microsoft",
  "meet.google.com",
  "meet - ",
  "zoom.us",
  "app.slack.com",
  "discord.com",
  "web.whatsapp.com",
  "webex.com",
  "meet.goto.com",
  "meet.jit.si",
  "app.chime.aws",
  "whereby.com",
  "riverside.fm",
  "streamyard.com",
  "livestorm.co",
  "bigbluebutton",
  "tella.tv",
  "screenpal.com",
  "veed.io",
  "clipchamp.com",
  "vidyard.com",
  "descript.com",
  "studio.restream.io",
  "vdo.ninja",
  "screenpal.exe",
  "screencast-o-matic",
  "descript.exe",
  "vidyard.exe",
  "clipchamp.exe",
  "you are sharing",
  "you're sharing",
  "sharing your screen",
  "sharing your entire screen",
  "sharing entire screen",
  "sharing this tab",
  "sharing a browser tab",
  "sharing a chrome tab",
  "sharing a window",
  "sharing an application window",
  "this tab is being shared",
  "this window is being shared",
  "application window is being shared",
  "this screen is being shared",
  "screen is being shared",
  "stop sharing",
  "you are presenting",
  "you're presenting",
  "presenting your screen",
  "presenting this tab",
  "presenting a window",
  "presenting to everyone",
  "stop presenting",
  "screen recording",
  "recording your screen",
  "recording screen",
  "screen is being recorded",
  "being recorded",
  "Screen-share guard command timeout failed closed before privacy polling could stall.",
  "Screen-share window title guard normalizes UI punctuation before matching.",
  "screencaptureui",
  "screencapture",
  "replayd",
  "screencapturekitagent",
  "macOS window title screen-share guard failed closed:",
  "macOS window title screen-share guard permission denial falls back to OS capture protection.",
  "macOS window title screen-share guard skips transient System Events rows.",
  "macOS window title screen-share guard timeout falls back to OS capture protection."
];

export const FRONTEND_PRIVACY_SHIELD_MARKERS = [
  "Native privacy shield WebView command timeout failed closed before overlay visibility could drift.",
  "Overlay kept hidden until screen-share guard stays clear for repeated checks."
];

export const DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS = [
  "skype.exe",
  "gotomeeting.exe",
  "g2mcomm.exe",
  "g2mstart.exe",
  "bluejeans.exe",
  "ringcentral.exe",
  "jitsi meet",
  "join.me",
  "around.exe",
  "mmhmm.exe",
  "telegram.exe",
  "signal.exe",
  "facetime",
  "obs64.exe",
  "obs32.exe",
  "streamlabs obs",
  "streamlabs desktop",
  "quicktime player",
  "loom.exe",
  "camtasia.exe",
  "snagit64.exe",
  "screenflow",
  "xsplit.core.exe",
  "sharex.exe",
  "bandicam.exe",
  "teamviewer.exe",
  "anydesk.exe",
  "rustdesk.exe",
  "remoting_host.exe",
  "chrome remote desktop",
  "vnc viewer",
  "parsec",
  "splashtop streamer",
  "quickassist.exe",
  "msra.exe",
  "mstsc.exe",
  "remotehelp.exe",
  "logmein",
  "bomgar-scc.exe",
  "beyondtrust",
  "jump desktop",
  "nomachine",
  "connectwisecontrol.client.exe",
  "screenconnect.clientservice.exe"
];

export const TARGET_PRIVACY_SHIELD_MARKERS = {
  "windows-x64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    "SetWindowDisplayAffinity",
    "GetWindowDisplayAffinity"
  ],
  "macos-x64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    "set_content_protected",
    "macOS rejected NSWindow content protection"
  ],
  "macos-arm64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    "set_content_protected",
    "macOS rejected NSWindow content protection"
  ],
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

export function evaluatePackagePrivacyMarkers(artifacts, markers) {
  const contents = artifacts.map((artifact) =>
    Buffer.isBuffer(artifact) ? artifact : Buffer.from(String(artifact))
  );
  const missingMarkers = markers.filter((marker) => {
    const markerBuffer = Buffer.from(marker);
    return !contents.some((content) => content.includes(markerBuffer));
  });
  return {
    status: missingMarkers.length === 0 ? "ready" : "blocked",
    missingMarkers
  };
}

export async function verifyPrivacyShieldPackage({
  targetSelector = "current",
  releaseDir = DEFAULT_RELEASE_DIR,
  frontendDist = DEFAULT_FRONTEND_DIST,
  appName = DEFAULT_APP_NAME,
  commandRunner = runCommand,
  writeAttestationPath
} = {}) {
  const target = resolvePackageTarget(targetSelector);
  const markers = TARGET_PRIVACY_SHIELD_MARKERS[target];
  const checked = [];
  const cleanup = [];

  try {
    const packageScope = await resolvePackageInspectionScope({
      target,
      releaseDir,
      appName,
      commandRunner,
      cleanup
    });
    const { binaryPath, packageRoot } = packageScope;
    checked.push(binaryPath);
    const binary = await readFile(binaryPath);
    const markerResult = evaluateBinaryPrivacyMarkers(binary, markers);
    if (markerResult.status !== "ready") {
      throw new Error(
        `Packaged ${target} binary is missing native privacy shield markers: ${markerResult.missingMarkers.join(", ")}`
      );
    }

    const frontendRoot = (await exists(frontendDist)) ? frontendDist : packageRoot;
    const frontendArtifacts = await readPrivacyMarkerArtifacts(
      frontendRoot,
      frontendRoot === packageRoot ? [binaryPath] : []
    );
    const frontendMarkerResult = evaluatePackagePrivacyMarkers(
      frontendArtifacts.map((artifact) => artifact.content),
      FRONTEND_PRIVACY_SHIELD_MARKERS
    );
    if (frontendMarkerResult.status !== "ready") {
      throw new Error(
        `Packaged ${target} build is missing frontend privacy shield markers: ${frontendMarkerResult.missingMarkers.join(
          ", "
        )}`
      );
    }

    const result = {
      target,
      status: "ready",
      checked,
      markers,
      frontendRoot,
      frontendChecked: frontendArtifacts.map((artifact) => artifact.path),
      frontendMarkers: FRONTEND_PRIVACY_SHIELD_MARKERS
    };
    if (writeAttestationPath) {
      await writePrivacyShieldAttestation({ outputPath: writeAttestationPath, ...result });
    }
    return result;
  } finally {
    await Promise.all(cleanup.map((candidate) => rm(candidate, { recursive: true, force: true })));
  }
}

async function resolvePackageInspectionScope({ target, releaseDir, appName, commandRunner, cleanup }) {
  if (target.startsWith("macos-")) {
    const appBundlePath = await firstExistingDirectory(
      [
        path.join(releaseDir, "bundle", "macos", `${appName}.app`),
        path.join(releaseDir, "macos", `${appName}.app`)
      ],
      `${target} app bundle`
    );
    const binaryPath = await firstExistingFile(
      [
        path.join(appBundlePath, "Contents", "MacOS", "caveman")
      ],
      `${target} app binary`
    );
    await assertNonEmptyFile(binaryPath, `${target} app binary`);
    return { binaryPath, packageRoot: appBundlePath };
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
    const binaryPath = await findFirstFileNamed(extractDir, PACKAGE_TARGETS[target].binaryName);
    return { binaryPath, packageRoot: extractDir };
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
    const packageRoot = path.join(extractDir, "squashfs-root");
    const binaryPath = await findFirstFileNamed(packageRoot, PACKAGE_TARGETS[target].binaryName);
    return { binaryPath, packageRoot };
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

async function firstExistingDirectory(candidates, label) {
  for (const candidate of candidates) {
    const candidateStat = await stat(candidate).catch(() => null);
    if (candidateStat?.isDirectory()) {
      return candidate;
    }
  }
  throw new Error(`Missing ${label}: ${candidates.join(" or ")}`);
}

export async function writePrivacyShieldAttestation({
  outputPath,
  target,
  checked,
  markers,
  frontendRoot = null,
  frontendChecked = [],
  frontendMarkers = []
}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        status: "ready",
        target,
        checked,
        markers,
        frontendRoot,
        frontendChecked,
        frontendMarkers
      },
      null,
      2
    )}\n`
  );
}

async function readPrivacyMarkerArtifacts(root, extraPaths = []) {
  const candidatePaths = new Set(extraPaths);
  for (const candidate of await findFiles(root, isFrontendAssetCandidate)) {
    candidatePaths.add(candidate);
  }

  const artifacts = [];
  for (const candidate of [...candidatePaths].sort()) {
    const content = await readFile(candidate);
    artifacts.push({ path: candidate, content });
  }
  return artifacts;
}

function isFrontendAssetCandidate(fileName) {
  const lowerName = fileName.toLowerCase();
  return [".html", ".js", ".mjs", ".css", ".json", ".txt", ".map"].some((extension) =>
    lowerName.endsWith(extension)
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

const isCliEntrypoint =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
