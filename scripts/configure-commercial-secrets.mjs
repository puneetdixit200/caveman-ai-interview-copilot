#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const COMMERCIAL_REQUIRED_GROUPS = [
  ["WINDOWS_CODESIGN_CERTIFICATE_BASE64", "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD"],
  ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "KEYCHAIN_PASSWORD"]
];

const NOTARIZATION_GROUPS = [
  ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"],
  ["APPLE_API_ISSUER", "APPLE_API_KEY", "APPLE_API_PRIVATE_KEY_BASE64"]
];

export async function buildCommercialSecretEntries(input = {}) {
  const entries = [];
  await pushOptionalFileSecret(entries, "TAURI_SIGNING_PRIVATE_KEY", input.tauriSigningPrivateKeyFile, "Tauri updater private key");
  pushOptionalSecret(entries, "TAURI_SIGNING_PRIVATE_KEY", input.tauriSigningPrivateKey, "Tauri updater private key");
  pushOptionalSecret(
    entries,
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    input.tauriSigningPrivateKeyPassword,
    "Tauri updater private key password"
  );

  await pushOptionalFileSecret(
    entries,
    "WINDOWS_CODESIGN_CERTIFICATE_BASE64",
    input.windowsPfx,
    "Windows Authenticode PFX certificate",
    { base64: true }
  );
  pushOptionalSecret(entries, "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD", input.windowsPassword, "Windows Authenticode PFX password");

  await pushOptionalFileSecret(entries, "APPLE_CERTIFICATE", input.appleCertificate, "Apple Developer ID P12 certificate", {
    base64: true
  });
  pushOptionalSecret(entries, "APPLE_CERTIFICATE_PASSWORD", input.appleCertificatePassword, "Apple Developer ID P12 password");
  pushOptionalSecret(entries, "APPLE_SIGNING_IDENTITY", input.appleSigningIdentity, "Apple Developer ID signing identity");
  pushOptionalSecret(entries, "KEYCHAIN_PASSWORD", input.keychainPassword, "Temporary CI keychain password");

  pushOptionalSecret(entries, "APPLE_ID", input.appleId, "Apple ID notarization account");
  pushOptionalSecret(entries, "APPLE_PASSWORD", input.applePassword, "Apple ID app-specific password");
  pushOptionalSecret(entries, "APPLE_TEAM_ID", input.appleTeamId, "Apple Developer team ID");

  pushOptionalSecret(entries, "APPLE_API_ISSUER", input.appleApiIssuer, "App Store Connect API issuer ID");
  pushOptionalSecret(entries, "APPLE_API_KEY", input.appleApiKey, "App Store Connect API key ID");
  if (input.appleApiPrivateKeyBase64) {
    pushOptionalSecret(
      entries,
      "APPLE_API_PRIVATE_KEY_BASE64",
      input.appleApiPrivateKeyBase64,
      "App Store Connect API private key"
    );
  } else {
    await pushOptionalFileSecret(
      entries,
      "APPLE_API_PRIVATE_KEY_BASE64",
      input.appleApiPrivateKey,
      "App Store Connect API private key",
      { base64: true }
    );
  }

  pushOptionalSecret(entries, "OPENROUTER_API_KEY", input.openRouterApiKey, "Optional OpenRouter API key");
  return entries;
}

