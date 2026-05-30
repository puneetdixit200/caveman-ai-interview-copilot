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

test("release workflow notarizes generated macOS DMGs before upload", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const notarizeScript = await readFile("scripts/notarize-macos-dmg.mjs", "utf8");

  const notarizationSteps = [...workflow.matchAll(/Notarize macOS DMG installer/g)];
  assert.equal(notarizationSteps.length, 2);
  assert.match(workflow, /node scripts\/notarize-macos-dmg\.mjs/);
  assert.match(notarizeScript, /runChecked\(spawn,\s*"xcrun",\s*buildStaplerArgs\("staple"/);
  assert.match(notarizeScript, /runChecked\(spawn,\s*"xcrun",\s*buildStaplerArgs\("validate"/);
  assert.match(notarizeScript, /runChecked\(spawn,\s*"spctl",\s*buildSpctlAssessArgs/);
  assert.match(notarizeScript, /"context:primary-signature"/);
  assert.ok(
    workflow.indexOf("Create macOS DMG installer") < workflow.indexOf("Notarize macOS DMG installer"),
    "DMG should be created before notarization"
  );
  assert.ok(
    workflow.indexOf("Notarize macOS DMG installer") < workflow.indexOf("Upload macOS Intel build artifact"),
    "DMG should be notarized before artifact upload"
  );
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

test("packaged desktop windows opt into OS content protection before runtime setup", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const releaseConfig = JSON.parse(await readFile("src-tauri/tauri.release.conf.json", "utf8"));
  const windowsByLabel = new Map(tauriConfig.app.windows.map((window) => [window.label, window]));
  const releaseWindowsByLabel = new Map(releaseConfig.app.windows.map((window) => [window.label, window]));

  for (const label of ["main", "overlay"]) {
    assert.equal(windowsByLabel.get(label)?.contentProtected, true);
    assert.equal(releaseWindowsByLabel.get(label)?.contentProtected, true);
  }
});

test("packaged dashboard stays hidden until the native privacy gate allows startup show", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const releaseConfig = JSON.parse(await readFile("src-tauri/tauri.release.conf.json", "utf8"));
  const libRs = await readFile("src-tauri/src/lib.rs", "utf8");
  const windowsByLabel = new Map(tauriConfig.app.windows.map((window) => [window.label, window]));
  const releaseWindowsByLabel = new Map(releaseConfig.app.windows.map((window) => [window.label, window]));

  assert.equal(windowsByLabel.get("main")?.visible, false);
  assert.equal(releaseWindowsByLabel.get("main")?.visible, false);
  assert.match(libRs, /let startup_allows_initial_show = overlay::configure_overlay_security\(app\)/);
  assert.match(libRs, /screen_share::start_native_privacy_shield\(app\.handle\(\)\.clone\(\)\)\?/);
  assert.match(libRs, /if startup_allows_initial_show\s*\{/);
  assert.match(libRs, /overlay::set_companion_windows_visible\(app\.handle\(\),\s*true,\s*true\)/);
  assert.ok(
    libRs.indexOf("let startup_allows_initial_show = overlay::configure_overlay_security(app)") <
      libRs.indexOf("screen_share::start_native_privacy_shield(app.handle().clone())?"),
    "startup setup must configure capture protection before starting the privacy shield"
  );
  assert.ok(
    libRs.indexOf("screen_share::start_native_privacy_shield(app.handle().clone())?") <
      libRs.indexOf("if startup_allows_initial_show"),
    "startup show gate must wait until the native privacy shield thread is running"
  );
  assert.ok(
    libRs.indexOf("if startup_allows_initial_show") <
      libRs.indexOf("overlay::set_companion_windows_visible(app.handle(), true, true)"),
    "startup show must run only after the privacy gate allows it"
  );
});

test("dashboard waits for repeated clear checks before restoring after share risk", async () => {
  const dashboardTsx = await readFile("src/pages/Dashboard.tsx", "utf8");
  const overlaySafetyTs = await readFile("src/lib/overlaySafety.ts", "utf8");
  const privacyShieldTimeoutTs = await readFile("src/lib/privacyShieldTimeout.ts", "utf8");
  const riskIndex = dashboardTsx.indexOf("privacyShieldHadRecentRisk.current = true");
  const clearIncrementIndex = dashboardTsx.indexOf("privacyShieldClearChecks.current += 1");
  const restoreGateIndex = dashboardTsx.indexOf("shouldRestoreAfterPrivacyShieldClear({", clearIncrementIndex);
  const showCompanionIndex = dashboardTsx.indexOf("setCompanionWindowsVisibleFailClosed(true", restoreGateIndex);

  assert.match(dashboardTsx, /shouldRestoreAfterPrivacyShieldClear/);
  assert.match(dashboardTsx, /withPrivacyShieldTimeout/);
  assert.match(dashboardTsx, /const PRIVACY_SHIELD_INTERVAL_MS = 500;/);
  assert.match(privacyShieldTimeoutTs, /Native privacy shield WebView command timeout failed closed before overlay visibility could drift\./);
  assert.match(dashboardTsx, /Overlay kept hidden until screen-share guard stays clear for repeated checks\./);
  assert.match(
    dashboardTsx,
    /Startup privacy shield defers macOS microphone device enumeration until explicit user audio action\./
  );
  assert.ok(
    !dashboardTsx.includes("listAudioDevices"),
    "dashboard startup must not enumerate microphone devices before explicit user audio action"
  );
  assert.match(overlaySafetyTs, /PRIVACY_SHIELD_RESTORE_CLEAR_CHECKS\s*=\s*2/);
  assert.notEqual(riskIndex, -1, "screen-share risk path must remember recent privacy risk");
  assert.notEqual(clearIncrementIndex, -1, "clear path must count consecutive clear checks");
  assert.notEqual(restoreGateIndex, -1, "clear path must gate restoration after recent risk");
  assert.notEqual(showCompanionIndex, -1, "companion show path must exist after restore gate");
  assert.ok(
    riskIndex < clearIncrementIndex && clearIncrementIndex < restoreGateIndex && restoreGateIndex < showCompanionIndex,
    "companion windows must not be restored until repeated clear checks pass"
  );
});

test("startup setup hides app windows when native privacy cannot be proven", async () => {
  const overlayRs = await readFile("src-tauri/src/overlay/mod.rs", "utf8");
  const configureStart = overlayRs.indexOf("pub fn configure_overlay_security(app: &mut tauri::App) -> bool");
  const startupDecisionStart = overlayRs.indexOf("pub fn startup_privacy_shield_hide_reason");

  assert.notEqual(configureStart, -1, "native startup security setup must exist");
  assert.notEqual(startupDecisionStart, -1, "startup setup must expose a testable privacy decision");

  const configureBody = overlayRs.slice(configureStart, startupDecisionStart);
  assert.match(configureBody, /protection_statuses\.push\(apply_capture_exclusion\(&window,\s*true\)\)/);
  assert.match(configureBody, /startup_privacy_shield_hide_reason\(/);
  assert.match(configureBody, /let startup_allows_initial_show = startup_hide_reason\.is_none\(\)/);
  assert.match(configureBody, /startup_allows_initial_show/);
  assert.ok(
    configureBody.indexOf("protection_statuses.push(apply_capture_exclusion(&window, true))") <
      configureBody.indexOf("startup_privacy_shield_hide_reason("),
    "startup hide decision must use the actual capture-exclusion setup results"
  );
  assert.match(
    configureBody,
    /crate::screen_share::detect_screen_share_status_for_native_privacy_shield\(\)/
  );
  assert.match(configureBody, /window\.hide\(\)/);
  assert.match(configureBody, /startup_allows_initial_show\s*$/m);
  assert.match(overlayRs.slice(startupDecisionStart), /native_privacy_shield_decision_for_overlay_protection/);
  assert.match(overlayRs.slice(startupDecisionStart), /STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER/);
});

test("startup refuses to run when the native privacy shield thread cannot start", async () => {
  const libRs = await readFile("src-tauri/src/lib.rs", "utf8");
  const screenShareRs = await readFile("src-tauri/src/screen_share.rs", "utf8");
  const setupStart = libRs.indexOf(".setup(|app|");
  const setupEnd = libRs.indexOf(".invoke_handler", setupStart);
  const setupBody = libRs.slice(setupStart, setupEnd);

  assert.notEqual(setupStart, -1, "Tauri setup block must exist");
  assert.match(setupBody, /screen_share::start_native_privacy_shield\(app\.handle\(\)\.clone\(\)\)\?/);
  assert.doesNotMatch(setupBody, /let _ = screen_share::start_native_privacy_shield/);
  assert.ok(
    setupBody.indexOf("screen_share::start_native_privacy_shield(app.handle().clone())?") <
      setupBody.indexOf("overlay::set_companion_windows_visible(app.handle(), true, true)"),
    "startup must refuse before any initial companion window show when shield startup fails"
  );
  assert.match(screenShareRs, /pub fn start_native_privacy_shield\(app: tauri::AppHandle\) -> anyhow::Result<\(\)>/);
  assert.match(
    screenShareRs,
    /Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard\./
  );
  assert.match(screenShareRs, /Native privacy shield starts before startup companion window show\./);
});

test("native privacy shield refreshes capture protection before share-risk hide", async () => {
  const screenShareRs = await readFile("src-tauri/src/screen_share.rs", "utf8");
  const shieldStart = screenShareRs.indexOf("pub fn start_native_privacy_shield(app: tauri::AppHandle)");
  const shieldEnd = screenShareRs.indexOf("pub fn native_privacy_shield_thread_start_error_message", shieldStart);
  const shieldBody = screenShareRs.slice(shieldStart, shieldEnd);
  const updateStart = screenShareRs.indexOf("fn apply_native_privacy_shield_window_update");
  const updateEnd = screenShareRs.indexOf("fn hide_app_windows_for_native_privacy_shield", updateStart);
  const updateBody = screenShareRs.slice(updateStart, updateEnd);
  const shareRiskBranchStart = updateBody.indexOf("NativePrivacyShieldDecision::Hide { .. } =>");
  const mainThreadDispatch = shieldBody.indexOf("app.run_on_main_thread");
  const shareRiskLatch = shieldBody.indexOf("share_risk_was_active");
  const queuedWindowUpdate = shieldBody.indexOf("apply_native_privacy_shield_window_update", mainThreadDispatch);
  const clearRestore = updateBody.indexOf("restore_companion_windows_after_share_risk_cleared");
  const refreshIndex = updateBody.indexOf("crate::overlay::protect_overlay_window(app, true)", shareRiskBranchStart);
  const hideIndex = updateBody.indexOf("hide_app_windows_for_native_privacy_shield(app)", shareRiskBranchStart);

  assert.notEqual(shieldStart, -1, "native privacy shield entrypoint must exist");
  assert.notEqual(updateStart, -1, "native privacy shield window update helper must exist");
  assert.notEqual(updateEnd, -1, "native privacy shield window update helper body must be bounded");
  assert.notEqual(shareRiskBranchStart, -1, "screen-share risk branch must fail closed");
  assert.notEqual(mainThreadDispatch, -1, "privacy shield window updates must be scheduled on the Tauri main thread");
  assert.notEqual(shareRiskLatch, -1, "privacy shield must remember whether the previous poll hid for share risk");
  assert.notEqual(queuedWindowUpdate, -1, "privacy shield must call the queued window update helper");
  assert.notEqual(clearRestore, -1, "privacy shield must run a stronger restore when share risk clears");
  assert.notEqual(refreshIndex, -1, "share-risk branch must refresh capture exclusion before hiding");
  assert.notEqual(hideIndex, -1, "share-risk branch must hide app windows");
  assert.ok(shareRiskLatch < mainThreadDispatch, "share-risk transition state must be computed before UI restore dispatch");
  assert.ok(mainThreadDispatch < queuedWindowUpdate, "privacy decisions must dispatch window updates to the main thread");
  assert.ok(refreshIndex < hideIndex, "capture exclusion must be refreshed before app windows are hidden");
  assert.match(screenShareRs, /Duration::from_millis\(50\)/);
  assert.match(screenShareRs, /Duration::from_millis\(750\)/);
  assert.match(screenShareRs, /Native privacy shield polls every 50ms for new screen-share risk\./);
  assert.match(
    screenShareRs,
    /Native privacy shield keeps macOS window-title scans out of the fast poll so direct capture polling cannot stall\./
  );
  assert.match(
    screenShareRs,
    /Native privacy shield checks macOS capture processes with pgrep before slower process parsing\./
  );
  assert.match(
    screenShareRs,
    /Native privacy shield treats unexpected macOS pgrep errors as fail-closed before slower process parsing\./
  );
  assert.match(
    screenShareRs,
    /Native privacy shield enumerates macOS capture processes through libproc before shell fallbacks\./
  );
  assert.ok(
    screenShareRs.indexOf("detect_macos_libproc_direct_capture_process_status()") <
      screenShareRs.indexOf('run_screen_share_guard_command("pgrep"'),
    "macOS native process enumeration must run before pgrep fallback"
  );
  assert.match(screenShareRs, /output\.status\.code\(\) != Some\(MACOS_DIRECT_CAPTURE_PGREP_NO_MATCH_EXIT_CODE\)/);
  assert.match(
    screenShareRs,
    /Native privacy shield scans macOS window titles on a bounded background worker for browser Meet and Teams risk\./
  );
  assert.match(
    screenShareRs,
    /macOS window-title guard uses a short timeout so native privacy polling cannot stall\./
  );
  assert.match(screenShareRs, /detect_screen_share_status_for_native_privacy_shield/);
  assert.match(screenShareRs, /detect_macos_direct_capture_process_status\(\)\?/);
  assert.match(screenShareRs, /start_macos_window_title_privacy_scan_thread\(\)\?/);
  assert.match(screenShareRs, /MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE\.load/);
  assert.doesNotMatch(screenShareRs, /native_privacy_shield_decision_with_cached_title_scan/);
  assert.doesNotMatch(screenShareRs, /NativePrivacyShieldPollState::default/);
  assert.match(
    screenShareRs,
    /Native privacy shield refreshes capture exclusion before hiding for screen-share risk\./
  );
  assert.match(screenShareRs, /Native privacy shield applies app-window updates on the Tauri main thread\./);
});

test("macOS reopen uses the same privacy gate before restoring companion windows", async () => {
  const libRs = await readFile("src-tauri/src/lib.rs", "utf8");
  const overlayRs = await readFile("src-tauri/src/overlay/mod.rs", "utf8");

  assert.match(libRs, /build\(tauri::generate_context!\(\)\)/);
  assert.match(libRs, /tauri::RunEvent::Reopen/);
  assert.match(libRs, /overlay::restore_companion_windows_after_user_reopen\(app_handle\)/);
  assert.match(
    overlayRs,
    /Companion app windows use a privacy-gated reopen restore when the bundle is reopened\./
  );

  const restoreStart = overlayRs.indexOf("pub fn restore_companion_windows_after_user_reopen");
  const restoreEnd = overlayRs.indexOf("pub fn repair_companion_window_bounds_without_show", restoreStart);
  const restoreBody = overlayRs.slice(restoreStart, restoreEnd);

  assert.notEqual(restoreStart, -1, "reopen restore helper must exist");
  assert.notEqual(restoreEnd, -1, "reopen restore helper body must be bounded");
  assert.match(restoreBody, /protect_overlay_window\(app,\s*true\)/);
  assert.match(restoreBody, /detect_screen_share_status_for_native_privacy_shield\(\)/);
  assert.match(restoreBody, /set_companion_windows_visible\(app,\s*false,\s*true\)/);
  assert.match(restoreBody, /restore_companion_windows_after_share_risk_cleared\(app\)/);
  assert.ok(
    restoreBody.indexOf("detect_screen_share_status_for_native_privacy_shield()") <
      restoreBody.indexOf("restore_companion_windows_after_share_risk_cleared(app)"),
    "reopen must check fast native screen-share risk before restoring windows"
  );
});

test("companion bounds watchdog pauses repairs during active share-risk", async () => {
  const overlayRs = normalizeLineEndings(await readFile("src-tauri/src/overlay/mod.rs", "utf8"));
  const watchdogRepairStart = overlayRs.indexOf("pub fn repair_companion_window_bounds_without_show(");
  const watchdogRepairEnd = overlayRs.indexOf("pub fn start_companion_window_bounds_watchdog", watchdogRepairStart);

  assert.notEqual(watchdogRepairStart, -1, "companion watchdog repair helper must exist");
  assert.notEqual(watchdogRepairEnd, -1, "companion watchdog repair helper body must be bounded");

  const watchdogRepairBody = overlayRs.slice(watchdogRepairStart, watchdogRepairEnd);
  const shareRiskLatch = watchdogRepairBody.indexOf("crate::screen_share::native_privacy_shield_share_risk_is_active()");
  const fullDetector = watchdogRepairBody.indexOf("crate::screen_share::detect_screen_share_status()");
  const earlyReturn = watchdogRepairBody.indexOf("return;");
  const windowLoop = watchdogRepairBody.indexOf("for (label, window) in app.webview_windows()");
  const nativeRepair = watchdogRepairBody.indexOf("repair_native_companion_window_bounds_if_needed");
  const standardRepair = watchdogRepairBody.indexOf("repair_companion_window_bounds(app, &window)");
  const visibleRestoreFlag = watchdogRepairBody.indexOf("needs_visible_restore");
  const visibleRestore = watchdogRepairBody.indexOf("restore_companion_windows_after_clear_privacy_check(app)");

  assert.notEqual(shareRiskLatch, -1, "watchdog must check the nonblocking share-risk latch");
  assert.equal(fullDetector, -1, "watchdog must not run the full screen-share detector on the UI thread");
  assert.notEqual(earlyReturn, -1, "watchdog must return before repairs during share-risk");
  assert.notEqual(windowLoop, -1, "watchdog must still repair windows after the privacy check clears");
  assert.notEqual(nativeRepair, -1, "watchdog must still run native bounds repair when clear");
  assert.notEqual(standardRepair, -1, "watchdog must still run standard bounds repair when clear");
  assert.notEqual(visibleRestoreFlag, -1, "watchdog must track when hidden/tiny windows need visible restore");
  assert.notEqual(visibleRestore, -1, "watchdog must visibly restore unusable windows after privacy clears");
  assert.ok(shareRiskLatch < earlyReturn, "privacy latch must control the watchdog early return");
  assert.ok(earlyReturn < windowLoop, "watchdog must skip all repairs while share-risk is active");
  assert.ok(windowLoop < nativeRepair, "native repair must only run after the privacy pause check");
  assert.ok(windowLoop < standardRepair, "standard repair must only run after the privacy pause check");
  assert.ok(standardRepair < visibleRestore, "visible restore must run after watchdog has checked repaired bounds");
  assert.match(
    overlayRs,
    /Companion window bounds watchdog pauses repairs while screen-share risk is active\./
  );
  assert.match(
    overlayRs,
    /Companion window bounds watchdog performs a visible restore only after privacy clears\./
  );
});

test("macOS process guard short-circuits before window-title scan", async () => {
  const screenShareRs = normalizeLineEndings(await readFile("src-tauri/src/screen_share.rs", "utf8"));
  const macosBranchStart = screenShareRs.indexOf("#[cfg(target_os = \"macos\")]\n    {");
  const macosBranchEnd = screenShareRs.indexOf("#[cfg(not(any(target_os = \"macos\", target_os = \"windows\")))]", macosBranchStart);

  assert.notEqual(macosBranchStart, -1, "macOS screen-share detector branch must exist");
  assert.notEqual(macosBranchEnd, -1, "macOS screen-share detector branch must be bounded");

  const macosBranch = screenShareRs.slice(macosBranchStart, macosBranchEnd);
  const processParse = macosBranch.indexOf("parse_unix_process_list");
  const directStatus = macosBranch.indexOf("let direct_process_status = screen_share_status_for_processes(processes.clone())");
  const directReturn = macosBranch.indexOf("return Ok(direct_process_status)");
  const titleScan = macosBranch.indexOf("detect_macos_visible_window_title_processes()");

  assert.notEqual(processParse, -1, "macOS detector must parse process list first");
  assert.notEqual(directStatus, -1, "macOS detector must evaluate direct process matches");
  assert.notEqual(directReturn, -1, "macOS detector must return direct process matches immediately");
  assert.notEqual(titleScan, -1, "macOS detector must still scan window titles when no direct process risk exists");
  assert.ok(processParse < directStatus, "direct status must use parsed process rows");
  assert.ok(directStatus < directReturn, "direct process status must control short-circuit return");
  assert.ok(directReturn < titleScan, "direct process risks must skip the slower window-title scan");
  assert.match(
    screenShareRs,
    /macOS process screen-share guard skips window-title scan after direct capture-process match\./
  );
});

test("native screen OCR capture hides app windows before creating screenshots", async () => {
  const commandsRs = await readFile("src-tauri/src/commands.rs", "utf8");
  const commandStart = commandsRs.indexOf("pub fn capture_screen_frame(app_handle: AppHandle)");

  assert.notEqual(commandStart, -1, "OCR capture command must receive AppHandle for native privacy controls");
  assert.ok(
    commandStart < commandsRs.indexOf("ocr::capture_screen_frame()", commandStart),
    "OCR capture command must be app-aware before invoking the native screenshot API"
  );

  const commandBody = commandsRs.slice(commandStart, commandsRs.indexOf("#[tauri::command]", commandStart + 1));
  const hideOverlay = commandBody.indexOf("overlay::set_overlay_window_visible(&app_handle, false, true)");
  const hideCompanions = commandBody.indexOf("overlay::set_companion_windows_visible(&app_handle, false, true)");
  const settleWait = commandBody.indexOf("ocr::wait_for_app_windows_to_leave_capture_surfaces()");
  const captureCall = commandBody.indexOf("ocr::capture_screen_frame()");

  assert.notEqual(hideOverlay, -1, "OCR capture must hide overlay window before screenshotting");
  assert.notEqual(hideCompanions, -1, "OCR capture must hide companion app windows before screenshotting");
  assert.notEqual(settleWait, -1, "OCR capture must wait for hidden app windows to leave capture surfaces");
  assert.ok(hideOverlay < captureCall, "overlay hide must run before native screenshot capture");
  assert.ok(hideCompanions < captureCall, "companion window hide must run before native screenshot capture");
  assert.ok(settleWait < captureCall, "capture settle wait must run before native screenshot capture");
  assert.match(commandBody, /ocr::native_capture_privacy_gate_message/);
});

test("native active-window typing fails closed during screen-share or capture-exclusion risk", async () => {
  const commandsRs = await readFile("src-tauri/src/commands.rs", "utf8");
  const commandStart = commandsRs.indexOf("pub fn type_text_into_active_window(");

  assert.notEqual(commandStart, -1, "active-window typing command must exist");

  const commandBody = commandsRs.slice(commandStart, commandsRs.indexOf("#[tauri::command]", commandStart + 1));
  const appHandleArg = commandBody.indexOf("app_handle: AppHandle");
  const protectionRefresh = commandBody.indexOf("let protection_status = overlay::protect_overlay_window(&app_handle, true)");
  const gateMessage = commandBody.indexOf("typing::native_typing_privacy_gate_message(");
  const detectShare = commandBody.indexOf(
    "crate::screen_share::detect_screen_share_status_for_native_privacy_shield()"
  );
  const captureExclusionDecision = commandBody.indexOf(
    "crate::screen_share::native_privacy_shield_decision_for_overlay_protection",
    gateMessage
  );
  const hideOverlay = commandBody.indexOf("overlay::set_overlay_window_visible(&app_handle, false, true)");
  const hideCompanions = commandBody.indexOf("overlay::set_companion_windows_visible(&app_handle, false, true)");
  const typeCall = commandBody.indexOf("typing::type_text_into_active_window(&text)");

  assert.notEqual(appHandleArg, -1, "typing command must receive AppHandle for native privacy controls");
  assert.notEqual(protectionRefresh, -1, "typing command must refresh capture exclusion before typing");
  assert.notEqual(gateMessage, -1, "typing command must consult the native privacy shield");
  assert.notEqual(detectShare, -1, "typing command must fail closed on fast native screen-share detector state");
  assert.notEqual(captureExclusionDecision, -1, "typing command must fail closed when capture exclusion is unsafe");
  assert.notEqual(hideOverlay, -1, "typing denial must hide overlay");
  assert.notEqual(hideCompanions, -1, "typing denial must hide companion windows");
  assert.notEqual(typeCall, -1, "typing command must still call the platform typing implementation after the gate");
  assert.ok(protectionRefresh < gateMessage, "capture protection must be refreshed before the typing gate");
  assert.ok(gateMessage < typeCall, "typing privacy gate must run before keyboard input is sent");
  assert.ok(detectShare < typeCall, "screen-share detection must run before keyboard input is sent");
  assert.ok(captureExclusionDecision < typeCall, "capture-exclusion decision must run before keyboard input is sent");
  assert.ok(hideOverlay < typeCall, "typing denial hide path must be before any keyboard input");
  assert.ok(hideCompanions < typeCall, "typing denial companion hide path must be before any keyboard input");
  assert.match(commandBody, /active_window_typing_blocked/);
});

test("native privacy commands do not expose a capture-exclusion off switch", async () => {
  const commandsRs = await readFile("src-tauri/src/commands.rs", "utf8");
  const overlayRs = await readFile("src-tauri/src/overlay/mod.rs", "utf8");

  assert.match(overlayRs, /pub fn enforce_capture_exclusion_setting/);

  for (const command of [
    "protect_overlay_window",
    "set_overlay_window_visible",
    "set_companion_windows_visible",
    "set_overlay_window_bounds"
  ]) {
    const commandStart = commandsRs.indexOf(`pub fn ${command}`);
    assert.notEqual(commandStart, -1, `${command} must exist`);
    const commandBody = commandsRs.slice(commandStart, commandsRs.indexOf("#[tauri::command]", commandStart + 1));

    assert.match(
      commandBody,
      /overlay::enforce_capture_exclusion_setting\(capture_exclusion_enabled\)/,
      `${command} must force capture exclusion before calling overlay APIs`
    );
    assert.doesNotMatch(
      commandBody,
      /capture_exclusion_enabled\.unwrap_or\(true\)/,
      `${command} must not honor false capture-exclusion requests`
    );
  }
});

test("overlay bounds updates preflight privacy before moving a visible window", async () => {
  const overlayRs = await readFile("src-tauri/src/overlay/mod.rs", "utf8");
  const commandStart = overlayRs.indexOf("pub fn set_overlay_window_bounds(");
  const commandEnd = overlayRs.indexOf("pub fn sanitize_overlay_bounds", commandStart);

  assert.notEqual(commandStart, -1, "overlay bounds command must exist");
  assert.notEqual(commandEnd, -1, "overlay bounds command body must be bounded by sanitize helper");

  const commandBody = overlayRs.slice(commandStart, commandEnd);
  const protectionRefresh = commandBody.indexOf("let protection_status = protect_overlay_window(app, capture_exclusion_enabled)");
  const gateCheck = commandBody.indexOf("bounds_update_privacy_gate_message(");
  const hideOverlay = commandBody.indexOf("window.hide()");
  const hideCompanions = commandBody.indexOf("set_companion_windows_visible(app, false, capture_exclusion_enabled)");
  const sanitizeBounds = commandBody.indexOf("let bounds = sanitize_overlay_bounds(bounds)");
  const setPosition = commandBody.indexOf("window.set_position");
  const setSize = commandBody.indexOf("window.set_size");

  assert.notEqual(protectionRefresh, -1, "bounds updates must refresh native protection first");
  assert.notEqual(gateCheck, -1, "bounds updates must check the native privacy gate");
  assert.notEqual(hideOverlay, -1, "bounds updates must hide overlay on privacy denial");
  assert.notEqual(hideCompanions, -1, "bounds updates must hide companion windows on privacy denial");
  assert.notEqual(setPosition, -1, "bounds updates must still be able to move safe overlays");
  assert.notEqual(setSize, -1, "bounds updates must still be able to resize safe overlays");
  assert.ok(protectionRefresh < gateCheck, "capture protection must be refreshed before the bounds gate");
  assert.ok(gateCheck < sanitizeBounds, "bounds must not be sanitized or applied until privacy is proven");
  assert.ok(gateCheck < setPosition, "bounds must not move the overlay before privacy is proven");
  assert.ok(gateCheck < setSize, "bounds must not resize the overlay before privacy is proven");
  assert.ok(hideOverlay < sanitizeBounds, "privacy denial must hide overlay before any bounds update path continues");
  assert.ok(hideCompanions < sanitizeBounds, "privacy denial must hide companions before any bounds update path continues");
  assert.match(overlayRs, /Overlay bounds update refused before capture exclusion was proven\./);
});

test("native overlay show rechecks privacy after the OS visibility transition", async () => {
  const overlayRs = normalizeLineEndings(await readFile("src-tauri/src/overlay/mod.rs", "utf8"));
  const commandStart = overlayRs.indexOf("pub fn set_overlay_window_visible(");
  const commandEnd = overlayRs.indexOf("pub fn native_show_privacy_gate_status", commandStart);

  assert.notEqual(commandStart, -1, "overlay visibility command must exist");
  assert.notEqual(commandEnd, -1, "overlay visibility command body must be bounded by show gate helper");

  const commandBody = overlayRs.slice(commandStart, commandEnd);
  const showCall = commandBody.indexOf("window.show()");
  const postShowRecheck = commandBody.indexOf("let post_show_status = protect_overlay_window(app, capture_exclusion_enabled)");
  const postShowScreenShareRecheck = commandBody.indexOf(
    "let post_show_screen_share_decision = crate::screen_share::native_privacy_shield_decision",
    postShowRecheck
  );
  const postShowGate = commandBody.indexOf(
    "post_show_privacy_recheck_message(\n            &post_show_status,\n            post_show_screen_share_decision,\n            OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,\n            OVERLAY_POST_SHOW_SHARE_RISK_MARKER"
  );
  const revertOverlay = commandBody.indexOf("window.hide()", postShowGate);
  const hideCompanions = commandBody.indexOf(
    "set_companion_windows_visible(app, false, capture_exclusion_enabled)",
    postShowGate
  );

  assert.notEqual(showCall, -1, "overlay visibility command must still call native show");
  assert.notEqual(postShowRecheck, -1, "overlay show must refresh native protection after show");
  assert.notEqual(postShowScreenShareRecheck, -1, "overlay show must recheck screen-share risk after show");
  assert.notEqual(postShowGate, -1, "overlay show must inspect the post-show protection and screen-share result");
  assert.notEqual(revertOverlay, -1, "unsafe post-show state must hide the overlay again");
  assert.notEqual(hideCompanions, -1, "unsafe post-show state must hide companion windows too");
  assert.ok(showCall < postShowRecheck, "post-show protection refresh must happen after native show");
  assert.ok(postShowRecheck < postShowScreenShareRecheck, "post-show screen-share recheck must happen after native show");
  assert.ok(postShowScreenShareRecheck < postShowGate, "post-show gate must use refreshed screen-share status");
  assert.ok(postShowGate < revertOverlay, "post-show denial must run before reverting overlay visibility");
  assert.ok(postShowGate < hideCompanions, "post-show denial must run before hiding companion windows");
  assert.match(
    overlayRs,
    /Overlay show was reverted because capture exclusion was not proven after visibility changed\./
  );
  assert.match(
    overlayRs,
    /Overlay show was reverted because screen-share risk was detected after visibility changed\./
  );
});

test("native companion show rechecks privacy after the OS visibility transition", async () => {
  const overlayRs = normalizeLineEndings(await readFile("src-tauri/src/overlay/mod.rs", "utf8"));
  const commandStart = overlayRs.indexOf("pub fn set_companion_windows_visible(");
  const commandEnd = overlayRs.indexOf("pub fn companion_visibility_success_status", commandStart);

  assert.notEqual(commandStart, -1, "companion visibility command must exist");
  assert.notEqual(commandEnd, -1, "companion visibility command body must be bounded by status helper");

  const commandBody = overlayRs.slice(commandStart, commandEnd);
  const showCall = commandBody.indexOf("window.show()");
  const postShowRecheck = commandBody.indexOf("let post_show_protection_results = companion_windows");
  const postShowScreenShareRecheck = commandBody.indexOf(
    "let post_show_screen_share_decision = crate::screen_share::native_privacy_shield_decision",
    postShowRecheck
  );
  const postShowGate = commandBody.indexOf(
    "post_show_privacy_recheck_message(\n            &post_show_status,\n            post_show_screen_share_decision,\n            COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER,\n            COMPANION_POST_SHOW_SHARE_RISK_MARKER"
  );
  const revertCompanions = commandBody.indexOf("window.hide()", postShowGate);

  assert.notEqual(showCall, -1, "companion visibility command must still call native show");
  assert.notEqual(postShowRecheck, -1, "companion show must refresh native protection after show");
  assert.notEqual(postShowScreenShareRecheck, -1, "companion show must recheck screen-share risk after show");
  assert.notEqual(postShowGate, -1, "companion show must inspect the post-show protection and screen-share result");
  assert.notEqual(revertCompanions, -1, "unsafe post-show state must hide companions again");
  assert.ok(showCall < postShowRecheck, "post-show protection refresh must happen after native show");
  assert.ok(postShowRecheck < postShowScreenShareRecheck, "post-show screen-share recheck must happen after native show");
  assert.ok(postShowScreenShareRecheck < postShowGate, "post-show gate must use refreshed companion screen-share status");
  assert.ok(postShowGate < revertCompanions, "post-show denial must run before reverting companions");
  assert.match(
    overlayRs,
    /Companion app window show was reverted because capture exclusion was not proven after visibility changed\./
  );
  assert.match(
    overlayRs,
    /Companion app window show was reverted because screen-share risk was detected after visibility changed\./
  );
});

test("default desktop capability denies raw window visibility bypasses", async () => {
  const capability = JSON.parse(await readFile("src-tauri/capabilities/default.json", "utf8"));
  const permissions = new Set(capability.permissions);

  for (const permission of [
    "core:window:deny-create",
    "core:window:deny-show",
    "core:window:deny-hide",
    "core:window:deny-set-content-protected",
    "core:window:deny-set-always-on-top",
    "core:window:deny-set-skip-taskbar",
    "core:webview:deny-create-webview",
    "core:webview:deny-create-webview-window",
    "core:webview:deny-webview-show",
    "core:webview:deny-webview-hide",
    "core:webview:deny-webview-close",
    "core:webview:deny-reparent"
  ]) {
    assert.ok(permissions.has(permission), `${permission} must be denied so webview code cannot bypass native privacy gates`);
  }
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

test("signed release workflow uploads privacy shield attestations from every target", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  for (const target of ["windows-x64", "macos-x64", "macos-arm64", "linux-x64"]) {
    assert.match(
      workflow,
      new RegExp(`verify-privacy-shield-package\\.mjs --target ${target} --write-attestation`),
      `${target} signed release must verify packaged privacy shield markers`
    );
    assert.match(
      workflow,
      new RegExp(`privacy-shield-${target}\\.json`),
      `${target} signed release must upload privacy shield attestation`
    );
  }

  assert.match(workflow, /release-assets\/\*\*\/privacy-shield-\*\.json/);
  assert.ok(
    workflow.indexOf("Verify bundled Whisper sidecar") < workflow.indexOf("Verify packaged privacy shield"),
    "privacy shield verification should run after the sidecar verification"
  );
  assert.ok(
    workflow.indexOf("Verify packaged privacy shield") < workflow.indexOf("Upload Windows build artifact"),
    "privacy shield attestation must exist before release artifacts are uploaded"
  );
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
  assert.match(packageJson.scripts["test:release"], /dispatch-signed-release\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /notarize-macos-dmg\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /obs-stealth-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /audio-environment-smoke\.test\.mjs/);
  assert.match(packageJson.scripts["test:release"], /commercial-readiness\.test\.mjs/);
  assert.equal(packageJson.scripts["sidecars:prepare"], "node scripts/prepare-whisper-sidecars.mjs --target current --output-config src-tauri/target/tauri.sidecars.generated.conf.json");
  assert.equal(packageJson.scripts["sidecars:check"], "node scripts/prepare-whisper-sidecars.mjs --target current --check");
  assert.equal(packageJson.scripts["package:verify-sidecar"], "node scripts/verify-bundled-sidecar.mjs --target current");
  assert.equal(packageJson.scripts["package:verify-privacy-shield"], "node scripts/verify-privacy-shield-package.mjs --target current");
  assert.equal(packageJson.scripts["ai:smoke"], "node scripts/ollama-smoke.mjs");
  assert.equal(packageJson.scripts["ai:smoke:openrouter"], "node scripts/openrouter-smoke.mjs");
  assert.equal(packageJson.scripts["obs:smoke"], "node scripts/obs-stealth-smoke.mjs");
  assert.equal(packageJson.scripts["audio:smoke"], "node scripts/audio-environment-smoke.mjs");
  assert.equal(packageJson.scripts["commercial:check"], "node scripts/commercial-readiness.mjs");
  assert.equal(packageJson.scripts["commercial:secrets"], "node scripts/configure-commercial-secrets.mjs");
  assert.equal(packageJson.scripts["release:dispatch"], "node scripts/dispatch-signed-release.mjs");
});

test("package scripts expose repeatable macOS and Windows installer builds", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const readme = await readFile("README.md", "utf8");
  const workflow = await readFile(desktopSmokeWorkflowPath, "utf8");

  assert.equal(
    packageJson.scripts["tauri:build:mac"],
    "npm run sidecars:prepare && tauri build --ci --bundles app --config src-tauri/target/tauri.sidecars.generated.conf.json && node scripts/create-macos-dmg.mjs && npm run package:verify-sidecar && npm run package:verify-privacy-shield"
  );
  assert.equal(
    packageJson.scripts["tauri:build:windows"],
    "npm run sidecars:prepare && tauri build --ci --bundles nsis,msi --config src-tauri/target/tauri.sidecars.generated.conf.json && npm run package:verify-sidecar && npm run package:verify-privacy-shield"
  );
  assert.equal(
    packageJson.scripts["tauri:build:linux"],
    "npm run sidecars:prepare && tauri build --ci --bundles appimage,deb --config src-tauri/target/tauri.sidecars.generated.conf.json && npm run package:verify-sidecar && npm run package:verify-privacy-shield"
  );
  assert.match(readme, /npm run tauri:build:mac/);
  assert.match(readme, /npm run tauri:build:windows/);
  assert.match(readme, /npm run tauri:build:linux/);
  assert.match(readme, /npm run sidecars:prepare/);
  assert.match(readme, /npm run release:dispatch -- --tag v0\.1\.1/);
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

test("desktop package smoke uploads privacy shield attestations from every target", async () => {
  const workflow = await readFile(desktopSmokeWorkflowPath, "utf8");
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(packageJson.scripts["test:release"], /verify-privacy-shield-package\.test\.mjs/);
  assert.match(packageJson.scripts["package:verify-privacy-shield"], /verify-privacy-shield-package\.mjs/);

  for (const target of ["windows-x64", "macos-x64", "macos-arm64", "linux-x64"]) {
    assert.match(
      workflow,
      new RegExp(`verify-privacy-shield-package\\.mjs --target ${target} --write-attestation`),
      `${target} package smoke must verify native privacy shield markers`
    );
    assert.match(
      workflow,
      new RegExp(`privacy-shield-${target}\\.json`),
      `${target} package smoke must upload privacy shield attestation`
    );
  }
});
