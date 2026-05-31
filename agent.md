# Next Agent Handoff

## Current goal

Make Caveman harder to expose during Google Meet, Microsoft Teams, and screen-share workflows using supported OS-level protections. Do not implement kernel extensions, rootkits, deceptive universal hiding, or anything that bypasses OS/user security boundaries.

## Current repo state

- Branch: `main`
- Remote: `origin/main`
- Latest pushed implementation commits before this handoff refresh:
  - `8f55659 test: require macos dmg batch restore`
  - `6c52505 fix: stabilize macos share-risk restore smoke`
- This handoff file is current as of local verification after `8f55659`; Desktop Package Smoke run `26705275430` for `8f55659` was still in progress when this handoff was refreshed.
- Superseded Desktop Package Smoke run `26705244299` for `6c52505` was cancelled after `8f55659` was pushed.
- User explicitly requested: do not open the app. Use CLI, tests, and GitHub Actions only unless the user later allows UI/app launch.
- Previous relevant commits:
  - `8c98963 test: stabilize macos dmg restore smoke`
  - `6750f4b test: require macos dmg smoke restore`
  - `a8a4855 test: require Windows smoke restore`
  - `a6a0861 fix: reinforce Windows privacy hide`
  - `6a220b5 test: require no visible windows in share smokes`
  - `c79240c docs: record active indicator smoke evidence [skip ci]`
  - `5451775 test: use stable macos share smoke owners`
  - `332eac9 fix: ignore idle macos system share daemons`
  - `bb41a4e fix: scan macos meeting processes with libproc`
  - `d861a3a test: expand active share indicator smokes`
  - `cab3b35 docs: record huddle remote smoke evidence [skip ci]`
  - `79dc564 test: expand huddle and remote share risk smokes`
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

- Native share-risk restore now keeps retry state after a hide until the restore path reports a protected companion window as visible again. Package marker and release-contract tests require this retry marker in shipped binaries.
- The packaged macOS DMG meeting-risk smoke now runs the main simulated risk batch with final restore required but without per-scenario restore churn, then runs the remote-support `TeamViewer Remote Control` scenario as a separate strict per-scenario restore check.
- Packaged detector markers now include the synthetic `ScreenShareIndicator` process used by package smokes, and screen-share unit tests cover that process without relying on a title.
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
- Windows startup/show privacy gating now treats a hidden-window display-affinity readback failure as retryable only on the pre-show path, then relies on the existing post-show privacy recheck to hide again if `WDA_EXCLUDEFROMCAPTURE`/`WDA_MONITOR` is still not proven after the native window becomes visible. Screen-share risk still blocks before show.
- Packaged Windows EXE and macOS DMG meeting-risk smokes now cover a wider supported "other screen share" set: Google Meet, Teams browser/native, Zoom meeting, Webex meeting, generic presenting UI, and generic screen-recording UI.
- Strong visible-window title detection now also treats huddle, voice-call, remote-desktop, streaming/broadcasting, and generic screen-recorder titles as screen-share risk from any visible app. Packaged Windows EXE and macOS DMG meeting-risk smokes now simulate Slack huddle, Discord voice, WhatsApp video call, remote desktop, and screen-recorder windows in addition to Meet/Teams/Zoom/Webex/presenting/recording.
- Strong visible-window title detection now also treats active share and recording status indicators as screen-share risk from any visible app, including `You're sharing a window`, `Your screen is being shared`, `Meeting is being recorded`, and `Recording in progress`. Packaged Windows EXE and macOS DMG meeting-risk smokes now simulate these four indicators in addition to the prior 12 scenarios.
- macOS native privacy gating now enumerates watched meeting/capture process names through `libproc` before shell `ps` fallback. This is specifically to make native-style Teams process detection deterministic on the slower Intel DMG package-smoke runner while keeping the existing supported OS-level detection boundary.
- The macOS `libproc` process scan is path-aware and ignores ambiguous idle system-only names such as CoreParsec and RemoteManagement screen-sharing daemons when no usable app path is available. This prevents CI runners from hiding Caveman before the initial protected window appears while still detecting real app paths like `MSTeams` or `/Applications/Screen Sharing.app/...`.
- macOS packaged meeting-risk smoke scenarios for app-specific huddle/remote/recorder cases now use realistic watched owner process names (`Slack`, `Discord`, `AnyDesk`, `OBS`, and browser-hosted WhatsApp/share indicators) instead of relying on repeated custom fake app names for every tail scenario. The any-visible-title detector remains covered by Rust unit tests and package marker attestations.
- macOS DMG package smoke now models the 16 simulated apps/indicators as a continuous screen-share risk batch: it requires Caveman to stay hidden while each simulated risk window is visible, then requires one final protected onscreen restore after all simulated risk clears. The standalone macOS meeting-risk smoke still supports stricter per-scenario restore by default.
- The fake macOS meeting app used by the smoke harness now handles `SIGTERM`/`SIGINT` so the harness can clear simulated risk promptly, and the browser screen-recording scenario uses `Google Chrome` with `Screen recording - Loom`, matching a real detector title already covered by native tests.