export function validateCommercialSecretEntries(entries, { allowPartial = false } = {}) {
  if (allowPartial) {
    return;
  }

  const available = new Set(entries.map((entry) => entry.name));
  const missing = [];
  for (const group of COMMERCIAL_REQUIRED_GROUPS) {
    for (const secret of group) {
      if (!available.has(secret)) {
        missing.push(secret);
      }
    }
  }

  const hasNotarization = NOTARIZATION_GROUPS.some((group) => group.every((secret) => available.has(secret)));
  if (!hasNotarization) {
    missing.push("Apple notarization credentials");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required commercial release inputs: ${missing.join(", ")}`);
  }
}

export function ghSecretSetInvocation(entry, { repo } = {}) {
  return {
    command: "gh",
    args: ["secret", "set", entry.name, ...(repo ? ["--repo", repo] : [])],
    stdin: entry.value
  };
}

export async function applyGitHubSecrets(entries, options = {}) {
  const results = [];
  for (const entry of entries) {
    const invocation = ghSecretSetInvocation(entry, options);
    await runSecretSet(invocation);
    results.push(entry.name);
  }
  return results;
}

async function pushOptionalFileSecret(entries, name, filePath, label, { base64 = false } = {}) {
  if (!filePath?.trim()) {
    return;
  }
  const bytes = await readFile(filePath.trim());
  entries.push({
    name,
    value: base64 ? bytes.toString("base64") : bytes.toString("utf8").trim(),
    label
  });
}

function pushOptionalSecret(entries, name, value, label) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return;
  }
  entries.push({ name, value: trimmed, label });
}

async function runSecretSet({ command, args, stdin }) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${command} ${args.join(" ")} exited with ${code}`));
      }
    });
    child.stdin.end(stdin);
  });
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
      case "--tauri-signing-private-key-file":
        options.tauriSigningPrivateKeyFile = next();
        break;
      case "--tauri-signing-private-key":
        options.tauriSigningPrivateKey = next();
        break;
      case "--tauri-signing-private-key-password":
        options.tauriSigningPrivateKeyPassword = next();
        break;
      case "--windows-pfx":
        options.windowsPfx = next();
        break;
      case "--windows-password":
        options.windowsPassword = next();
        break;
      case "--apple-certificate":
        options.appleCertificate = next();
        break;
      case "--apple-certificate-password":
        options.appleCertificatePassword = next();
        break;
      case "--apple-signing-identity":
        options.appleSigningIdentity = next();
        break;
      case "--keychain-password":
        options.keychainPassword = next();
        break;
      case "--apple-id":
        options.appleId = next();
        break;
      case "--apple-password":
        options.applePassword = next();
        break;
      case "--apple-team-id":
        options.appleTeamId = next();
        break;
      case "--apple-api-issuer":
        options.appleApiIssuer = next();
        break;
      case "--apple-api-key":
        options.appleApiKey = next();
        break;
      case "--apple-api-private-key":
        options.appleApiPrivateKey = next();
        break;
      case "--apple-api-private-key-base64":
        options.appleApiPrivateKeyBase64 = next();
        break;
      case "--openrouter-api-key":
        options.openRouterApiKey = next();
        break;
      case "--repo":
        options.repo = next();
        break;
      case "--from-env":
        Object.assign(options, optionsFromEnv(process.env));
        break;
      case "--allow-partial":
        options.allowPartial = true;
        break;
      case "--apply":
        options.apply = true;
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

function optionsFromEnv(env) {
  return {
    tauriSigningPrivateKey: env.TAURI_SIGNING_PRIVATE_KEY,
    tauriSigningPrivateKeyPassword: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    windowsPfx: env.WINDOWS_CODESIGN_CERTIFICATE_PATH,
    windowsPassword: env.WINDOWS_CODESIGN_CERTIFICATE_PASSWORD,
    appleCertificate: env.APPLE_CERTIFICATE_PATH,
    appleCertificatePassword: env.APPLE_CERTIFICATE_PASSWORD,
    appleSigningIdentity: env.APPLE_SIGNING_IDENTITY,
    keychainPassword: env.KEYCHAIN_PASSWORD,
    appleId: env.APPLE_ID,
    applePassword: env.APPLE_PASSWORD,
    appleTeamId: env.APPLE_TEAM_ID,
    appleApiIssuer: env.APPLE_API_ISSUER,
    appleApiKey: env.APPLE_API_KEY,
    appleApiPrivateKey: env.APPLE_API_PRIVATE_KEY_PATH,
    appleApiPrivateKeyBase64: env.APPLE_API_PRIVATE_KEY_BASE64,
    openRouterApiKey: env.OPENROUTER_API_KEY
  };
}

function usage() {
  return `Usage: node scripts/configure-commercial-secrets.mjs [options]

Builds the exact GitHub Actions secrets required for commercial signed releases.
By default this is a dry run that validates inputs and prints only secret names.
Use --apply to store secrets with gh secret set. Values are passed over stdin.

Common options:
  --windows-pfx <path>                 Windows Authenticode .pfx file.
  --windows-password <password>        Windows Authenticode .pfx password.
  --apple-certificate <path>           Apple Developer ID .p12 file.
  --apple-certificate-password <pass>  Apple Developer ID .p12 password.
  --apple-signing-identity <identity>  Developer ID Application identity.
  --keychain-password <password>       Temporary CI keychain password.

Choose one notarization set:
  --apple-id <email> --apple-password <pass> --apple-team-id <id>
  --apple-api-issuer <id> --apple-api-key <id> --apple-api-private-key <path>

Optional:
  --from-env                           Read values from matching environment variables.
  --repo <owner/repo>                  Apply secrets to a specific repository.
  --openrouter-api-key <key>           Store optional OpenRouter API key.
  --allow-partial                      Allow setting only the provided secrets.
  --apply                              Store secrets with gh secret set.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const entries = await buildCommercialSecretEntries(options);
  validateCommercialSecretEntries(entries, { allowPartial: options.allowPartial });
  if (entries.length === 0) {
    throw new Error("No commercial release secret inputs were provided.");
  }

  console.log(options.apply ? "APPLY" : "DRY RUN");
  for (const entry of entries) {
    console.log(`- ${entry.name}: ${entry.label}`);
  }

  if (options.apply) {
    await applyGitHubSecrets(entries, { repo: options.repo });
    console.log("");
    console.log(`Stored ${entries.length} GitHub secrets.`);
  } else {
    console.log("");
    console.log("No secrets were stored. Re-run with --apply to update GitHub Actions secrets.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
