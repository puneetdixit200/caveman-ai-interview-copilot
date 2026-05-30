# Next Agent Handoff

## Current goal

Make Caveman harder to expose during Google Meet, Microsoft Teams, and screen-share workflows using supported OS-level protections. Do not implement kernel extensions, rootkits, deceptive universal hiding, or anything that bypasses OS/user security boundaries.

## Current repo state

- Branch: `main`
- Remote: `origin/main`
- Latest implementation state: see `git log -1 --oneline` after pulling `origin/main`.
- This handoff file is being kept current as the screen-share hardening work continues.
- Previous relevant commits:
  - `c7569f5 ci: verify macos privacy shield on push`
  - `bdce589 fix: check windows processes before tasklist`
  - `a1b2e9c fix: check windows visible titles before tasklist`
  - `6b88fb1 fix: fail closed on unreadable windows browser titles`
  - `21b87e9 fix: scan windows visible share titles`
  - `3d58c23 fix: scan macos browser share titles faster`
  - `dd69b09 docs: refresh privacy handoff`
  - `509efc2 test: give macos meeting smoke room to settle`
  - `a8cd8f9 test: sync app frame host marker anchor`
  - `1512358 test: require windows app frame host marker`
  - `99d33cc test: let meeting smoke clear naturally`
  - `3c8f89b test: allow slower macos meeting restore`
  - `1a5b4bf test: run meeting risk smoke from dmg`
  - `9567b34 test: verify privacy shield installers`
  - `766e838 docs: add next agent handoff`
  - `85fb051 test: add macos meeting risk smoke`
  - `e535679 fix: fail closed on redacted macos browser titles`
  - `94ab73e fix: defer dashboard audio device enumeration`

## What was implemented

- macOS runtime now fails closed when visible browser window titles are redacted or ambiguous during share-risk checks.
- Startup, reopen, OCR, active-window typing, and window-show paths route through stronger visibility/share-risk gating.
- Added repeatable macOS meeting-risk smoke coverage:
  - `scripts/macos-meeting-risk-smoke.mjs`
  - `scripts/macos-meeting-risk-smoke.test.mjs`
  - package script: `npm run meeting-risk:smoke:mac`
- The smoke test simulates:
  - Google Meet in a browser window
  - Microsoft Teams in a browser window
  - Microsoft Teams native process window
- It verifies Caveman starts protected, hides while simulated meeting/share-risk windows are visible, then restores as a protected onscreen window after risk clears.
- The package smoke workflow now runs both macOS DMG privacy-shield verifier lanes on every push to `main`, not only on manual workflow dispatch, so normal pushes exercise EXE and DMG privacy shield packaging.
- The macOS meeting-risk smoke can launch a specific `Caveman.app` path. Package smoke mounts the generated DMG and verifies the app inside the mounted installer is protected and hidden during simulated Google Meet/Teams windows; the installed-app smoke still verifies hide and restore.
- The package privacy-shield attestation now also requires the Windows `applicationframehost.exe` marker, matching the runtime detector path for Store/WebView-hosted Google Meet and Teams windows.
- The packaged DMG meeting-risk smoke keeps simulated browser meeting windows alive longer and gives macOS title-scan detection more time on slower Intel runners, while still requiring Caveman to hide during Google Meet and Teams risk.
- macOS now has a separate fast CoreGraphics title-risk latch that scans visible browser titles every 250ms, so already-visible Caveman windows hide faster when Google Meet, Teams, or browser sharing UI appears. The slower System Events title scan remains bounded and off the 50ms direct-capture poll.
- Windows now has a supported `EnumWindows` visible-title scan layered on top of `tasklist /V`, so the shipped EXE can detect browser/PWA Google Meet, Teams, and sharing titles even when process-list window-title rows are incomplete.
- Windows visible browser/PWA windows now fail closed when the native title cannot be read, matching the existing macOS redacted-title behavior for supported OS-level detection.
- Windows native privacy polling now checks visible browser/PWA titles with `EnumWindows` before falling back to slower `tasklist`, so already-visible Meet/Teams/share UI can hide Caveman sooner.
- Windows screen-share detection now uses supported ToolHelp process enumeration before `tasklist`, so known meeting, recorder, and remote-support processes can trigger hide without waiting for shell process listing.
- Release-contract tests normalize Windows CRLF checkouts before asserting detector ordering, including the native shield contract test that checks ToolHelp before `tasklist`.
- The detector catalog was expanded for more supported "all screen share" coverage: additional web meeting/capture origins, desktop meeting apps, screen recorders, and remote-support clients are now anchored in source and package privacy-shield attestations.
- The package smoke workflow now runs `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` in every Windows, macOS, and Linux package lane before packaging contract checks, so EXE/DMG package smoke also compiles and exercises the native detector unit tests.
- macOS package-smoke artifacts upload the generated DMG and privacy-shield attestation instead of the raw `.app` directory; the DMG smoke still mounts and verifies the app inside the installer before upload.
- Signed release publishing now mirrors the package-smoke privacy gates: every Windows, macOS, and Linux signed-release lane runs native screen-share detector tests and release contracts before building, and both signed macOS DMG lanes run packaged meeting-risk smoke before uploading release artifacts.
- Companion-window restore and focus-repair paths now re-enter the native show privacy gate before raising the dashboard after a clear check, share-risk clear, reopen, or bounds repair. This keeps repair logic from bypassing the same capture-exclusion and screen-share checks used by manual overlay show.
- Companion-window restore now also pauses briefly after any native privacy denial or share-risk hide, so the fast repair loop cannot immediately re-show the dashboard between macOS title-scan detections.
- Companion-window focus repair now performs a second privacy recheck after native `unminimize`/`show`/`set_focus`, then hides the overlay and companion windows again if a Meet/Teams/share-risk window appears during that focus transition.
- The macOS visible-window title guard now treats strong meeting/share titles from any foreground app as screen-share risk, not only from browser/PWA host processes. This covers native-style Teams windows that surface a title like `Microsoft Teams - Interview` through CoreGraphics while still ignoring ordinary note titles like `Google Meet prep notes`.
- Windows package and signed-release lanes now run a packaged EXE meeting-risk smoke before artifact upload. The smoke launches `src-tauri/target/release/caveman.exe` in CI, verifies the visible Caveman window has `WDA_EXCLUDEFROMCAPTURE` or `WDA_MONITOR`, then requires it to hide while simulated Google Meet, browser share, and Microsoft Teams windows are visible.

