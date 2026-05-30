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
  "Companion app window bounds are repaired before and after privacy-approved startup show.",
  "Companion app windows are restored and repaired while privacy shield stays clear.",
  "Companion window bounds watchdog pauses repairs while screen-share risk is active.",
  "Companion window bounds watchdog performs a visible restore only after privacy clears.",
  "Companion app windows are focused only when unusable bounds need repair after privacy clears.",
  "macOS companion window repair reactivates the app only after unusable bounds are detected.",
  "Companion app windows reactivate after screen-share risk clears to recover usable bounds.",
  "Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard.",
  "Companion app window restore paths use the native show privacy gate before raising windows.",
  "Companion app window focus repair rechecks privacy before raising windows.",
  "Companion app window focus repair rechecks privacy again after raising windows.",
  "Companion app window restore stays paused after a native privacy denial.",
  "Native privacy shield starts before startup companion window show.",
  "Native privacy shield polls every 50ms for new screen-share risk.",
  "Native privacy shield keeps macOS window-title scans out of the fast poll so direct capture polling cannot stall.",
  "Native privacy shield checks macOS capture processes with pgrep before slower process parsing.",
  "Native privacy shield refreshes capture exclusion before hiding for screen-share risk.",
  "Native privacy shield applies app-window updates on the Tauri main thread.",
  "Native privacy shield exposes a nonblocking share-risk latch for bounds repair.",
  "Native privacy shield denied screen OCR capture.",
  "Waiting for app windows to leave capture surfaces before screen OCR capture.",
  "Native privacy shield denied active-window typing during screen-share risk.",
  "Native privacy shield denied active-window typing because capture exclusion was not proven.",
  "msedgewebview2.exe",
  "msedge_proxy.exe",
  "applicationframehost.exe",
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
  "call.google.com",
  "meet - ",
  "zoom.us",
  "join.skype.com",
  "app.slack.com",
  "discord.com",
  "web.whatsapp.com",
  "webex.com",
  "meet.goto.com",
  "meet.jit.si",
  "app.chime.aws",
  "whereby.com",
  "daily.co",
  "gather.town",
  "talky.io",
  "demio.com",
  "remo.co",
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
  "panopto.com",
  "kaltura.com",
  "screenity",
  "screenpal.exe",
  "screencast-o-matic",
  "descript.exe",
  "vidyard.exe",
  "clipchamp.exe",
  "you are sharing",
  "you're sharing",
  "you are sharing a window",
  "you are sharing this tab",
  "you're sharing a window",
  "you're sharing your screen",
  "sharing your screen",
  "sharing your entire screen",
  "sharing entire screen",
  "sharing is active",
  "sharing is paused",
  "sharing this tab",
  "sharing a browser tab",
  "sharing a chrome tab",
  "sharing a window",
  "sharing an application window",
  "this tab is being shared",
  "this window is being shared",
  "application window is being shared",
  "this screen is being shared",
  "your screen is being shared",
  "your window is being shared",
  "your tab is being shared",
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
  "meeting is being recorded",
  "call is being recorded",
  "recording in progress",
  "screen sharing",
  "screen share",
  "screen recorder",
  "live streaming",
  "broadcasting",
  "slack huddle",
  "discord voice",
  "whatsapp video call",
  "remote desktop",
  "Screen-share guard command timeout failed closed before privacy polling could stall.",
  "Screen-share window title guard normalizes UI punctuation before matching.",
  "Screen-share window title guard treats strong meeting/share titles from any visible app as risk.",
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
  "Overlay kept hidden until screen-share guard stays clear for repeated checks.",
  "Startup privacy shield defers macOS microphone device enumeration until explicit user audio action."
];

export const DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS = [
  "skype.exe",
  "skype for business",
  "lync.exe",
  "gotomeeting.exe",
  "g2mcomm.exe",
  "g2mstart.exe",
  "amazon chime.exe",
  "whereby.exe",
  "daily.exe",
  "gather.exe",
  "bluejeans.exe",
  "ringcentral.exe",
  "jitsi meet",
  "join.me",
  "around.exe",
  "mmhmm.exe",
  "zoom workplace",
  "zoom meetings",
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
  "obs studio",
  "screenflick",
  "screenflickhelper",
  "screenium",
  "capto",
  "monosnap",
  "shottr",
  "zappy",
  "recordit",
  "kaltura capture",
  "panopto recorder",
  "bbflashbackrecorder.exe",
  "flashback recorder",
  "movavi screen recorder",
  "icecream screen recorder",
  "apowersoft screen recorder",
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
  "dwagent.exe",
  "meshagent.exe",
  "dwrcc.exe",
  "dameware mini remote control",
  "supremo.exe",
  "remotepc.exe",
  "getscreen.me",
  "aeroadmin.exe",
  "sunloginclient.exe",
  "todesk.exe",
  "ultraviewer.exe",
  "connectwisecontrol.client.exe",
  "screenconnect.clientservice.exe"
];

