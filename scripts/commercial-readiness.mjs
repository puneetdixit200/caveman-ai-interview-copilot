#!/usr/bin/env node
import { access, readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { runAudioEnvironmentSmoke } from "./audio-environment-smoke.mjs";
import { runLocalWhisperSmoke } from "./local-whisper-smoke.mjs";
import { runObsStealthSmoke } from "./obs-stealth-smoke.mjs";
import { runOllamaSmoke } from "./ollama-smoke.mjs";
import { runOpenRouterSmoke } from "./openrouter-smoke.mjs";
import {
  FRONTEND_PRIVACY_SHIELD_MARKERS,
  TARGET_PRIVACY_SHIELD_MARKERS
} from "./verify-privacy-shield-package.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const REQUIRED_SECRET_CHECKS = [
  {
    id: "tauri-updater",
    label: "Tauri updater signing",
    required: ["TAURI_SIGNING_PRIVATE_KEY"]
  },
  {
    id: "windows-authenticode",
    label: "Windows Authenticode signing",
    required: ["WINDOWS_CODESIGN_CERTIFICATE_BASE64", "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD"]
  },
  {
    id: "apple-certificate",
    label: "Apple Developer signing",
    required: ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "KEYCHAIN_PASSWORD"]
  },
  {
    id: "apple-notarization",
    label: "Apple notarization",
    anyOf: [
      ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"],
      ["APPLE_API_ISSUER", "APPLE_API_KEY", "APPLE_API_PRIVATE_KEY_BASE64"]
    ]
  }
];

export const REQUIRED_ARTIFACTS = [
  {
    id: "windows-nsis",
    label: "Windows x64 NSIS installer",
    examplePath: "caveman-windows-package-smoke/nsis/Caveman_0.1.1_x64-setup.exe",
    pattern: /(^|\/)caveman-windows-package-smoke\/nsis\/Caveman_.+_x64-setup\.exe$/
  },
  {
    id: "windows-msi",
    label: "Windows x64 MSI installer",
    examplePath: "caveman-windows-package-smoke/msi/Caveman_0.1.1_x64_en-US.msi",
    pattern: /(^|\/)caveman-windows-package-smoke\/msi\/Caveman_.+_x64_en-US\.msi$/
  },
  {
    id: "macos-arm64-dmg",
    label: "macOS Apple Silicon DMG",
    examplePath: "caveman-macos-arm64-package-smoke/dmg/Caveman_0.1.1_aarch64.dmg",
    pattern: /(^|\/)caveman-macos-arm64-package-smoke\/dmg\/Caveman_.+_aarch64\.dmg$/
  },
  {
    id: "macos-arm64-sidecar",
    label: "macOS Apple Silicon Whisper sidecar",
    examplePath: "caveman-macos-arm64-package-smoke/macos/Caveman.app/Contents/MacOS/caveman-whisper",
    pattern: /(^|\/)caveman-macos-arm64-package-smoke\/macos\/Caveman\.app\/Contents\/MacOS\/caveman-whisper$/
  },
  {
    id: "macos-x64-dmg",
    label: "macOS Intel DMG",
    examplePath: "caveman-macos-intel-package-smoke/dmg/Caveman_0.1.1_x64.dmg",
    pattern: /(^|\/)caveman-macos-intel-package-smoke\/dmg\/Caveman_.+_x64\.dmg$/
  },
  {
    id: "macos-x64-sidecar",
    label: "macOS Intel Whisper sidecar",
    examplePath: "caveman-macos-intel-package-smoke/macos/Caveman.app/Contents/MacOS/caveman-whisper",
    pattern: /(^|\/)caveman-macos-intel-package-smoke\/macos\/Caveman\.app\/Contents\/MacOS\/caveman-whisper$/
  },
  {
    id: "linux-appimage",
    label: "Linux x64 AppImage",
    examplePath: "caveman-linux-package-smoke/appimage/Caveman_0.1.1_amd64.AppImage",
    pattern: /(^|\/)caveman-linux-package-smoke\/appimage\/Caveman_.+_amd64\.AppImage$/
  },
  {
    id: "linux-deb",
    label: "Linux x64 DEB",
    examplePath: "caveman-linux-package-smoke/deb/Caveman_0.1.1_amd64.deb",
    pattern: /(^|\/)caveman-linux-package-smoke\/deb\/Caveman_.+_amd64\.deb$/
  },
  {
    id: "checksums",
    label: "SHA-256 checksum manifest",
    examplePath: "SHA256SUMS",
    pattern: /(^|\/)SHA256SUMS$/
  },
  {
    id: "privacy-shield-windows-x64",
    label: "Windows x64 privacy shield attestation",
    examplePath: "caveman-windows-package-smoke/privacy-shield-windows-x64.json",
    pattern: /(^|\/)caveman-windows-package-smoke\/privacy-shield-windows-x64\.json$/
  },
  {
    id: "privacy-shield-macos-arm64",
    label: "macOS Apple Silicon privacy shield attestation",
    examplePath: "caveman-macos-arm64-package-smoke/privacy-shield-macos-arm64.json",
    pattern: /(^|\/)caveman-macos-arm64-package-smoke\/privacy-shield-macos-arm64\.json$/
  },
  {
    id: "privacy-shield-macos-x64",
    label: "macOS Intel privacy shield attestation",
    examplePath: "caveman-macos-intel-package-smoke/privacy-shield-macos-x64.json",
    pattern: /(^|\/)caveman-macos-intel-package-smoke\/privacy-shield-macos-x64\.json$/
  },
  {
    id: "privacy-shield-linux-x64",
    label: "Linux x64 privacy shield attestation",
    examplePath: "caveman-linux-package-smoke/privacy-shield-linux-x64.json",
    pattern: /(^|\/)caveman-linux-package-smoke\/privacy-shield-linux-x64\.json$/
  }
];