## Verification already run locally

- `node --test scripts/macos-meeting-risk-smoke.test.mjs`
- `npm run meeting-risk:smoke:mac`
- `npm run test:release`
- `node --test scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs`
- Manual full Desktop Package Smoke run `26680849312` passed all lanes, including:
  - Windows MSI/NSIS package privacy shield verification
  - macOS Intel app/DMG package privacy shield verification
  - macOS Apple Silicon app/DMG package privacy shield verification
  - Linux package privacy shield verification
- Push Desktop Package Smoke run `26687955041` for `5483c78` passed all lanes:
  - Windows installers built, passed bundled sidecar verification, packaged privacy shield verification, and artifact upload.
  - macOS Intel app/DMG built, passed bundled sidecar verification, packaged privacy shield verification, packaged meeting-risk smoke, and artifact upload.
  - macOS Apple Silicon app/DMG built, passed bundled sidecar verification, packaged privacy shield verification, packaged meeting-risk smoke, and artifact upload.
  - Linux AppImage/DEB built, passed bundled sidecar verification, packaged privacy shield verification, and artifact upload.

Local meeting-risk smoke result:

```text
READY
- Initial Caveman window 12215 is 1249x820 and protected.
- Google Meet browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams native process: Caveman hid while the simulated meeting window was visible.
- Caveman restored protected onscreen window 12215 at 1249x820.
```

`npm run test:release` passed 144 tests after the Intel DMG timing fix. `npm run meeting-risk:smoke:mac` also passed earlier after restarting the local app from clean saved state.

Follow-up CI hardening verification:

- `node --test scripts/release-workflow.test.mjs` passed 39 tests after adding the package-lane native detector test assertion.
- `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 59 tests locally without opening the app.
- `npm run test:release` passed 145 tests after adding the workflow hardening contract.
- `fa32b93` package smoke was canceled after the added cross-platform native test exposed unguarded macOS-only marker expectations on Windows/Linux and a macOS artifact upload stalled; `50a2cf9` added target guards and the next workflow change removes raw `.app` directory uploads from package-smoke artifacts.
- Push Desktop Package Smoke run `26689263325` for `3c1245b` passed all lanes after the final workflow fix:
  - Windows installers: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - macOS Apple Silicon app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - Linux AppImage/DEB: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
- Signed-release privacy gate follow-up verification:
  - `node --test scripts/release-workflow.test.mjs` passed 40 tests after adding native detector tests and signed macOS DMG meeting-risk smoke gates to `.github/workflows/release.yml`.
  - `npm run test:release` passed 146 tests with the signed-release privacy gates.
- Push Desktop Package Smoke run `26689860308` for `fd56ed8` passed all lanes after the signed-release privacy gate hardening:
  - Windows installers: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - macOS Apple Silicon app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - Linux AppImage/DEB: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
- Companion restore privacy-gate follow-up verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 31 tests after routing restore/focus repair through the native show privacy gate.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 59 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs` passed 22 tests and requires the restore/focus privacy-gate markers in packaged binaries.
  - `node --test scripts/release-workflow.test.mjs` passed 40 tests.
  - `npm run test:release` passed 147 tests.
