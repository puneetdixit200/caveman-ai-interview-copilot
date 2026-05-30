# Next Agent Handoff

## Current goal

Make Caveman harder to expose during Google Meet, Microsoft Teams, and screen-share workflows using supported OS-level protections. Do not implement kernel extensions, rootkits, deceptive universal hiding, or anything that bypasses OS/user security boundaries.

## Current repo state

- Branch: `main`
- Remote: `origin/main`
- Latest pushed implementation commit before this handoff refresh: `99d33cc test: let meeting smoke clear naturally`
- This handoff file is being kept current as the screen-share hardening work continues.
- Previous relevant commits:
  - `c7569f5 ci: verify macos privacy shield on push`
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

Local meeting-risk smoke result:

```text
READY
- Initial Caveman window 12215 is 1249x820 and protected.
- Google Meet browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams native process: Caveman hid while the simulated meeting window was visible.
- Caveman restored protected onscreen window 12215 at 1249x820.
```

`npm run test:release` passed 142 tests after the DMG runtime-smoke wiring edits. `npm run meeting-risk:smoke:mac` also passed after restarting the local app from clean saved state.

## CI to check next

List recent runs with:

```sh
gh run list --repo puneetdixit200/caveman-ai-interview-copilot --branch main --limit 5 --json databaseId,workflowName,headSha,status,conclusion,createdAt,url
```

## Suggested next steps

1. Recheck the worktree with `git status --short --branch`.
2. Verify the next pushed Desktop Package Smoke run includes and passes both macOS DMG `Run packaged meeting-risk smoke` steps.
3. Verify the installed app window is visible, non-zero-sized, and protected with CoreGraphics window inspection.
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