const PRIVACY_SHIELD_TARGET_BY_ARTIFACT_ID = new Map([
  ["privacy-shield-windows-x64", "windows-x64"],
  ["privacy-shield-macos-arm64", "macos-arm64"],
  ["privacy-shield-macos-x64", "macos-x64"],
  ["privacy-shield-linux-x64", "linux-x64"]
]);

const PRIVACY_SHIELD_INSTALLER_PATTERNS_BY_TARGET = new Map([
  ["windows-x64", [/\/msi\/Caveman_.+_x64_en-US\.msi$/, /\/nsis\/Caveman_.+_x64-setup\.exe$/]],
  ["macos-arm64", [/\/dmg\/Caveman_.+_aarch64\.dmg$/]],
  ["macos-x64", [/\/dmg\/Caveman_.+_x64\.dmg$/]]
]);

export function parseGhSecretList(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function evaluateSecretReadiness(secretNames) {
  const available = new Set(secretNames);
  const checks = REQUIRED_SECRET_CHECKS.map((check) => evaluateSecretCheck(check, available));
  const missingSecrets = [];
  for (const check of checks) {
    for (const secret of check.missingSecrets) {
      if (!missingSecrets.includes(secret)) {
        missingSecrets.push(secret);
      }
    }
  }

  return {
    status: checks.every((check) => check.status === "ready") ? "ready" : "blocked",
    checks,
    missingSecrets
  };
}

function evaluateSecretCheck(check, available) {
  if (check.required) {
    const missingSecrets = check.required.filter((secret) => !available.has(secret));
    return {
      id: check.id,
      label: check.label,
      status: missingSecrets.length === 0 ? "ready" : "blocked",
      missingSecrets,
      detail: missingSecrets.length === 0 ? "All required secrets are configured." : `Missing: ${missingSecrets.join(", ")}`
    };
  }

  const completeOption = check.anyOf.find((option) => option.every((secret) => available.has(secret)));
  if (completeOption) {
    return {
      id: check.id,
      label: check.label,
      status: "ready",
      missingSecrets: [],
      detail: `Configured with: ${completeOption.join(", ")}`
    };
  }

  const missingSecrets = check.anyOf.flatMap((option) => option.filter((secret) => !available.has(secret)));
  return {
    id: check.id,
    label: check.label,
    status: "blocked",
    missingSecrets,
    detail: `Provide either ${check.anyOf.map((option) => option.join(", ")).join(" or ")}.`
  };
}

export function evaluateArtifactReadiness(files, { privacyShieldAttestations } = {}) {
  const normalizedFiles = files.map((file) => file.replace(/\\/g, "/"));
  const normalizedAttestations = privacyShieldAttestations
    ? normalizePrivacyShieldAttestations(privacyShieldAttestations)
    : undefined;
  const checks = REQUIRED_ARTIFACTS.map((artifact) => {
    const matchedPath = normalizedFiles.find((file) => artifact.pattern.test(file));
    let status = matchedPath ? "ready" : "blocked";
    let detail = matchedPath ? matchedPath : `Missing ${artifact.examplePath}`;

    if (matchedPath && normalizedAttestations && PRIVACY_SHIELD_TARGET_BY_ARTIFACT_ID.has(artifact.id)) {
      const target = PRIVACY_SHIELD_TARGET_BY_ARTIFACT_ID.get(artifact.id);
      const validation = validatePrivacyShieldAttestationPayload(target, normalizedAttestations.get(matchedPath));
      if (validation.status !== "ready") {
        status = "blocked";
        detail = validation.detail;
      }
    }

    return {
      id: artifact.id,
      label: artifact.label,
      status,
      path: matchedPath,
      detail
    };
  });
  const missingArtifacts = REQUIRED_ARTIFACTS.filter((artifact) => !checks.find((check) => check.id === artifact.id)?.path);

  return {
    status: checks.every((check) => check.status === "ready") ? "ready" : "blocked",
    checks,
    missingArtifacts
  };
}

function normalizePrivacyShieldAttestations(attestations) {
  return new Map(
    [...attestations.entries()].map(([attestationPath, payload]) => [
      String(attestationPath).replace(/\\/g, "/"),
      payload
    ])
  );
}

export function validatePrivacyShieldAttestationPayload(target, payload) {
  if (!payload) {
    return {
      status: "blocked",
      detail: `Missing readable privacy shield attestation payload for ${target}.`
    };
  }

  if (payload.error) {
    return {
      status: "blocked",
      detail: `Could not read privacy shield attestation for ${target}: ${payload.error}`
    };
  }

  if (payload.status !== "ready") {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} is not ready.`
    };
  }

  if (payload.target !== target) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation target mismatch: expected ${target}, got ${payload.target ?? "unknown"}.`
    };
  }

  if (!Array.isArray(payload.checked) || payload.checked.length === 0) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} does not list checked packaged app binaries.`
    };
  }

  const requiredInstallerPatterns = PRIVACY_SHIELD_INSTALLER_PATTERNS_BY_TARGET.get(target) ?? [];
  if (requiredInstallerPatterns.length > 0) {
    const installersChecked = Array.isArray(payload.installersChecked)
      ? payload.installersChecked.map((candidate) => String(candidate).replace(/\\/g, "/"))
      : [];
    const missingInstallerPatterns = requiredInstallerPatterns.filter(
      (pattern) => !installersChecked.some((candidate) => pattern.test(candidate))
    );
    if (missingInstallerPatterns.length > 0) {
      return {
        status: "blocked",
        detail: `Privacy shield attestation for ${target} does not prove every shipped installer was inspected.`
      };
    }
  }

  if (!Array.isArray(payload.markers)) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} does not list packaged markers.`
    };
  }

  const requiredMarkers = TARGET_PRIVACY_SHIELD_MARKERS[target] ?? [];
  const missingMarkers = requiredMarkers.filter((marker) => !payload.markers.includes(marker));
  if (missingMarkers.length > 0) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} is missing packaged markers: ${missingMarkers.join(", ")}`
    };
  }

  if (!Array.isArray(payload.frontendMarkers)) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} does not list built frontend markers.`
    };
  }

  const missingFrontendMarkers = FRONTEND_PRIVACY_SHIELD_MARKERS.filter(
    (marker) => !payload.frontendMarkers.includes(marker)
  );
  if (missingFrontendMarkers.length > 0) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} is missing built frontend markers: ${missingFrontendMarkers.join(", ")}`
    };
  }

  if (!Array.isArray(payload.frontendChecked) || payload.frontendChecked.length === 0) {
    return {
      status: "blocked",
      detail: `Privacy shield attestation for ${target} does not list checked built frontend files.`
    };
  }

  return {
    status: "ready",
    detail: `Privacy shield attestation for ${target} includes required packaged native and frontend markers.`
  };
}

export function evaluateOpenRouterOptionalReadiness({ secretNames = [], env = process.env } = {}) {
  const hasLiveKey = typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY.trim().length > 0;
  if (hasLiveKey) {
    return {
      id: "openrouter",
      label: "OpenRouter optional provider",
      status: "ready",
      liveKeyAvailable: true,
      detail: "OPENROUTER_API_KEY is available; live smoke will run."
    };
  }

  if (secretNames.includes("OPENROUTER_API_KEY")) {
    return {
      id: "openrouter",
      label: "OpenRouter optional provider",
      status: "ready",
      liveKeyAvailable: false,
      detail: "OPENROUTER_API_KEY repository secret is configured; export it locally to live-test this optional route."
    };
  }

  return {
    id: "openrouter",
    label: "OpenRouter optional provider",
    status: "ready",
    liveKeyAvailable: false,
    detail: "Optional route is configured; add OPENROUTER_API_KEY to live-test it."
  };
}

export function formatReadinessReport({ secretReadiness, artifactReadiness, liveChecks }) {
  const checks = [
    ...secretReadiness.checks,
    {
      id: "artifacts",
      label: "Redistributable package artifacts",
      status: artifactReadiness.status,
      detail:
        artifactReadiness.status === "ready"
          ? "Windows x64, macOS Intel, macOS Apple Silicon, and Linux x64 artifacts are present."
          : formatBlockedArtifactReadinessDetail(artifactReadiness)
    },
    ...liveChecks
  ];
  const status = checks.some((check) => check.status === "blocked")
    ? "BLOCKED"
    : checks.some((check) => check.status === "skipped")
      ? "INCOMPLETE"
      : "READY";

  return [
    status,
    "",
    ...checks.map((check) => `- ${check.label}: ${check.status} - ${check.detail}`),
    ...(secretReadiness.missingSecrets.length > 0 ? ["", "Missing secrets:", ...secretReadiness.missingSecrets.map((secret) => `- ${secret}`)] : [])
  ].join("\n");
}

function formatBlockedArtifactReadinessDetail(artifactReadiness) {
  if (artifactReadiness.missingArtifacts.length > 0) {
    return `Missing: ${artifactReadiness.missingArtifacts.map((artifact) => artifact.label).join(", ")}`;
  }

  const blockedChecks = artifactReadiness.checks.filter((check) => check.status === "blocked");
  return blockedChecks.map((check) => `${check.label}: ${check.detail}`).join("; ");
}

export async function runCommercialReadiness({
  artifactDir,
  artifactRoot = path.join(REPO_ROOT, "release-artifacts"),
  secretNames,
  skipLive = false
} = {}) {
  const resolvedArtifactDir = artifactDir ? path.resolve(artifactDir) : await findLatestArtifactRun(artifactRoot);
  const files = resolvedArtifactDir ? await listFiles(resolvedArtifactDir) : [];
  const privacyShieldAttestations = await loadPrivacyShieldAttestations(files);
  const artifactReadiness = evaluateArtifactReadiness(files, { privacyShieldAttestations });
  const resolvedSecretNames = secretNames ?? (await listGitHubSecretNames());
  const secretReadiness = evaluateSecretReadiness(resolvedSecretNames);
  const liveChecks = skipLive ? skippedLiveChecks() : await runLiveChecks({ secretNames: resolvedSecretNames });

  return {
    artifactDir: resolvedArtifactDir,
    secretReadiness,
    artifactReadiness,
    liveChecks,
    report: formatReadinessReport({ secretReadiness, artifactReadiness, liveChecks })
  };
}

export async function findLatestArtifactRun(artifactRoot = path.join(REPO_ROOT, "release-artifacts")) {
  const entries = await readdir(artifactRoot, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right) - Number(left));
  return candidates.length > 0 ? path.join(artifactRoot, candidates[0]) : undefined;
}

async function listGitHubSecretNames() {
  const { stdout } = await execFileAsync("gh", ["secret", "list"], { cwd: REPO_ROOT });
  return parseGhSecretList(stdout);
}

async function runLiveChecks({ secretNames = [] } = {}) {
  const results = [];
  results.push(await captureLiveCheck("local-whisper", "Local Whisper STT smoke", async () => {
    const result = await runLocalWhisperSmoke();
    return {
      status: result.status,
      detail: result.detail
    };
  }));
  results.push(await captureLiveCheck("ollama", "Ollama default model", async () => {
    const result = await runOllamaSmoke();
    return {
      status: "ready",
      detail: `${result.model} answered locally. Installed models: ${result.installedModels.join(", ")}.`
    };
  }));
  const openRouterReadiness = evaluateOpenRouterOptionalReadiness({ secretNames });
  if (openRouterReadiness.liveKeyAvailable) {
    results.push(await captureLiveCheck("openrouter", "OpenRouter optional provider", async () => {
      const result = await runOpenRouterSmoke();
      return {
        status: "ready",
        detail: `${result.model} answered through OpenRouter. Available models seen: ${result.availableModels.length}.`
      };
    }));
  } else {
    results.push(openRouterReadiness);
  }
  results.push(await captureLiveCheck("obs", "OBS screen-share stealth validation", async () => {
    const result = await runObsStealthSmoke();
    return {
      status: result.status,
      detail: result.messages.join(" ")
    };
  }));
  results.push(await captureLiveCheck("audio", "Audio test environment", async () => {
    const result = await runAudioEnvironmentSmoke();
    return {
      status: result.status,
      detail: result.messages.join(" ")
    };
  }));
  return results;
}

async function captureLiveCheck(id, label, callback) {
  try {
    return { id, label, ...(await callback()) };
  } catch (error) {
    return {
      id,
      label,
      status: "blocked",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export function skippedLiveChecks() {
  return [
    { id: "local-whisper", label: "Local Whisper STT smoke", status: "skipped", detail: "Live check skipped by flag." },
    { id: "ollama", label: "Ollama default model", status: "skipped", detail: "Live check skipped by flag." },
    { id: "openrouter", label: "OpenRouter optional provider", status: "skipped", detail: "Live check skipped by flag." },
    { id: "obs", label: "OBS screen-share stealth validation", status: "skipped", detail: "Live check skipped by flag." },
    { id: "audio", label: "Audio test environment", status: "skipped", detail: "Live check skipped by flag." }
  ];
}

async function listFiles(root) {
  if (!(await exists(root))) {
    return [];
  }

  const output = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      output.push(entryPath);
    }
  }
  return output.sort();
}

async function loadPrivacyShieldAttestations(files) {
  const attestations = new Map();
  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, "/");
    if (!/\/privacy-shield-[^/]+\.json$/.test(normalizedFile)) {
      continue;
    }

    try {
      attestations.set(normalizedFile, JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      attestations.set(normalizedFile, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return attestations;
}

async function exists(candidate) {
  try {
    await access(candidate);
    const candidateStat = await stat(candidate);
    return candidateStat.isDirectory() || candidateStat.isFile();
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
      case "--artifact-dir":
        options.artifactDir = next();
        break;
      case "--artifact-root":
        options.artifactRoot = next();
        break;
      case "--secrets-from-env":
        options.secretNames = Object.keys(process.env).filter((key) => /^[A-Z0-9_]+$/.test(key));
        break;
      case "--skip-live":
        options.skipLive = true;
        break;
      case "--json":
        options.json = true;
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
  return `Usage: node scripts/commercial-readiness.mjs [options]

Options:
  --artifact-dir <path>   Check a specific downloaded Desktop Package Smoke artifact directory.
  --artifact-root <path>  Search this root for the newest numeric artifact run directory.
  --secrets-from-env      Read configured secret names from environment variables instead of gh secret list.
  --skip-live             Skip Ollama, OBS, and audio live checks.
  --json                  Print JSON instead of the text report.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await runCommercialReadiness(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.report);
    if (result.artifactDir) {
      console.log("");
      console.log(`Artifact directory: ${result.artifactDir}`);
    }
  }

  if (!result.report.startsWith("READY")) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