export const MACOS_COMPANION_WINDOW_REPAIR_MARKERS = [
  "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
];

export const MACOS_NATIVE_PRIVACY_SHIELD_MARKERS = [
  "macOS process screen-share guard skips window-title scan after direct capture-process match.",
  "macOS window-title guard uses a short timeout so native privacy polling cannot stall.",
  "Native privacy shield enumerates macOS capture processes through libproc before shell fallbacks.",
  "Native privacy shield treats unexpected macOS pgrep errors as fail-closed before slower process parsing.",
  "Native privacy shield scans macOS window titles on a bounded background worker for browser Meet and Teams risk.",
  "Native privacy shield checks macOS CoreGraphics visible window titles before app windows can show.",
  "Native privacy shield scans macOS CoreGraphics visible window titles every 250ms for browser Meet and Teams risk.",
  "macOS CoreGraphics title guard hides when a visible browser window title is unavailable.",
  "Companion app windows use a privacy-gated reopen restore when the bundle is reopened."
];

export const WINDOWS_NATIVE_PRIVACY_SHIELD_MARKERS = [
  "Native privacy shield enumerates Windows visible window titles with EnumWindows for browser Meet and Teams risk.",
  "Native privacy shield checks Windows EnumWindows visible titles before tasklist fallback.",
  "Windows visible browser title guard hides when a visible browser window title is unavailable.",
  "Native privacy shield enumerates Windows processes with ToolHelp before tasklist fallback.",
  "Windows native show gate retries display-affinity verification after the window becomes visible."
];

export const TARGET_PRIVACY_SHIELD_MARKERS = {
  "windows-x64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    ...WINDOWS_NATIVE_PRIVACY_SHIELD_MARKERS,
    "SetWindowDisplayAffinity",
    "GetWindowDisplayAffinity"
  ],
  "macos-x64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    ...MACOS_COMPANION_WINDOW_REPAIR_MARKERS,
    ...MACOS_NATIVE_PRIVACY_SHIELD_MARKERS,
    "set_content_protected",
    "macOS rejected NSWindow content protection"
  ],
  "macos-arm64": [
    ...COMMON_PRIVACY_SHIELD_MARKERS,
    ...DESKTOP_PROCESS_PRIVACY_SHIELD_MARKERS,
    ...MACOS_COMPANION_WINDOW_REPAIR_MARKERS,
    ...MACOS_NATIVE_PRIVACY_SHIELD_MARKERS,
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
  const cleanupCommands = [];

  try {
    const packageScope = await resolvePackageInspectionScope({
      target,
      releaseDir,
      appName,
      commandRunner,
      cleanup,
      cleanupCommands
    });
    const binaryPaths = packageScope.binaryPaths ?? [packageScope.binaryPath];
    const packageRoots = packageScope.packageRoots ?? [packageScope.packageRoot];
    checked.push(...binaryPaths);

    for (const binaryPath of binaryPaths) {
      const binary = await readFile(binaryPath);
      const markerResult = evaluateBinaryPrivacyMarkers(binary, markers);
      if (markerResult.status !== "ready") {
        throw new Error(
          `Packaged ${target} binary ${binaryPath} is missing native privacy shield markers: ${markerResult.missingMarkers.join(
            ", "
          )}`
        );
      }
    }

    const frontendDistExists = await exists(frontendDist);
    const frontendRoots = frontendDistExists ? [frontendDist] : packageRoots;
    const frontendArtifacts = (
      await Promise.all(
        frontendRoots.map((frontendRoot) =>
          readPrivacyMarkerArtifacts(frontendRoot, frontendDistExists ? [] : binaryPaths)
        )
      )
    ).flat();
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
      installersChecked: packageScope.installersChecked ?? [],
      frontendRoot: frontendRoots[0],
      frontendRoots,
      frontendChecked: frontendArtifacts.map((artifact) => artifact.path),
      frontendMarkers: FRONTEND_PRIVACY_SHIELD_MARKERS
    };
    if (writeAttestationPath) {
      await writePrivacyShieldAttestation({ outputPath: writeAttestationPath, ...result });
    }
    return result;
  } finally {
    for (const cleanupCommand of cleanupCommands) {
      await cleanupCommand().catch(() => undefined);
    }
    await Promise.all(cleanup.map((candidate) => rm(candidate, { recursive: true, force: true })));
  }
}

