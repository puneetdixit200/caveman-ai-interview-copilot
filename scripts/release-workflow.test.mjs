import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/release.yml";

test("release workflow builds and publishes signed Windows updater assets", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run tauri:build:signed/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY\s*\}\}/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD\s*\}\}/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/latest\.json/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/nsis\/\*\.exe/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/nsis\/\*\.sig/);
  assert.match(workflow, /softprops\/action-gh-release/);
});

test("signed build script can use CI-provided Tauri signing secrets", async () => {
  const script = await readFile("scripts/build-signed-update.ps1", "utf8");

  assert.match(script, /\$env:TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(script, /IsNullOrWhiteSpace\(\$env:TAURI_SIGNING_PRIVATE_KEY\)/);
  assert.match(script, /Missing Tauri signing key/);
  assert.match(script, /npm run tauri build -- --ci --config src-tauri\/tauri\.release\.conf\.json/);
});

test("signed build script can inject optional Windows Authenticode signing config", async () => {
  const script = await readFile("scripts/build-signed-update.ps1", "utf8");

  assert.match(script, /WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT/);
  assert.match(script, /WINDOWS_CODESIGN_SIGN_COMMAND/);
  assert.match(script, /certificateThumbprint/);
  assert.match(script, /digestAlgorithm/);
  assert.match(script, /timestampUrl/);
  assert.match(script, /tauri\.release\.generated\.conf\.json/);
});

test("release workflow imports optional Windows code-signing certificates before building", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_BASE64:\s*\$\{\{\s*secrets\.WINDOWS_CODESIGN_CERTIFICATE_BASE64\s*\}\}/);
  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_PASSWORD:\s*\$\{\{\s*secrets\.WINDOWS_CODESIGN_CERTIFICATE_PASSWORD\s*\}\}/);
  assert.match(workflow, /Import Windows code-signing certificate/);
  assert.match(workflow, /Import-PfxCertificate/);
  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT=\$\(\$cert\.Thumbprint\)/);
  assert.match(workflow, /GITHUB_ENV/);
});

test("release workflow builds macOS and Linux packages before publishing one release", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /build-macos:/);
  assert.match(workflow, /runs-on:\s*macos-13/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz\.sig/);
  assert.match(workflow, /build-linux:/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage\.sig/);
  assert.match(workflow, /publish-release:/);
  assert.match(workflow, /needs:\s*\[build-windows,\s*build-macos,\s*build-linux\]/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /node scripts\/generate-latest-json\.mjs/);
  assert.match(workflow, /--bundle-dir release-assets/);
  assert.match(workflow, /release-assets\/latest\.json/);
});

test("release workflow contract is part of the release test suite", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(packageJson.scripts["test:release"], /release-workflow\.test\.mjs/);
});
