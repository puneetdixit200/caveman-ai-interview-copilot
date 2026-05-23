#!/usr/bin/env node
import { access, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { runAudioEnvironmentSmoke } from "./audio-environment-smoke.mjs";
import { runObsStealthSmoke } from "./obs-stealth-smoke.mjs";
import { runOllamaSmoke } from "./ollama-smoke.mjs";

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
  }
];

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

export function evaluateArtifactReadiness(files) {
  const normalizedFiles = files.map((file) => file.replace(/\\/g, "/"));
  const checks = REQUIRED_ARTIFACTS.map((artifact) => {
    const matchedPath = normalizedFiles.find((file) => artifact.pattern.test(file));
    return {
      id: artifact.id,
      label: artifact.label,
      status: matchedPath ? "ready" : "blocked",
      path: matchedPath,
      detail: matchedPath ? matchedPath : `Missing ${artifact.examplePath}`
    };
  });
  const missingArtifacts = REQUIRED_ARTIFACTS.filter((artifact) => !checks.find((check) => check.id === artifact.id)?.path);

  return {
    status: missingArtifacts.length === 0 ? "ready" : "blocked",
    checks,
    missingArtifacts
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
          : `Missing: ${artifactReadiness.missingArtifacts.map((artifact) => artifact.label).join(", ")}`
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

export async function runCommercialReadiness({
  artifactDir,
  artifactRoot = path.join(REPO_ROOT, "release-artifacts"),
  secretNames,
  skipLive = false
} = {}) {
  const resolvedArtifactDir = artifactDir ? path.resolve(artifactDir) : await findLatestArtifactRun(artifactRoot);
  const files = resolvedArtifactDir ? await listFiles(resolvedArtifactDir) : [];
  const artifactReadiness = evaluateArtifactReadiness(files);
  const resolvedSecretNames = secretNames ?? (await listGitHubSecretNames());
  const secretReadiness = evaluateSecretReadiness(resolvedSecretNames);
  const liveChecks = skipLive ? skippedLiveChecks() : await runLiveChecks();

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

async function runLiveChecks() {
  const results = [];
  results.push(await captureLiveCheck("ollama", "Ollama default model", async () => {
    const result = await runOllamaSmoke();
    return {
      status: "ready",
      detail: `${result.model} answered locally. Installed models: ${result.installedModels.join(", ")}.`
    };
  }));
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

function skippedLiveChecks() {
  return [
    { id: "ollama", label: "Ollama default model", status: "skipped", detail: "Live check skipped by flag." },
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