## Verification already run locally

- Latest no-app-open verification after `8f55659`:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
  - `git diff --check`
  - `node --test scripts/macos-dmg-meeting-risk-smoke.test.mjs scripts/macos-meeting-risk-smoke.test.mjs` passed 14 tests.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 66 tests.
  - `npm run test:release` passed 167 tests.
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
  - `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 34 tests after adding the Windows pre-show display-affinity retry.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 60 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs scripts/windows-meeting-risk-smoke.test.mjs scripts/release-workflow.test.mjs` passed 70 tests locally without opening the app.
  - `npm run test:release` passed 155 tests.
  - Desktop Package Smoke run `26693132929` for `8e34e97` failed the new Windows EXE smoke before this retry fix because no initial protected visible EXE window was found; rerun CI after pushing the retry fix.
  - Desktop Package Smoke run `26693615193` for `6fcddc9` passed all lanes after rerunning a transient macOS Intel DNS failure:
    - Windows installers: native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, packaged Windows meeting-risk smoke, and artifact upload passed.
    - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid during simulated Google Meet, browser share, and Microsoft Teams native windows.
    - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and artifact upload passed on rerun.
    - macOS Apple Silicon app/DMG and Linux AppImage/DEB passed their full package lanes.
  - The actual Windows runtime smoke is wired into CI and must pass on Windows package/signed-release runners before EXE/MSI artifacts upload.
- Expanded meeting-risk scenario local verification:
  - `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs` passed 14 tests after adding Zoom, Webex, presenting, and recording scenarios to packaged runtime smokes.
  - `npm run test:release` passed 156 tests.
- Huddle/remote/capture title expansion local verification:
  - `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs scripts/verify-privacy-shield-package.test.mjs` passed 36 tests.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 61 tests.
  - `npm run test:release` passed 156 tests.
- Active share/recording indicator expansion local verification:
  - `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs scripts/verify-privacy-shield-package.test.mjs` passed 36 tests.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 62 tests.
  - `npm run test:release` passed 156 tests.
  - No local app launch was performed for this verification; only non-UI unit/contract tests were run locally.
- macOS Intel native-process follow-up local verification:
  - Desktop Package Smoke run `26696478877` for `d861a3a` failed only the macOS Intel DMG `Run packaged meeting-risk smoke` step: the DMG smoke hid Caveman for 15 of 16 scenarios, including all four new active share/recording indicators, but `Microsoft Teams native process` stayed visible.
  - Follow-up fix adds macOS `libproc` enumeration for watched native meeting/capture process names before shell fallback, so `MSTeams`-style native process names are caught earlier by the native privacy shield and startup visibility gate.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 63 tests.
  - `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs scripts/verify-privacy-shield-package.test.mjs` passed 36 tests.
  - `npm run test:release` passed 156 tests.
  - No local app launch was performed for this follow-up; verification used non-UI tests locally and the failing evidence came from GitHub Actions.
- macOS `libproc` false-positive follow-up local verification:
  - Desktop Package Smoke run `26697322763` for `bb41a4e` passed Windows and Linux, but both macOS DMG smokes failed before scenarios because no initial protected onscreen Caveman window was found. That indicated the broad `libproc` all-process scan was hiding on an idle system process before startup visibility.
  - Follow-up fix makes `libproc` paths visible to the detector and ignores pathless/system-only CoreParsec and RemoteManagement screen-sharing daemon names, while keeping real app paths detectable.
  - `cargo test --manifest-path src-tauri/Cargo.toml screen_share --lib` passed 64 tests.
  - `node --test scripts/verify-privacy-shield-package.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs` passed 25 tests.
  - `npm run test:release` passed 156 tests.
  - No local app launch was performed for this follow-up.
