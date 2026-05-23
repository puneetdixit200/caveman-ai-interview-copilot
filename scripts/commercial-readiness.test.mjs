import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_ARTIFACTS,
  evaluateArtifactReadiness,
  evaluateSecretReadiness,
  formatReadinessReport,
  parseGhSecretList
} from "./commercial-readiness.mjs";

const completeSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "WINDOWS_CODESIGN_CERTIFICATE_BASE64",
  "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "KEYCHAIN_PASSWORD",
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_PRIVATE_KEY_BASE64"
];

test("accepts a complete commercial signing secret set with Apple API notarization", () => {
  const result = evaluateSecretReadiness(completeSecrets);

  assert.equal(result.status, "ready");
  assert.deepEqual(result.missingSecrets, []);
  assert.equal(result.checks.every((check) => check.status === "ready"), true);
});

test("reports exact missing commercial signing secrets and notarization alternatives", () => {
  const result = evaluateSecretReadiness(["TAURI_SIGNING_PRIVATE_KEY"]);

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingSecrets, [
    "WINDOWS_CODESIGN_CERTIFICATE_BASE64",
    "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD",
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "KEYCHAIN_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_API_ISSUER",
    "APPLE_API_KEY",
    "APPLE_API_PRIVATE_KEY_BASE64"
  ]);
  assert.match(result.checks.find((check) => check.id === "apple-notarization").detail, /Provide either/);
});

test("parses GitHub secret list output without reading secret values", () => {
  assert.deepEqual(
    parseGhSecretList("TAURI_SIGNING_PRIVATE_KEY\t2026-05-22T20:53:33Z\nAPPLE_ID\t2026-05-23T10:00:00Z\n"),
    ["TAURI_SIGNING_PRIVATE_KEY", "APPLE_ID"]
  );
});

test("verifies all redistributable package artifacts for target platforms", () => {
  const files = REQUIRED_ARTIFACTS.map((artifact) => `/tmp/run/${artifact.examplePath}`);
  const result = evaluateArtifactReadiness(files);

  assert.equal(result.status, "ready");
  assert.equal(result.missingArtifacts.length, 0);
});

test("reports missing redistributable artifacts by platform", () => {
  const result = evaluateArtifactReadiness([
    "/tmp/run/caveman-windows-package-smoke/nsis/Caveman_0.1.1_x64-setup.exe"
  ]);

  assert.equal(result.status, "blocked");
  assert.deepEqual(
    result.missingArtifacts.map((artifact) => artifact.id),
    [
      "windows-msi",
      "macos-arm64-dmg",
      "macos-arm64-sidecar",
      "macos-x64-dmg",
      "macos-x64-sidecar",
      "linux-appimage",
      "linux-deb",
      "checksums"
    ]
  );
});

test("formats a concise readiness report with blocked and ready checks", () => {
  const report = formatReadinessReport({
    secretReadiness: evaluateSecretReadiness(["TAURI_SIGNING_PRIVATE_KEY"]),
    artifactReadiness: evaluateArtifactReadiness(REQUIRED_ARTIFACTS.map((artifact) => artifact.examplePath)),
    liveChecks: [{ id: "ollama", label: "Ollama default model", status: "ready", detail: "llama3.1:8b answered." }]
  });

  assert.match(report, /^BLOCKED/m);
  assert.match(report, /Windows Authenticode signing: blocked/);
  assert.match(report, /Redistributable package artifacts: ready/);
  assert.match(report, /Ollama default model: ready/);
});
