import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCommercialSecretEntries,
  ghSecretSetInvocation,
  loadOptionsFromEnvFile,
  parseEnvFileContent,
  validateCommercialSecretEntries
} from "./configure-commercial-secrets.mjs";

async function withTempFiles(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "caveman-commercial-secrets-"));
  try {
    await writeFile(path.join(root, "windows.pfx"), "windows-cert");
    await writeFile(path.join(root, "apple.p12"), "apple-cert");
    await writeFile(path.join(root, "AuthKey_TEST.p8"), "apple-api-key");
    return await callback(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("builds GitHub secret payloads from commercial certificate files without exposing values in labels", async () => {
  await withTempFiles(async (root) => {
    const entries = await buildCommercialSecretEntries({
      windowsPfx: path.join(root, "windows.pfx"),
      windowsPassword: "win-pass",
      appleCertificate: path.join(root, "apple.p12"),
      appleCertificatePassword: "apple-pass",
      appleSigningIdentity: "Developer ID Application: Example Corp (TEAMID1234)",
      keychainPassword: "keychain-pass",
      appleApiIssuer: "issuer-id",
      appleApiKey: "TESTKEY1234",
      appleApiPrivateKey: path.join(root, "AuthKey_TEST.p8"),
      openRouterApiKey: "sk-or-test"
    });

    assert.deepEqual(
      entries.map((entry) => entry.name),
      [
        "WINDOWS_CODESIGN_CERTIFICATE_BASE64",
        "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD",
        "APPLE_CERTIFICATE",
        "APPLE_CERTIFICATE_PASSWORD",
        "APPLE_SIGNING_IDENTITY",
        "KEYCHAIN_PASSWORD",
        "APPLE_API_ISSUER",
        "APPLE_API_KEY",
        "APPLE_API_PRIVATE_KEY_BASE64",
        "OPENROUTER_API_KEY"
      ]
    );
    assert.equal(
      entries.find((entry) => entry.name === "WINDOWS_CODESIGN_CERTIFICATE_BASE64")?.value,
      Buffer.from("windows-cert").toString("base64")
    );
    assert.equal(
      entries.find((entry) => entry.name === "APPLE_CERTIFICATE")?.value,
      Buffer.from("apple-cert").toString("base64")
    );
    assert.equal(
      entries.find((entry) => entry.name === "APPLE_API_PRIVATE_KEY_BASE64")?.value,
      Buffer.from("apple-api-key").toString("base64")
    );
    assert.equal(entries.some((entry) => entry.label.includes("win-pass")), false);
    assert.equal(entries.some((entry) => entry.label.includes("sk-or-test")), false);
  });
});

test("requires complete commercial signing groups unless partial setup is allowed", async () => {
  const entries = await buildCommercialSecretEntries({
    windowsPassword: "win-pass",
    appleCertificatePassword: "apple-pass",
    keychainPassword: "keychain-pass"
  });

  assert.throws(
    () => validateCommercialSecretEntries(entries),
    /Missing required commercial release inputs: WINDOWS_CODESIGN_CERTIFICATE_BASE64, APPLE_CERTIFICATE, APPLE_SIGNING_IDENTITY, Apple notarization credentials/
  );
  assert.doesNotThrow(() => validateCommercialSecretEntries(entries, { allowPartial: true }));
});

test("accepts Apple ID notarization instead of App Store Connect API key credentials", async () => {
  await withTempFiles(async (root) => {
    const entries = await buildCommercialSecretEntries({
      windowsPfx: path.join(root, "windows.pfx"),
      windowsPassword: "win-pass",
      appleCertificate: path.join(root, "apple.p12"),
      appleCertificatePassword: "apple-pass",
      appleSigningIdentity: "Developer ID Application: Example Corp (TEAMID1234)",
      keychainPassword: "keychain-pass",
      appleId: "release@example.com",
      applePassword: "app-specific-password",
      appleTeamId: "TEAMID1234"
    });

    assert.doesNotThrow(() => validateCommercialSecretEntries(entries));
    assert.deepEqual(
      entries.slice(-3).map((entry) => entry.name),
      ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"]
    );
  });
});

test("loads commercial signing inputs from a local env file", async () => {
  await withTempFiles(async (root) => {
    const envFile = path.join(root, "commercial-release.env");
    await writeFile(
      envFile,
      [
        "# Local-only commercial release inputs.",
        `WINDOWS_CODESIGN_CERTIFICATE_PATH=${path.join(root, "windows.pfx")}`,
        'WINDOWS_CODESIGN_CERTIFICATE_PASSWORD="win pass # stays secret"',
        `APPLE_CERTIFICATE_PATH=${path.join(root, "apple.p12")}`,
        "APPLE_CERTIFICATE_PASSWORD=apple-pass",
        "APPLE_SIGNING_IDENTITY='Developer ID Application: Example Corp (TEAMID1234)'",
        "KEYCHAIN_PASSWORD=keychain-pass",
        "export APPLE_ID=release@example.com",
        "APPLE_PASSWORD=app-specific-password",
        "APPLE_TEAM_ID=TEAMID1234"
      ].join("\n")
    );

    const entries = await buildCommercialSecretEntries(await loadOptionsFromEnvFile(envFile));

    assert.doesNotThrow(() => validateCommercialSecretEntries(entries));
    assert.equal(
      entries.find((entry) => entry.name === "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD")?.value,
      "win pass # stays secret"
    );
    assert.equal(
      entries.find((entry) => entry.name === "APPLE_SIGNING_IDENTITY")?.value,
      "Developer ID Application: Example Corp (TEAMID1234)"
    );
  });
});

test("parses dotenv-style commercial release files without exposing values", () => {
  const parsed = parseEnvFileContent(`
# comments are ignored
export WINDOWS_CODESIGN_CERTIFICATE_PASSWORD="win pass # not a comment"
APPLE_SIGNING_IDENTITY='Developer ID Application: Example Corp (TEAMID1234)'
KEYCHAIN_PASSWORD=plain-value
`);

  assert.deepEqual(parsed, {
    WINDOWS_CODESIGN_CERTIFICATE_PASSWORD: "win pass # not a comment",
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Example Corp (TEAMID1234)",
    KEYCHAIN_PASSWORD: "plain-value"
  });
});

test("builds gh secret set invocation that sends the secret value over stdin", () => {
  const entry = {
    name: "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD",
    value: "super-secret",
    label: "Windows certificate password"
  };
  const invocation = ghSecretSetInvocation(entry, { repo: "owner/repo" });

  assert.deepEqual(invocation, {
    command: "gh",
    args: ["secret", "set", "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD", "--repo", "owner/repo"],
    stdin: "super-secret"
  });
  assert.equal(invocation.args.includes("super-secret"), false);
});