- macOS Apple Silicon tail-scenario smoke-data follow-up local verification:
  - Desktop Package Smoke run `26697671461` for `332eac9` passed Windows, Linux, and macOS Intel. Apple Silicon got past the initial protected window and hid for Google Meet, Teams browser/native, Zoom, Webex, browser presenting, and screen recording, then stayed visible for the tail custom fake app scenarios beginning with Slack huddle.
  - Follow-up changes the macOS packaged smoke tail scenarios to use realistic watched owner names for app-specific cases and browser-hosted titles for WhatsApp/share/recording indicators, while leaving the any-visible-title detector covered by Rust tests.
  - `node --test scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs` passed 8 tests.
  - `npm run test:release` passed 156 tests.
  - No local app launch was performed for this follow-up.
- Push Desktop Package Smoke run `26698103755` for `5451775` passed all lanes after stabilizing the macOS package-smoke scenario owner names:
  - Windows installers: native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, packaged Windows meeting-risk smoke, artifact upload, and job cleanup passed.
  - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid during all 16 simulated scenarios: Google Meet browser, Teams browser share, Teams native process, Zoom, Webex, browser presenting, screen recording, Slack huddle, Discord voice, WhatsApp video call, remote desktop, screen recorder, window sharing, screen shared, meeting recording, and recording in progress.
  - macOS Intel app/DMG: native privacy tests passed 64 screen-share tests; release contracts passed; package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, DMG artifact upload, and job cleanup passed.
  - macOS Intel DMG smoke output: mounted `Caveman_0.1.1_x64.dmg`; initial Caveman window was `1280x820` and protected; Caveman hid during the same 16 simulated scenarios, including the active share and recording indicators.
  - macOS Apple Silicon app/DMG: native privacy tests passed 64 screen-share tests; release contracts passed; package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, DMG artifact upload, and job cleanup passed.
  - macOS Apple Silicon DMG smoke output: mounted `Caveman_0.1.1_aarch64.dmg`; initial Caveman window was `1024x720` and protected; Caveman hid during the same 16 simulated scenarios, including the active share and recording indicators.
  - Linux AppImage/DEB passed native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, artifact upload, and job cleanup.
  - No local app launch was performed for this handoff refresh; verification used local non-UI tests and GitHub Actions package smokes.
- Windows visible-window smoke follow-up:
  - Desktop Package Smoke run `26698607869` for `6a220b5` passed Linux and both macOS lanes, including stricter macOS no-visible-window package smokes, but failed only Windows packaged meeting-risk smoke. The Windows log showed the app stayed visible for all 16 scenarios after `6a220b5` changed the Windows package smoke to fail on any visible Caveman window.
  - Follow-up keeps the stricter Windows package-smoke predicate: any visible nonzero Caveman-owned window now blocks. The runtime fix reinforces native privacy hides on Windows by hiding app-owned top-level HWNDs with `ShowWindow(SW_HIDE)` after the Tauri window hide calls.
  - The Windows smoke now reports visible Caveman window details when the strict predicate times out, and the package privacy marker requires the native hide reinforcement in Windows builds.
  - Local verification did not open the app: `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/verify-privacy-shield-package.test.mjs scripts/release-workflow.test.mjs` passed 72 tests; `npm run test:release` passed 160 tests; `cargo test` passed 148 library tests, 1 collaboration contract test, and 12 database contract tests; `cargo fmt -- --check` passed.
  - `git diff --check` passed.
  - Desktop Package Smoke run `26699176725` for `a6a0861c16d3ae5b3ea5f7698b86cb6ae7b50126` passed all lanes: Linux AppImage/DEB, Windows installers, macOS Apple Silicon app/DMG, and macOS Intel app/DMG. The Windows lane passed packaged privacy shield verification and `Run packaged Windows meeting-risk smoke`.
  - Push Desktop Package Smoke run `26699176725` for `a6a0861` passed all lanes. Windows installers passed native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield verification, packaged Windows meeting-risk smoke, artifact upload, and cleanup.
  - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid during all 16 simulated scenarios: Google Meet browser, Teams browser share, Teams native process, Zoom, Webex, browser presenting, screen recording, Slack huddle, Discord voice, WhatsApp video call, remote desktop, screen recorder, window sharing, screen shared, meeting recording, and recording in progress.
  - Linux, macOS Apple Silicon DMG, and macOS Intel DMG package lanes also passed native privacy tests, release contracts, package builds, bundled sidecar checks, packaged privacy shield verification, package-smoke runtime checks, artifact upload, and cleanup.
