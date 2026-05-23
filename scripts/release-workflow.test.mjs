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
  assert.match(script, /prepare-whisper-sidecars\.mjs/);
  assert.match(script, /tauri\.release\.sidecars\.generated\.conf\.json/);
  assert.match(script, /npm run tauri build -- --ci --config \$BuildConfigPath/);
});

test("signed build script requires Windows Authenticode signing config on Windows", async () => {
  const script = await readFile("scripts/build-signed-update.ps1", "utf8");

  assert.match(script, /WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT/);
  assert.match(script, /WINDOWS_CODESIGN_SIGN_COMMAND/);
  assert.match(script, /RuntimeInformation.*IsOSPlatform/);
  assert.match(script, /Missing Windows Authenticode signing configuration/);
  assert.match(script, /certificateThumbprint/);
  assert.match(script, /digestAlgorithm/);
  assert.match(script, /timestampUrl/);
  assert.match(script, /tauri\.release\.generated\.conf\.json/);
  assert.match(script, /--base-config/);
  assert.match(script, /--output-config/);
});

test("release workflow requires Windows code-signing certificates before building", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_BASE64:\s*\$\{\{\s*secrets\.WINDOWS_CODESIGN_CERTIFICATE_BASE64\s*\}\}/);
  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_PASSWORD:\s*\$\{\{\s*secrets\.WINDOWS_CODESIGN_CERTIFICATE_PASSWORD\s*\}\}/);
  assert.match(workflow, /Missing WINDOWS_CODESIGN_CERTIFICATE_BASE64 repository secret/);
  assert.match(workflow, /Missing WINDOWS_CODESIGN_CERTIFICATE_PASSWORD repository secret/);
  assert.match(workflow, /Import Windows code-signing certificate/);
  assert.match(workflow, /Import-PfxCertificate/);
  assert.match(workflow, /WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT=\$\(\$cert\.Thumbprint\)/);
  assert.match(workflow, /GITHUB_ENV/);
});

test("release workflow imports Apple Developer certificates before macOS builds", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /APPLE_CERTIFICATE:\s*\$\{\{\s*secrets\.APPLE_CERTIFICATE\s*\}\}/);
  assert.match(workflow, /APPLE_CERTIFICATE_PASSWORD:\s*\$\{\{\s*secrets\.APPLE_CERTIFICATE_PASSWORD\s*\}\}/);
  assert.match(workflow, /APPLE_SIGNING_IDENTITY:\s*\$\{\{\s*secrets\.APPLE_SIGNING_IDENTITY\s*\}\}/);
  assert.match(workflow, /KEYCHAIN_PASSWORD:\s*\$\{\{\s*secrets\.KEYCHAIN_PASSWORD\s*\}\}/);

  const importSteps = [...workflow.matchAll(/Import Apple Developer certificate/g)];
  assert.equal(importSteps.length, 2);
  assert.match(workflow, /security create-keychain/);
  assert.match(workflow, /security import/);
  assert.match(workflow, /security set-key-partition-list/);
  assert.match(workflow, /security find-identity -v -p codesigning/);
});

test("release workflow wires Apple notarization credentials for macOS builds", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /APPLE_ID:\s*\$\{\{\s*secrets\.APPLE_ID\s*\}\}/);
  assert.match(workflow, /APPLE_PASSWORD:\s*\$\{\{\s*secrets\.APPLE_PASSWORD\s*\}\}/);
  assert.match(workflow, /APPLE_TEAM_ID:\s*\$\{\{\s*secrets\.APPLE_TEAM_ID\s*\}\}/);
  assert.match(workflow, /APPLE_API_ISSUER:\s*\$\{\{\s*secrets\.APPLE_API_ISSUER\s*\}\}/);
  assert.match(workflow, /APPLE_API_KEY:\s*\$\{\{\s*secrets\.APPLE_API_KEY\s*\}\}/);
  assert.match(workflow, /APPLE_API_PRIVATE_KEY_BASE64:\s*\$\{\{\s*secrets\.APPLE_API_PRIVATE_KEY_BASE64\s*\}\}/);

  const apiKeySteps = [...workflow.matchAll(/Prepare Apple notarization API key/g)];
  assert.equal(apiKeySteps.length, 2);
  assert.match(workflow, /APPLE_API_KEY_PATH=.*AuthKey_\$\{APPLE_API_KEY\}\.p8/);
  assert.match(workflow, /APPLE_API_PRIVATE_KEY_BASE64/);
});

test("macOS bundle declares privacy usage descriptions for audio capture", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const infoPlist = await readFile("src-tauri/Info.plist", "utf8");
  const entitlements = await readFile("src-tauri/Entitlements.plist", "utf8");

  assert.equal(tauriConfig.bundle.macOS.infoPlist, "Info.plist");
  assert.equal(tauriConfig.bundle.macOS.hardenedRuntime, true);
  assert.equal(tauriConfig.bundle.macOS.entitlements, "Entitlements.plist");
  assert.match(infoPlist, /NSMicrophoneUsageDescription/);
  assert.match(infoPlist, /NSAudioCaptureUsageDescription/);
  assert.match(entitlements, /com\.apple\.security\.device\.audio-input/);
});