async function resolvePackageInspectionScope({ target, releaseDir, appName, commandRunner, cleanup, cleanupCommands }) {
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

    const dmgFiles = [
      ...(await findFiles(path.join(releaseDir, "bundle", "dmg"), (file) => file.endsWith(".dmg"))),
      ...(await findFiles(path.join(releaseDir, "dmg"), (file) => file.endsWith(".dmg")))
    ];
    assertAny(dmgFiles, `${target} DMG installer`);
    const dmgMountDir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-dmg-"));
    cleanup.push(dmgMountDir);
    await mountMacosDmg({
      dmgPath: dmgFiles[0],
      mountDir: dmgMountDir,
      commandRunner,
      cleanupCommands
    });
    const dmgAppBundlePath = await firstExistingDirectory(
      [path.join(dmgMountDir, `${appName}.app`)],
      `${target} mounted DMG app bundle`
    );
    const dmgBinaryPath = await firstExistingFile(
      [path.join(dmgAppBundlePath, "Contents", "MacOS", "caveman")],
      `${target} mounted DMG app binary`
    );
    await assertNonEmptyFile(dmgBinaryPath, `${target} mounted DMG app binary`);

    return {
      binaryPaths: [binaryPath, dmgBinaryPath],
      packageRoots: [appBundlePath, dmgMountDir],
      installersChecked: [dmgFiles[0]]
    };
  }

  if (target === "windows-x64") {
    const msiFiles = [
      ...(await findFiles(path.join(releaseDir, "bundle", "msi"), (file) => file.endsWith(".msi"))),
      ...(await findFiles(path.join(releaseDir, "msi"), (file) => file.endsWith(".msi")))
    ];
    const nsisFiles = [
      ...(await findFiles(path.join(releaseDir, "bundle", "nsis"), (file) => file.endsWith(".exe"))),
      ...(await findFiles(path.join(releaseDir, "nsis"), (file) => file.endsWith(".exe")))
    ];
    assertAny(msiFiles, "Windows MSI installer");
    assertAny(nsisFiles, "Windows NSIS setup EXE installer");

    const extractDir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-msi-"));
    cleanup.push(extractDir);
    await commandRunner("msiexec.exe", ["/a", msiFiles[0], "/qn", `TARGETDIR=${extractDir}`], {
      maxBuffer: COMMAND_MAX_BUFFER
    });
    const msiBinaryPath = await findFirstFileNamed(extractDir, PACKAGE_TARGETS[target].binaryName);

    const nsisExtractDir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-nsis-"));
    cleanup.push(nsisExtractDir);
    await extractWindowsNsisInstaller({
      installerPath: nsisFiles[0],
      extractDir: nsisExtractDir,
      commandRunner
    });
    const nsisBinaryPath = await findFirstFileNamed(nsisExtractDir, PACKAGE_TARGETS[target].binaryName);

    return {
      binaryPaths: [msiBinaryPath, nsisBinaryPath],
      packageRoots: [extractDir, nsisExtractDir],
      installersChecked: [msiFiles[0], nsisFiles[0]]
    };
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

async function mountMacosDmg({ dmgPath, mountDir, commandRunner, cleanupCommands }) {
  await commandRunner("hdiutil", ["attach", dmgPath, "-mountpoint", mountDir, "-nobrowse", "-readonly", "-quiet"], {
    maxBuffer: COMMAND_MAX_BUFFER
  });
  cleanupCommands.push(async () => {
    try {
      await commandRunner("hdiutil", ["detach", mountDir, "-quiet"], {
        maxBuffer: COMMAND_MAX_BUFFER
      });
    } catch {
      await commandRunner("hdiutil", ["detach", mountDir, "-force", "-quiet"], {
        maxBuffer: COMMAND_MAX_BUFFER
      }).catch(() => undefined);
    }
  });
}

async function extractWindowsNsisInstaller({ installerPath, extractDir, commandRunner }) {
  const attempts = [];
  for (const extractor of windowsNsisExtractorCandidates()) {
    try {
      await commandRunner(extractor, ["x", installerPath, `-o${extractDir}`, "-y"], {
        maxBuffer: COMMAND_MAX_BUFFER
      });
      return;
    } catch (error) {
      attempts.push(`${extractor}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Could not extract Windows NSIS setup EXE for privacy shield verification. Tried: ${attempts.join("; ")}`
  );
}

function windowsNsisExtractorCandidates() {
  return [
    "7z",
    "7zz",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "7-Zip", "7z.exe") : null,
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "7-Zip", "7z.exe") : null
  ].filter(Boolean);
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
  installersChecked = [],
  frontendRoot = null,
  frontendRoots = frontendRoot ? [frontendRoot] : [],
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
        installersChecked,
        frontendRoot,
        frontendRoots,
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
