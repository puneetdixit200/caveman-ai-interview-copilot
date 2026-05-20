# Caveman Full Feature Buildout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Caveman from a manual transcript copilot into a production-oriented local-first interview copilot with live audio/STT, auto-triggering, overlay controls, OCR, practice, analytics, RAG, TTS, plugins, and security hardening.

**Architecture:** Build this as a sequence of vertical slices. Each slice adds typed config, testable pure modules, native command boundaries, UI controls, persistence, and verification before moving to device- or cloud-dependent behavior.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vitest, Rust, SQLite, provider HTTP/SSE streams, Windows native APIs, optional local binaries for Whisper/OCR, and OS/browser APIs where available.

---

## Scope Strategy

The full `goal.txt` scope is multiple subsystems. This plan decomposes it into phases that can each ship tested software. The first implementation slice in this branch is the **feature foundation layer**: persisted settings and pure logic for audio/STT configuration, question triggering, OCR/code parsing, RAG ranking, practice scoring prompts, analytics, TTS queueing, plugin manifest validation, and security settings. Native live audio and Whisper streaming follow after these boundaries exist.

## File Structure

- Modify `src/types/settings.ts`: expand typed app settings for audio, STT, auto-trigger, OCR, TTS, security, and plugins.
- Modify `src/lib/appConfig.ts`: parse and serialize the expanded settings with safe defaults.
- Create `src/lib/audioPipeline.ts`: device selection, gain/noise-gate math, dual-stream meter state.
- Create `src/lib/autoTrigger.ts`: automatic question detection and duplicate trigger suppression.
- Create `src/lib/ocr.ts`: OCR text normalization and cloud-send guardrails.
- Create `src/lib/codeBlocks.ts`: extract code blocks from AI answers for a code panel.
- Create `src/lib/knowledge.ts`: local RAG chunking and ranking.
- Create `src/lib/practice.ts`: practice mode state and scoring prompt construction.
- Create `src/lib/analytics.ts`: saved-session metrics.
- Create `src/lib/tts.ts`: TTS settings and playback queue state.
- Create `src/lib/pluginManifest.ts`: constrained local plugin manifest validation.
- Modify `src/pages/Settings.tsx`: expose first-class controls for live pipeline settings.
- Modify `src/pages/Dashboard.tsx`: display live-pipeline mode and use auto-trigger logic after manual transcript save.
- Add unit tests beside every new module.

## Phase 1: Feature Foundation Layer

- [ ] **Step 1: Write failing TypeScript tests for expanded app config**

Run: `npm test src/lib/appConfig.test.ts`

Expected before implementation: FAIL because parsed config does not expose audio, STT, auto-trigger, OCR, TTS, security, or plugin defaults.

- [ ] **Step 2: Implement expanded app config**

Update `src/types/settings.ts` and `src/lib/appConfig.ts` with safe defaults:

- audio input source ids, gain, noise gate, dual-stream toggle
- STT provider list and selected mode
- auto-trigger mode, silence timeout, duplicate suppression window
- OCR provider and review-before-send toggle
- TTS voice, rate, volume, stealth mute
- plugin enable flag and plugin directory
- security flags for capture exclusion and local-only mode

- [ ] **Step 3: Verify expanded config tests pass**

Run: `npm test src/lib/appConfig.test.ts`

Expected: PASS.

- [ ] **Step 4: Write failing tests for pure feature modules**

Create tests for:

- `src/lib/audioPipeline.test.ts`
- `src/lib/autoTrigger.test.ts`
- `src/lib/ocr.test.ts`
- `src/lib/codeBlocks.test.ts`
- `src/lib/knowledge.test.ts`
- `src/lib/practice.test.ts`
- `src/lib/analytics.test.ts`
- `src/lib/tts.test.ts`
- `src/lib/pluginManifest.test.ts`

Run each test file and verify it fails because the module does not exist.

- [ ] **Step 5: Implement pure feature modules**

Implement the minimal production logic required by the tests. These modules must be deterministic, side-effect free, and usable by both UI and native command adapters.

- [ ] **Step 6: Verify pure module tests pass**

Run: `npm test src/lib/audioPipeline.test.ts src/lib/autoTrigger.test.ts src/lib/ocr.test.ts src/lib/codeBlocks.test.ts src/lib/knowledge.test.ts src/lib/practice.test.ts src/lib/analytics.test.ts src/lib/tts.test.ts src/lib/pluginManifest.test.ts`

Expected: PASS.

- [ ] **Step 7: Wire Settings UI**

Add settings panels for audio, STT, auto-trigger, OCR, TTS, security, and plugins. Keep API keys and native-device capture separate from this slice.

- [ ] **Step 8: Wire Dashboard auto-trigger preview**

After a transcript line is saved, use `shouldTriggerAnswer` in suggest-on-question mode to optionally start generation. Manual mode remains default unless enabled in Settings.

- [ ] **Step 9: Full frontend verification**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

## Phase 2: Native Audio Capture

- [ ] **Step 1: Add Rust audio config validation tests**
- [ ] **Step 2: Replace fake device list with real host/device enumeration**
- [ ] **Step 3: Add microphone stream lifecycle state**
- [ ] **Step 4: Emit audio meter events for microphone capture**
- [ ] **Step 5: Add Windows system loopback or virtual-cable source selection**
- [ ] **Step 6: Verify with `cargo test` and manual mic meter smoke test**

## Phase 3: STT Providers

- [ ] **Step 1: Define Rust STT provider trait and transcript event model**
- [ ] **Step 2: Implement deterministic mock adapter for tests**
- [ ] **Step 3: Implement local Whisper command-sidecar adapter**
- [ ] **Step 4: Implement Deepgram-compatible WebSocket adapter**
- [ ] **Step 5: Persist transcript events with source and confidence**
- [ ] **Step 6: Verify mock adapter in tests and local Whisper manually when binary/model exist**

## Phase 4: Overlay And Hotkeys

- [ ] **Step 1: Add global hotkey config validation**
- [ ] **Step 2: Register show/hide, generate, start/stop, and panic-hide hotkeys**
- [ ] **Step 3: Persist overlay position and theme**
- [ ] **Step 4: Render markdown and extracted code blocks**
- [ ] **Step 5: Add Windows capture-exclusion status**
- [ ] **Step 6: Verify hotkeys manually and capture exclusion where supported**

## Phase 5: OCR, Code Panel, RAG, Practice, Analytics, TTS, Plugins

- [ ] **Step 1: Add OCR command boundary for screenshot/region text extraction**
- [ ] **Step 2: Add code panel UI using `extractCodeBlocks`**
- [ ] **Step 3: Add knowledge document persistence and retrieval UI**
- [ ] **Step 4: Add practice-mode session flow**
- [ ] **Step 5: Add analytics dashboard**
- [ ] **Step 6: Add browser/OS TTS playback controls**
- [ ] **Step 7: Add local plugin loader for validated manifests**
- [ ] **Step 8: Verify each feature with unit tests plus a desktop smoke test**

## Phase 6: Security, Updates, And Release Hardening

- [ ] **Step 1: Move cloud API secrets to OS keychain references**
- [ ] **Step 2: Add local-only mode network guardrails**
- [ ] **Step 3: Configure Tauri signing/update metadata once signing keys are available**
- [ ] **Step 4: Add event log for sensitive actions**
- [ ] **Step 5: Build MSI/NSIS installers and document setup**

## Completion Gate

Before any phase is called done, run fresh verification:

```powershell
npm test
npm run typecheck
npm run build
cargo test
```

Before release, also run:

```powershell
npm run tauri build
```
