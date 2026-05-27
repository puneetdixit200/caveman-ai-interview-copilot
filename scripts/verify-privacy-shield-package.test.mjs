import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMON_PRIVACY_SHIELD_MARKERS,
  TARGET_PRIVACY_SHIELD_MARKERS,
  evaluateBinaryPrivacyMarkers,
  privacyShieldAttestationName,
  verifyPrivacyShieldPackage,
  writePrivacyShieldAttestation
} from "./verify-privacy-shield-package.mjs";

test("validates packaged native privacy markers from binary content", () => {
  const binary = Buffer.from(`prefix ${COMMON_PRIVACY_SHIELD_MARKERS.join(" middle ")} suffix`);

  const result = evaluateBinaryPrivacyMarkers(binary, COMMON_PRIVACY_SHIELD_MARKERS);

  assert.equal(result.status, "ready");
  assert.deepEqual(result.missingMarkers, []);
});

test("requires packaged Teams and Google Meet WebView detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msedgewebview2.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("teams.microsoft.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("meet.google.com"));
});

test("reports missing packaged native privacy markers", () => {
  const result = evaluateBinaryPrivacyMarkers(Buffer.from("Capture exclusion is not enforced."), [
    "Capture exclusion is not enforced.",
    "Native privacy shield denied showing",
    "SetWindowDisplayAffinity"
  ]);

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingMarkers, ["Native privacy shield denied showing", "SetWindowDisplayAffinity"]);
});

test("writes target-specific privacy shield attestations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-attestation-"));
  try {
    const attestationPath = path.join(dir, privacyShieldAttestationName("macos-arm64"));

    await writePrivacyShieldAttestation({
      outputPath: attestationPath,
      target: "macos-arm64",
      checked: ["/tmp/Caveman.app/Contents/MacOS/caveman"],
      markers: ["Capture exclusion is not enforced."]
    });

    const payload = JSON.parse(await readFile(attestationPath, "utf8"));
    assert.equal(payload.target, "macos-arm64");
    assert.equal(payload.status, "ready");
    assert.deepEqual(payload.checked, ["/tmp/Caveman.app/Contents/MacOS/caveman"]);
    assert.deepEqual(payload.markers, ["Capture exclusion is not enforced."]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifies downloaded macOS package-smoke artifact layout", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-downloaded-macos-"));
  try {
    const binaryPath = path.join(dir, "macos", "Caveman.app", "Contents", "MacOS", "caveman");
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));

    const result = await verifyPrivacyShieldPackage({
      targetSelector: "macos-arm64",
      releaseDir: dir
    });

    assert.equal(result.status, "ready");
    assert.deepEqual(result.checked, [binaryPath]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
