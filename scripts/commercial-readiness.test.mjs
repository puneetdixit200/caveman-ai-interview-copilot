import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_ARTIFACTS,
  evaluateArtifactReadiness,
  evaluateOpenRouterOptionalReadiness,
  evaluateSecretReadiness,
  formatReadinessReport,
  parseGhSecretList,
  skippedLiveChecks
} from "./commercial-readiness.mjs";
import { TARGET_PRIVACY_SHIELD_MARKERS } from "./verify-privacy-shield-package.mjs";

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

test("requires packaged native privacy shield attestations for every desktop target", () => {
  assert.deepEqual(
    REQUIRED_ARTIFACTS.filter((artifact) => artifact.id.startsWith("privacy-shield-")).map((artifact) => artifact.id),
    ["privacy-shield-windows-x64", "privacy-shield-macos-arm64", "privacy-shield-macos-x64", "privacy-shield-linux-x64"]
  );
});

test("blocks privacy shield attestations that lack required packaged detector markers", () => {
  const files = REQUIRED_ARTIFACTS.map((artifact) => `/tmp/run/${artifact.examplePath}`);
  const privacyShieldAttestations = new Map(
    [
      ["privacy-shield-windows-x64", "windows-x64"],
      ["privacy-shield-macos-arm64", "macos-arm64"],
      ["privacy-shield-macos-x64", "macos-x64"],
      ["privacy-shield-linux-x64", "linux-x64"]
    ].map(([artifactId, target]) => {
      const artifact = REQUIRED_ARTIFACTS.find((candidate) => candidate.id === artifactId);
      return [
        `/tmp/run/${artifact.examplePath}`,
        {
          status: "ready",
          target,
          markers: TARGET_PRIVACY_SHIELD_MARKERS[target]
        }
      ];
    })
  );
  privacyShieldAttestations.set("/tmp/run/caveman-windows-package-smoke/privacy-shield-windows-x64.json", {
    status: "ready",
    target: "windows-x64",
    markers: ["Screen-share guard failed closed:"]
  });

  const result = evaluateArtifactReadiness(files, { privacyShieldAttestations });

  assert.equal(result.status, "blocked");
  assert.match(
    result.checks.find((check) => check.id === "privacy-shield-windows-x64").detail,
    /msedgewebview2\.exe/
  );

  const report = formatReadinessReport({
    secretReadiness: evaluateSecretReadiness(completeSecrets),
    artifactReadiness: result,
    liveChecks: []
  });
  assert.match(report, /msedgewebview2\.exe/);
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
      "checksums",
      "privacy-shield-windows-x64",
      "privacy-shield-macos-arm64",
      "privacy-shield-macos-x64",
      "privacy-shield-linux-x64"
    ]
  );
});

test("formats a concise readiness report with blocked and ready checks", () => {
  const report = formatReadinessReport({
    secretReadiness: evaluateSecretReadiness(["TAURI_SIGNING_PRIVATE_KEY"]),
    artifactReadiness: evaluateArtifactReadiness(REQUIRED_ARTIFACTS.map((artifact) => artifact.examplePath)),
    liveChecks: [
      { id: "local-whisper", label: "Local Whisper STT smoke", status: "ready", detail: "Hello World." },
      { id: "ollama", label: "Ollama default model", status: "ready", detail: "llama3.1:8b answered." }
    ]
  });

  assert.match(report, /^BLOCKED/m);
  assert.match(report, /Windows Authenticode signing: blocked/);
  assert.match(report, /Redistributable package artifacts: ready/);
  assert.match(report, /Local Whisper STT smoke: ready/);
  assert.match(report, /Ollama default model: ready/);
});

test("keeps OpenRouter optional unless a live key is supplied", () => {
  const withoutKey = evaluateOpenRouterOptionalReadiness({
    secretNames: [],
    env: {}
  });
  const withRepoSecret = evaluateOpenRouterOptionalReadiness({
    secretNames: ["OPENROUTER_API_KEY"],
    env: {}
  });
  const withLiveKey = evaluateOpenRouterOptionalReadiness({
    secretNames: [],
    env: { OPENROUTER_API_KEY: "sk-or-test" }
  });

  assert.deepEqual(withoutKey, {
    id: "openrouter",
    label: "OpenRouter optional provider",
    status: "ready",
    liveKeyAvailable: false,
    detail: "Optional route is configured; add OPENROUTER_API_KEY to live-test it."
  });
  assert.equal(withRepoSecret.status, "ready");
  assert.equal(withRepoSecret.liveKeyAvailable, false);
  assert.match(withRepoSecret.detail, /repository secret is configured/);
  assert.equal(withLiveKey.status, "ready");
  assert.equal(withLiveKey.liveKeyAvailable, true);
  assert.match(withLiveKey.detail, /live smoke will run/);
});

test("skip-live mode still reports the local Whisper STT check as skipped", () => {
  assert.deepEqual(
    skippedLiveChecks().map((check) => check.id),
    ["local-whisper", "ollama", "openrouter", "obs", "audio"]
  );
});
