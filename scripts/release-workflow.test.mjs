import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/release.yml";
const desktopSmokeWorkflowPath = ".github/workflows/desktop-package-smoke.yml";

const normalizeLineEndings = (text) => text.replace(/\r\n/g, "\n");
const cavemanCargoLockVersionPattern = /\[\[package\]\]\nname = "caveman"\nversion = "0\.1\.1"/;
const updaterPublicKey =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDhFREQ5MzAzMUExN0VGNkUKUldSdTd4Y2FBNVBkam9EeDJFNmpqbCtPZkpDTmZ4T05HOHVhVEo5MmNwSFdqSTl4MHdwWHZqNXcK";

test("release workflow builds and publishes signed Windows updater assets", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on:\s*windows-2025-vs2026/);
  assert.doesNotMatch(workflow, /runs-on:\s*windows-latest/);
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
  assert.match(workflow, /runs-on:\s*macos-15-intel/);
  assert.doesNotMatch(workflow, /runs-on:\s*macos-13/);
  assert.match(workflow, /npm run tauri build -- --ci --bundles app --config src-tauri\/tauri\.release\.conf\.json/);
  assert.match(workflow, /node scripts\/create-macos-dmg\.mjs/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/dmg\/\*\.dmg/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz\.sig/);
  assert.match(workflow, /build-linux:/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
  assert.match(workflow, /libpipewire-0\.3-dev/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage\.sig/);
  assert.match(workflow, /publish-release:/);
  assert.match(workflow, /needs:\s*\[build-windows,\s*build-macos,\s*build-linux\]/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /node scripts\/generate-latest-json\.mjs/);
  assert.match(workflow, /--bundle-dir release-assets/);
  assert.match(workflow, /release-assets\/latest\.json/);
});

test("release workflow can run from pushed version tags without manual inputs", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /push:/);
  assert.match(workflow, /tags:/);
  assert.match(workflow, /v\*/);
  assert.match(workflow, /RELEASE_TAG:\s*\$\{\{\s*inputs\.tag\s*\|\|\s*github\.ref_name\s*\}\}/);
  assert.match(workflow, /RELEASE_NOTES:\s*\$\{\{\s*inputs\.release_notes\s*\|\|/);
  assert.match(workflow, /releases\/download\/\$\{\{\s*env\.RELEASE_TAG\s*\}\}/);
  assert.match(workflow, /-ReleaseNotes "\$\{\{\s*env\.RELEASE_NOTES\s*\}\}"/);
  assert.match(workflow, /tag_name:\s*\$\{\{\s*env\.RELEASE_TAG\s*\}\}/);
  assert.match(workflow, /body:\s*\$\{\{\s*env\.RELEASE_NOTES\s*\}\}/);
});

test("release workflow fails fast when updater signing secrets are missing", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  const validationSteps = [...workflow.matchAll(/Validate release signing secrets/g)];
  assert.equal(validationSteps.length, 3);
  assert.match(workflow, /IsNullOrWhiteSpace\(\$env:TAURI_SIGNING_PRIVATE_KEY\)/);
  assert.match(workflow, /Missing TAURI_SIGNING_PRIVATE_KEY repository secret/);
  assert.match(workflow, /npm run tauri signer generate/);
});

test("release workflow opts GitHub actions into the Node 24 runtime", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*true/);
});

test("desktop updater config uses the committed public signing key", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));

  assert.equal(tauriConfig.plugins.updater.pubkey, updaterPublicKey);
  assert.deepEqual(tauriConfig.plugins.updater.endpoints, [
    "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download/latest.json"
  ]);
});

test("repository includes distribution license metadata", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const license = await readFile("LICENSE", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(packageJson.license, "MIT");
  assert.match(license, /^MIT License/);
  assert.match(readme, /## License\s+MIT License/);
  assert.doesNotMatch(readme, /No license has been selected/);
});

test("release workflow contract is part of the release test suite", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(packageJson.scripts["test:release"], /release-workflow\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /create-macos-dmg\.test\.mjs/);
});

test("package scripts expose repeatable macOS and Windows installer builds", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const readme = await readFile("README.md", "utf8");
  const workflow = await readFile(desktopSmokeWorkflowPath, "utf8");

  assert.equal(packageJson.scripts["tauri:build:mac"], "tauri build --ci --bundles app && node scripts/create-macos-dmg.mjs");
  assert.equal(packageJson.scripts["tauri:build:windows"], "tauri build --ci --bundles nsis,msi");
  assert.match(readme, /npm run tauri:build:mac/);
  assert.match(readme, /npm run tauri:build:windows/);
  assert.match(workflow, /npm run tauri:build:windows/);
});

test("desktop release version is aligned for v0.1.1", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
  const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");

  assert.equal(packageJson.version, "0.1.1");
  assert.equal(packageLock.version, "0.1.1");
  assert.equal(packageLock.packages[""].version, "0.1.1");
  assert.equal(tauriConfig.version, "0.1.1");
  assert.match(cargoToml, /^version = "0\.1\.1"$/m);
  assert.match(normalizeLineEndings(cargoLock), cavemanCargoLockVersionPattern);
});

test("desktop release version check accepts Windows CRLF Cargo.lock files", () => {
  const cargoLock = '[[package]]\r\nname = "caveman"\r\nversion = "0.1.1"\r\n';

  assert.match(normalizeLineEndings(cargoLock), cavemanCargoLockVersionPattern);
});

test("desktop package smoke workflow builds macOS and Windows installers without publishing releases", async () => {
  const workflow = await readFile(desktopSmokeWorkflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[\s*main\s*\]/);
  assert.match(workflow, /build-windows:/);
  assert.match(workflow, /build-macos:/);
  assert.match(workflow, /windows-2025-vs2026/);
  assert.doesNotMatch(workflow, /windows-latest/);
  assert.match(workflow, /macos-15-intel/);
  assert.doesNotMatch(workflow, /macos-13/);
  assert.match(workflow, /if:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch'\s*\}\}/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:release/);
  assert.match(workflow, /npm run tauri:build:windows/);
  assert.match(workflow, /npm run tauri:build:mac/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
  assert.doesNotMatch(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
});