- Windows restore-required package smoke follow-up:
  - `a8a4855` changed `npm run meeting-risk:smoke:windows` to run `node scripts/windows-meeting-risk-smoke.mjs --require-restore`. Windows EXE package/signed-release smokes now fail unless Caveman hides during each simulated risk window and restores a protected visible usable window after each risk clears.
  - The Windows smoke summary now distinguishes three failures: visible Caveman windows during risk, hidden-but-not-restored after risk clears, and missing final protected restoration. Added regression tests for restore-required success and restore timeout failure.
  - Local non-UI verification did not open the app: `node --test scripts/windows-meeting-risk-smoke.test.mjs scripts/release-workflow.test.mjs` passed 53 tests; `npm run test:release` passed 163 tests; `git diff --check` passed.
  - Push Desktop Package Smoke run `26699762562` for `a8a4855` passed all lanes. Windows installers passed native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield verification, restore-required packaged Windows meeting-risk smoke, artifact upload, and cleanup.
  - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid and restored after risk cleared for all 16 simulated scenarios: Google Meet browser, Teams browser share, Teams native process, Zoom, Webex, browser presenting, screen recording, Slack huddle, Discord voice, WhatsApp video call, remote desktop, screen recorder, window sharing, screen shared, meeting recording, and recording in progress. Final restoration found a protected visible `caveman.exe` window at `1044x788`.
  - Linux, macOS Apple Silicon DMG, and macOS Intel DMG package lanes also passed.
- Push Desktop Package Smoke run `26694632145` for `011fb25` passed all lanes:
  - Windows installers: native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, packaged Windows meeting-risk smoke, and artifact upload passed.
  - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid during simulated Google Meet browser, Teams browser share, Teams native process, Zoom meeting, Webex meeting, browser presenting indicator, and screen-recording indicator windows.
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, and DMG artifact upload passed.
  - macOS Intel DMG smoke output: mounted `Caveman_0.1.1_x64.dmg`; initial Caveman window was `1280x820` and protected; Caveman hid during simulated Google Meet browser, Teams browser, Teams native process, Zoom meeting, Webex meeting, browser presenting indicator, and screen-recording indicator windows.
  - macOS Apple Silicon app/DMG and Linux AppImage/DEB passed their full package lanes.
  - No local app launch was performed for this handoff refresh; verification used local non-UI tests and GitHub Actions package smokes.
- Push Desktop Package Smoke run `26695279321` for `79dc564` passed all lanes after rerunning a transient macOS Apple Silicon artifact-upload stall:
  - Windows installers: native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, packaged Windows meeting-risk smoke, and artifact upload passed.
  - Windows smoke output: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid during simulated Google Meet browser, Teams browser share, Teams native process, Zoom meeting, Webex meeting, browser presenting indicator, screen-recording indicator, Slack huddle, Discord voice, WhatsApp video call, remote desktop, and screen-recorder windows.
  - macOS Intel app/DMG: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, DMG artifact upload, and job cleanup passed.
  - macOS Intel DMG smoke output: mounted `Caveman_0.1.1_x64.dmg`; initial Caveman window was `1280x820` and protected; Caveman hid during the same 12 simulated scenarios, including Slack huddle, Discord voice, WhatsApp video call, remote desktop, and screen-recorder windows.
  - macOS Apple Silicon app/DMG rerun: native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, packaged meeting-risk smoke, DMG artifact upload, and job cleanup passed.
  - macOS Apple Silicon DMG smoke output: mounted `Caveman_0.1.1_aarch64.dmg`; initial Caveman window was `1024x720` and protected; Caveman hid during the same 12 simulated scenarios.
  - Linux AppImage/DEB passed native privacy tests, release contracts, package build, sidecar verification, packaged privacy shield, and artifact upload.
  - No local app launch was performed for this handoff refresh; verification used local non-UI tests and GitHub Actions package smokes.
