# Next Agent Handoff

## Current goal

Make Caveman harder to expose during Google Meet, Microsoft Teams, and screen-share workflows using supported OS-level protections. Do not implement kernel extensions, rootkits, deceptive universal hiding, or anything that bypasses OS/user security boundaries.

## Current repo state

- Branch: `main`
- Remote: `origin/main`
- Latest implementation commit: `85fb051 test: add macos meeting risk smoke`
- This handoff file may be committed after that as a docs-only commit.
- Previous relevant commits:
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

## Verification already run locally

- `node --test scripts/macos-meeting-risk-smoke.test.mjs`
- `npm run meeting-risk:smoke:mac`
- `npm run test:release`

Local meeting-risk smoke result:

```text
READY
- Initial Caveman window 11804 is 1280x820 and protected.
- Google Meet browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams browser window: Caveman hid while the simulated meeting window was visible.
- Microsoft Teams native process: Caveman hid while the simulated meeting window was visible.
- Caveman restored protected onscreen window 11804 at 1280x820.
```

`npm run test:release` passed 131 tests.

## CI to check next

The Desktop Package Smoke workflow for commit `85fb051ef69e2fb4d106a0c514659dbfba45135a` was still running when this handoff was written.

Check it with:

```sh
gh run watch 26680334826 --repo puneetdixit200/caveman-ai-interview-copilot --exit-status
```

Or list recent runs:

```sh
gh run list --repo puneetdixit200/caveman-ai-interview-copilot --branch main --limit 5 --json databaseId,workflowName,headSha,status,conclusion,createdAt,url
```

## Suggested next steps

1. Confirm Desktop Package Smoke run `26680334826` finishes successfully.
2. Recheck the worktree with `git status --short --branch`.
3. Verify the installed app window is visible, non-zero-sized, and protected with CoreGraphics window inspection.
4. If the app is collapsed to `0x0`, restart it after clearing saved state:

```sh
pkill -x caveman >/dev/null 2>&1 || true
sleep 1
rm -rf "$HOME/Library/Saved Application State/com.caveman.desktop.savedState"
open -b com.caveman.desktop
sleep 5
```

5. Continue strengthening only supported protections: content protection, fail-closed share-risk detection, deterministic hide/restore behavior, and package/runtime verification.

## Local cleanup note

The user asked to clear offline/local rebuildable artifacts after pushing this handoff. Preserve the Git repo, source files, and pushed work unless the user explicitly asks to remove the local checkout.
