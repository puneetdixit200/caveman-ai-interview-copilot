import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_RELEASE_BASE_URL =
  "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download";

export async function buildLatestJson(options = {}) {
  const projectRoot = options.projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = options.configPath ?? path.join(projectRoot, "src-tauri", "tauri.conf.json");
  const bundleDir = options.bundleDir ?? path.join(projectRoot, "src-tauri", "target", "release", "bundle");
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_RELEASE_BASE_URL);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const version = options.version ?? config.version;

  if (!version || typeof version !== "string") {
    throw new Error("Could not determine release version from tauri.conf.json.");
  }

  const artifacts = options.artifactPath
    ? [
        {
          platform: options.platform ?? "windows-x86_64",
          artifactPath: options.artifactPath,
          signaturePath: options.signaturePath ?? `${options.artifactPath}.sig`
        }
      ]
    : await findUpdateArtifacts(bundleDir);
  const platforms = {};

  for (const artifact of artifacts) {
    const signature = (await readFile(artifact.signaturePath, "utf8")).trim();
    if (!signature) {
      throw new Error(`Signature file is empty: ${artifact.signaturePath}`);
    }

    platforms[artifact.platform] = {
      signature,
      url: `${baseUrl}/${path.basename(artifact.artifactPath)}`
    };
  }

  return {
    version,
    notes: await readReleaseNotes(options),
    pub_date: options.pubDate ?? new Date().toISOString(),
    platforms
  };
}

export async function writeLatestJson(options = {}) {
  const projectRoot = options.projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundleDir = options.bundleDir ?? path.join(projectRoot, "src-tauri", "target", "release", "bundle");
  const outputPath = options.outputPath ?? path.join(bundleDir, "latest.json");
  const manifest = await buildLatestJson({ ...options, projectRoot, bundleDir });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, outputPath };
}

export async function findWindowsUpdateArtifact(bundleDir) {
  const files = await listFilesRecursive(bundleDir);
  const signedArtifacts = signedArtifactPaths(files).filter((file) => isWindowsArtifact(file));

  if (signedArtifacts.length === 0) {
    throw new Error(
      `No signed Windows updater artifact found under ${bundleDir}. Run the signed Tauri build first.`
    );
  }

  return selectPreferredWindowsArtifact(signedArtifacts);
}

export async function findUpdateArtifacts(bundleDir) {
  const files = await listFilesRecursive(bundleDir);
  const signedArtifacts = signedArtifactPaths(files);
  const platformArtifacts = [
    selectPlatformArtifact("windows-x86_64", signedArtifacts, isWindowsArtifact, artifactScore),
    selectPlatformArtifact("darwin-x86_64", signedArtifacts, isMacosArtifact, artifactScore),
    selectPlatformArtifact("linux-x86_64", signedArtifacts, isLinuxArtifact, artifactScore)
  ].filter(Boolean);

  if (platformArtifacts.length === 0) {
    throw new Error(`No signed updater artifact found under ${bundleDir}. Run the signed Tauri build first.`);
  }

  return platformArtifacts;
}

export function selectPreferredWindowsArtifact(files) {
  return [...files].sort((left, right) => artifactScore(right) - artifactScore(left))[0];
}

export function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("Release base URL is required.");
  }
  return trimmed.replace(/\/+$/, "");
}

async function readReleaseNotes(options) {
  if (options.notesFile) {
    return readFile(options.notesFile, "utf8");
  }
  if (typeof options.notes === "string") {
    return options.notes;
  }
  return "Caveman signed desktop update.";
}

async function listFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
    })
  );
  return files.flat();
}

function signedArtifactPaths(files) {
  const fileSet = new Set(files);
  return files.filter((file) => !file.toLowerCase().endsWith(".sig") && fileSet.has(`${file}.sig`));
}

function selectPlatformArtifact(platform, files, matcher, scorer) {
  const candidates = files.filter(matcher);
  if (candidates.length === 0) {
    return undefined;
  }

  const artifactPath = [...candidates].sort((left, right) => scorer(right) - scorer(left))[0];
  return {
    platform,
    artifactPath,
    signaturePath: `${artifactPath}.sig`
  };
}

function isWindowsArtifact(file) {
  const normalized = normalizeArtifactPath(file);
  return normalized.endsWith(".exe") || normalized.endsWith(".msi");
}

function isMacosArtifact(file) {
  return normalizeArtifactPath(file).endsWith(".app.tar.gz");
}

function isLinuxArtifact(file) {
  const normalized = normalizeArtifactPath(file);
  return normalized.endsWith(".appimage") || normalized.endsWith(".deb");
}

function artifactScore(file) {
  const normalized = normalizeArtifactPath(file);
  if (normalized.includes("/nsis/") && normalized.endsWith("-setup.exe")) {
    return 400;
  }
  if (normalized.includes("/macos/") && normalized.endsWith(".app.tar.gz")) {
    return 400;
  }
  if (normalized.includes("/appimage/") && normalized.endsWith(".appimage")) {
    return 400;
  }
  if (normalized.endsWith("-setup.exe")) {
    return 300;
  }
  if (normalized.endsWith(".exe")) {
    return 200;
  }
  if (normalized.endsWith(".msi")) {
    return 100;
  }
  if (normalized.endsWith(".deb")) {
    return 100;
  }
  return 0;
}

function normalizeArtifactPath(file) {
  return file.replace(/\\/g, "/").toLowerCase();
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--base-url":
        options.baseUrl = next();
        break;
      case "--bundle-dir":
        options.bundleDir = path.resolve(next());
        break;
      case "--output":
        options.outputPath = path.resolve(next());
        break;
      case "--notes":
        options.notes = next();
        break;
      case "--notes-file":
        options.notesFile = path.resolve(next());
        break;
      case "--version":
        options.version = next();
        break;
      case "--pub-date":
        options.pubDate = next();
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

function printHelp() {
  console.log(`Usage: node scripts/generate-latest-json.mjs [options]

Options:
  --base-url <url>       Release download URL prefix.
  --bundle-dir <path>    Tauri bundle directory.
  --output <path>        latest.json output path.
  --notes <text>         Release notes.
  --notes-file <path>    Release notes file.
  --version <semver>     Release version override.
  --pub-date <date>      RFC 3339 publication date override.
`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const { outputPath } = await writeLatestJson(options);
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