test("release workflow builds macOS and Linux packages before publishing one release", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /build-macos-intel:/);
  assert.match(workflow, /runs-on:\s*macos-15-intel/);
  assert.doesNotMatch(workflow, /runs-on:\s*macos-13/);
  assert.match(workflow, /build-macos-arm64:/);
  assert.match(workflow, /runs-on:\s*macos-15/);
  assert.match(workflow, /npm run sidecars:prepare -- --target current --base-config src-tauri\/tauri\.release\.conf\.json --output-config src-tauri\/target\/tauri\.release\.sidecars\.generated\.conf\.json/);
  assert.match(workflow, /npm run tauri build -- --ci --bundles app --config src-tauri\/target\/tauri\.release\.sidecars\.generated\.conf\.json/);
  assert.match(workflow, /node scripts\/create-macos-dmg\.mjs/);
  assert.match(workflow, /npm run package:verify-sidecar/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/dmg\/\*\.dmg/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/macos\/\*\.app\.tar\.gz\.sig/);
  assert.match(workflow, /build-linux:/);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
  assert.match(workflow, /libpipewire-0\.3-dev/);
  assert.match(workflow, /libasound2-dev/);
  assert.match(workflow, /libgbm-dev/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/appimage\/\*\.AppImage\.sig/);
  assert.match(workflow, /publish-release:/);
  assert.match(workflow, /needs:\s*\[build-windows,\s*build-macos-intel,\s*build-macos-arm64,\s*build-linux\]/);
  assert.match(workflow, /actions\/download-artifact@v8\.0\.1/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|download-artifact|upload-artifact)@v4/);
  assert.match(workflow, /node scripts\/generate-latest-json\.mjs/);
  assert.match(workflow, /--bundle-dir release-assets/);
  assert.match(workflow, /release-assets\/latest\.json/);
  assert.match(workflow, /release-assets\/\*\*\/\*\.app\.tar\.gz/);
  assert.match(workflow, /release-assets\/\*\*\/\*\.sig/);
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
  assert.equal(validationSteps.length, 4);
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
  assert.match(packageJson.scripts["test:release"], /prepare-whisper-sidecars\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /verify-bundled-sidecar\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /ollama-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /openrouter-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /configure-commercial-secrets\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /obs-stealth-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /audio-environment-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /commercial-readiness\.test\.mjs/);
  assert.equal(packageJson.scripts["sidecars:prepare"], "node scripts/prepare-whisper-sidecars.mjs --target current --output-config src-tauri/target/tauri.sidecars.generated.conf.json");
  assert.equal(packageJson.scripts["sidecars:check"], "node scripts/prepare-whisper-sidecars.mjs --target current --check");
  assert.equal(packageJson.scripts["package:verify-sidecar"], "node scripts/verify-bundled-sidecar.mjs --target current");
  assert.equal(packageJson.scripts["ai:smoke"], "node scripts/ollama-smoke.mjs");
  assert.equal(packageJson.scripts["ai:smoke:openrouter"], "node scripts/openrouter-smoke.mjs");
  assert.equal(packageJson.scripts["obs:smoke"], "node scripts/obs-stealth-smoke.mjs");
  assert.equal(packageJson.scripts["audio:smoke"], "node scripts/audio-environment-smoke.mjs");
  assert.equal(packageJson.scripts["commercial:check"], "node scripts/commercial-readiness.mjs");
  assert.equal(packageJson.scripts["commercial:secrets"], "node scripts/configure-commercial-secrets.mjs");
});

test("package scripts expose repeatable macOS and Windows installer builds", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const readme = await readFile("README.md", "utf8");
  const workflow = await readFile(desktopSmokeWorkflowPath, "utf8");

  assert.equal(
    packageJson.scripts["tauri:build:mac"],
    "npm run sidecars:prepare && tauri build --ci --bundles app --config src-tauri/target/tauri.sidecars.generated.conf.json && node scripts/create-macos-dmg.mjs && npm run package:verify-sidecar"
  );
  assert.equal(
    packageJson.scripts["tauri:build:windows"],
    "npm run sidecars:prepare && tauri build --ci --bundles nsis,msi --config src-tauri/target/tauri.sidecars.generated.conf.json && npm run package:verify-sidecar"
  );
  assert.equal(
    packageJson.scripts["tauri:build:linux"],
    "npm run sidecars:prepare && tauri build --ci --bundles appimage,deb --config src-tauri/target/tauri.sidecars.generated.conf.json && npm run package:verify-sidecar"
  );
  assert.match(readme, /npm run tauri:build:mac/);
  assert.match(readme, /npm run tauri:build:windows/);
  assert.match(readme, /npm run tauri:build:linux/);
  assert.match(readme, /npm run sidecars:prepare/);
  assert.match(workflow, /npm run tauri:build:windows/);
  assert.match(workflow, /npm run tauri:build:linux/);
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
  assert.match(workflow, /build-macos-intel:/);
  assert.match(workflow, /build-macos-arm64:/);
  assert.match(workflow, /build-linux:/);
  assert.match(workflow, /windows-2025-vs2026/);
  assert.doesNotMatch(workflow, /windows-latest/);
  assert.match(workflow, /macos-15-intel/);
  assert.match(workflow, /macos-15/);
  assert.match(workflow, /ubuntu-24\.04/);
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/);
  assert.match(workflow, /libpipewire-0\.3-dev/);
  assert.doesNotMatch(workflow, /macos-13/);
  assert.match(workflow, /if:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch'\s*\}\}/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:release/);
  assert.match(workflow, /npm run tauri:build:windows/);
  assert.match(workflow, /npm run tauri:build:mac/);
  assert.match(workflow, /npm run tauri:build:linux/);
  assert.match(workflow, /npm run package:verify-sidecar/);
  assert.match(workflow, /actions\/upload-artifact@v7\.0\.1/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|upload-artifact)@v4/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
  assert.doesNotMatch(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
});