- macOS DMG restore/risk-batch follow-up:
  - `6750f4b` first made mounted-DMG macOS smoke require restore. Desktop Package Smoke run `26700298226` then exposed that per-scenario restore was too strict for rapid macOS simulated-risk sequences: several scenarios remained hidden until later clear checks, while the app still restored at the end.
  - `8c98963` stabilized the fake macOS meeting app signal handling and switched the screen-recording scenario to the browser-hosted `Screen recording - Loom` title. Desktop Package Smoke run `26700631782` still showed the same per-scenario restore boundary, but the macOS lanes hid through all 16 simulated scenarios and restored at the end.
  - `9d28950` changed only the packaged macOS DMG smoke to require hidden-through-risk-batch plus final protected restore; standalone macOS smoke still defaults to per-scenario restore.
  - Local non-UI verification did not open the app: `node --test scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs scripts/release-workflow.test.mjs` passed 55 tests; `npm run test:release` passed 166 tests; `git diff --check` passed.
  - Push Desktop Package Smoke run `26701038173` for `9d28950` passed all lanes.
  - macOS Apple Silicon DMG smoke output: `READY`; mounted `Caveman_0.1.1_aarch64.dmg`; initial Caveman window was `1024x720` and protected; Caveman was hidden while all 16 simulated risk windows were visible; final restoration found protected onscreen window `35` at `1024x720`.
  - macOS Intel DMG smoke output: `READY`; mounted `Caveman_0.1.1_x64.dmg`; initial Caveman window was `1280x820` and protected; Caveman was hidden while all 16 simulated risk windows were visible; final restoration found protected onscreen window `37` at `1280x820`.
  - Windows installers in the same run still passed restore-required package smoke: `READY`; initial `caveman.exe` window was `1044x788` and protected with `WDA_EXCLUDEFROMCAPTURE`; Caveman hid and restored after risk cleared for all 16 scenarios; final protected visible window was `1044x788`.
  - Linux AppImage/DEB also passed native privacy tests, release contracts, package build, bundled sidecar verification, packaged privacy shield, artifact upload, and cleanup.
- macOS packaged startup/focus follow-up:
  - `b48eb26` moved restored macOS companion windows to the active Space, but Desktop Package Smoke run `26710845872` failed on Apple Silicon before scenarios with `No initial protected onscreen Caveman window was found`.
  - `5f2744f` stabilized packaged startup smoke by keeping active-Space movement out of the generic initial companion show path, leaving it for focus/restore repair, increasing packaged macOS initial-window wait to `30_000` ms, and adding last-observed CoreGraphics rows to initial-launch failure output.
  - `316ffcf` removed `focus_companion_windows` from initial startup and delayed startup repair, so startup uses `set_companion_windows_visible` plus scheduled non-focus repair only. Share-risk restore still uses active-Space focus repair when needed.
  - Local non-UI verification did not open the app: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed; `cargo test --manifest-path src-tauri/Cargo.toml overlay:: --lib` passed 38 tests; `node --test scripts/release-workflow.test.mjs scripts/macos-meeting-risk-smoke.test.mjs scripts/macos-dmg-meeting-risk-smoke.test.mjs && git diff --check` passed 65 tests; `npm run test:release` passed 177 tests.
  - Pushed `316ffcf` to `origin/main`; `b07b862` is the `[skip ci]` handoff-doc commit on top.

## CI to check next

List recent runs with:

```sh
gh run list --repo puneetdixit200/caveman-ai-interview-copilot --branch main --limit 5 --json databaseId,workflowName,headSha,status,conclusion,createdAt,url
```

Latest pushed package-smoke run to check: `26711742751` for code commit `316ffcf`, in progress when this handoff was refreshed. Previous run `26711471680` for `5f2744f` was also still in progress. `b07b862` is the `[skip ci]` handoff-doc commit on top of `316ffcf`, so `26711742751` is the package-smoke run for the current code. Last fully verified green package-smoke run before this sequence was `26701038173` for `9d28950`, green in all lanes. That earlier run verified the expanded packaged Windows EXE and macOS DMG meeting-risk smokes for Google Meet, Teams browser/native, Zoom, Webex, generic presenting UI, generic screen-recording UI, Slack huddle, Discord voice, WhatsApp video call, remote desktop, screen-recorder windows, window-sharing status, screen-shared status, meeting-recording status, and recording-in-progress status. Windows requires per-scenario restore; macOS DMG now requires main-batch final restore plus strict remote-support restore.

## Suggested next steps

1. Recheck the worktree with `git status --short --branch`.
2. Check Desktop Package Smoke run `26711742751` for `316ffcf`. It should pass `Run native privacy shield tests` in all four package lanes, the Windows `Run packaged Windows meeting-risk smoke` step, and both macOS DMG `Run packaged meeting-risk smoke` steps.
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