- Push Desktop Package Smoke run `26690740593` for `0dfa413` exposed a macOS Intel DMG meeting-risk failure: the Google Meet browser simulation stayed visible while Teams browser/native hid. The follow-up fix adds a native restore pause after privacy denial/share-risk hide.
- Restore-pause follow-up local verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 31 tests.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 59 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs scripts/release-workflow.test.mjs` passed 62 tests.
  - `npm run test:release` passed 147 tests.
- Push Desktop Package Smoke run `26691306277` for `578be59` passed all lanes after the restore-pause fix:
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - macOS Apple Silicon app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - Windows installers: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
  - Linux AppImage/DEB: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
- Focus-repair post-show recheck local verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 33 tests after adding the post-focus privacy recheck.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 59 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs scripts/release-workflow.test.mjs` passed 63 tests and requires the post-focus privacy marker in packaged binaries.
  - `npm run test:release` passed 148 tests.
- Push Desktop Package Smoke run `26691975166` for `ee8a965` failed only the macOS Intel DMG meeting-risk smoke:
  - Google Meet browser window: hid.
  - Microsoft Teams browser window: hid.
  - Microsoft Teams native process: stayed visible.
  - Windows, Linux, and macOS Apple Silicon package lanes passed, including package privacy-shield verification and Apple Silicon packaged meeting-risk smoke.
- Native Teams title fallback follow-up local verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 60 tests after adding the strong-title-any-app fallback.
  - `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 33 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs scripts/release-workflow.test.mjs` passed 63 tests and requires the strong-title marker in packaged binaries.
  - `npm run test:release` passed 148 tests.
- Push Desktop Package Smoke run `26692539422` for `7b3bd8b` passed all lanes after the strong-title fallback:
  - Windows installers: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - macOS Apple Silicon app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - Linux AppImage/DEB: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload passed.
- Windows EXE meeting-risk smoke follow-up local verification:
  - `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/release-workflow.test.mjs` passed locally without opening the app.
  - The actual Windows runtime smoke is wired into CI and must pass on Windows package/signed-release runners before EXE/MSI artifacts upload.

## CI to check next

List recent runs with:

```sh
gh run list --repo puneetdixit200/caveman-ai-interview-copilot --branch main --limit 5 --json databaseId,workflowName,headSha,status,conclusion,createdAt,url
```

Latest verified package-smoke run before this handoff refresh: `26692539422` for `7b3bd8b`, green in all lanes. This run verified the focus-repair post-show recheck and strong native Teams title fallback, including the macOS Intel DMG meeting-risk smoke.

## Suggested next steps

1. Recheck the worktree with `git status --short --branch`.
2. If code changes resume, verify the next pushed Desktop Package Smoke run includes and passes `Run native privacy shield tests` in all four package lanes and both macOS DMG `Run packaged meeting-risk smoke` steps.
3. Only verify the installed app window is visible, non-zero-sized, and protected with CoreGraphics/window inspection when the user allows opening the app.
4. If the app is collapsed to `0x0`, restart it after clearing saved state:

```sh
pkill -x caveman >/dev/null 2>&1 || true
sleep 1
rm -rf "$HOME/Library/Saved Application State/com.caveman.desktop.savedState"
open -b com.caveman.desktop
sleep 5
```

5. Continue strengthening only supported protections: content protection, fail-closed share-risk detection, deterministic hide/restore behavior, and package/runtime verification. Do not add kernel extensions, drivers, rootkits, or universal bypass behavior.

## Local cleanup note

The user asked to clear offline/local rebuildable artifacts after pushing this handoff. Preserve the Git repo, source files, and pushed work unless the user explicitly asks to remove the local checkout.
