#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DMG_DIR = path.join(REPO_ROOT, "src-tauri", "target", "release", "bundle", "dmg");

export function buildCodesignArgs({ dmgPath, signingIdentity }) {
  requireValue(dmgPath, "dmgPath");
  requireValue(signingIdentity, "APPLE_SIGNING_IDENTITY");
  return ["--force", "--sign", signingIdentity, "--timestamp", dmgPath];
}

export function buildNotarytoolSubmitArgs({
  dmgPath,
  appleApiIssuer,
  appleApiKey,
  appleApiKeyPath,
  appleId,
  applePassword,
  appleTeamId
}) {
  requireValue(dmgPath, "dmgPath");

  if (appleApiIssuer && appleApiKey && appleApiKeyPath) {
    return [
      "notarytool",
      "submit",
      dmgPath,
      "--wait",
      "--issuer",
      appleApiIssuer,
      "--key-id",
      appleApiKey,
      "--key",
      appleApiKeyPath
    ];
  }

  if (appleId && applePassword && appleTeamId) {
    return [
      "notarytool",
      "submit",
      dmgPath,
      "--wait",
      "--apple-id",
      appleId,
      "--password",
      applePassword,
      "--team-id",
      appleTeamId
    ];
  }

  throw new Error(
    "Missing Apple notarization credentials. Provide APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID or APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_KEY_PATH."
  );
}

export function buildStaplerArgs(action, dmgPath) {
  if (!["staple", "validate"].includes(action)) {
    throw new Error(`Unsupported stapler action: ${action}`);
  }
  requireValue(dmgPath, "dmgPath");
  return ["stapler", action, dmgPath];
}

export function buildSpctlAssessArgs(dmgPath) {
  requireValue(dmgPath, "dmgPath");
  return ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose", dmgPath];
}

export async function findSingleDmg(dmgDir = DEFAULT_DMG_DIR) {
  const entries = await readdir(dmgDir, { withFileTypes: true }).catch(() => []);
  const dmgFiles = [];
  for (const entry of entries) {
    const candidate = path.join(dmgDir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".dmg") && (await isNonEmptyFile(candidate))) {
      dmgFiles.push(candidate);
    }
  }

  if (dmgFiles.length === 0) {
    throw new Error(`No macOS DMG found under ${dmgDir}`);
  }
  if (dmgFiles.length > 1) {
    throw new Error(`Expected one macOS DMG under ${dmgDir}, found ${dmgFiles.length}: ${dmgFiles.join(", ")}`);
  }
  return dmgFiles[0];
}

export async function notarizeMacosDmg({ dmgPath, dmgDir, env = process.env, spawn = spawnSync } = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS DMG notarization must run on macOS");
  }

  const resolvedDmgPath = dmgPath ? path.resolve(dmgPath) : await findSingleDmg(dmgDir);
  const signingIdentity = requiredEnv(env, "APPLE_SIGNING_IDENTITY");
  const notaryArgs = buildNotarytoolSubmitArgs({
    dmgPath: resolvedDmgPath,
    appleApiIssuer: env.APPLE_API_ISSUER,
    appleApiKey: env.APPLE_API_KEY,
    appleApiKeyPath: env.APPLE_API_KEY_PATH || env.APPLE_API_PRIVATE_KEY_PATH,
    appleId: env.APPLE_ID,
    applePassword: env.APPLE_PASSWORD,
    appleTeamId: env.APPLE_TEAM_ID
  });

  runChecked(spawn, "codesign", buildCodesignArgs({ dmgPath: resolvedDmgPath, signingIdentity }));
  runChecked(spawn, "xcrun", notaryArgs);
  runChecked(spawn, "xcrun", buildStaplerArgs("staple", resolvedDmgPath));
  runChecked(spawn, "xcrun", buildStaplerArgs("validate", resolvedDmgPath));
  runChecked(spawn, "spctl", buildSpctlAssessArgs(resolvedDmgPath));
  return resolvedDmgPath;
}

function runChecked(spawn, command, args) {
  const result = spawn(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function isNonEmptyFile(candidate) {
  const candidateStat = await stat(candidate).catch(() => undefined);
  return Boolean(candidateStat?.isFile() && candidateStat.size > 0);
}

function requiredEnv(env, name) {
  return requireValue(env[name], name);
}

function requireValue(value, label) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error(`Missing ${label}`);
  }
  return trimmed;
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
      case "--dmg-path":
        options.dmgPath = next();
        break;
      case "--dmg-dir":
        options.dmgDir = next();
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
  return `Usage: node scripts/notarize-macos-dmg.mjs [options]

Signs, notarizes, staples, and verifies the generated macOS DMG.

Options:
  --dmg-path <path>  Notarize one specific DMG.
  --dmg-dir <path>   Find exactly one DMG in this directory.
  --help             Show this help.

Required environment:
  APPLE_SIGNING_IDENTITY
  APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID
    or APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_KEY_PATH
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const dmgPath = await notarizeMacosDmg(options);
  console.log(`Notarized ${dmgPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
