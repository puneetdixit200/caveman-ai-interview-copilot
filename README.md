# Caveman AI Interview Copilot

Caveman AI Interview Copilot is a desktop app for real-time interview assistance. It combines live transcription, AI answer generation, a stealth overlay, local-first session history, and provider support for tools such as Whisper, Ollama, LM Studio, OpenRouter, Google Gemini, Mistral, Together AI, and Fireworks AI.

The app targets technical interviews, coding rounds, system design interviews, behavioral interviews, sales calls, and oral exam practice. It is built with Tauri, React, TypeScript, Rust, SQLite, and a local-first architecture.

## Why This Project Exists

Interviews move fast. You may understand the topic and still lose time structuring an answer. Caveman listens to the conversation, builds context, generates concise answer prompts, and shows them in an overlay while saving the session for review.

## SEO Keywords

AI interview copilot, AI interview assistant, real-time interview assistant, live interview transcription, Whisper interview assistant, Ollama interview copilot, OpenRouter interview assistant, Tauri desktop app, Rust desktop app, React interview tool, system design interview helper, coding interview assistant, behavioral interview practice, collaborative interview helper, stealth overlay app.

## Current Status

This repository contains the working MVP shell and the full product design for the complete Caveman build.

Implemented now:

- Tauri v2 desktop app with Rust backend and React frontend
- Dashboard for active interview sessions
- Native CPAL microphone, system audio, and dual-stream capture with device selection, app-aware target selection, gain, noise gate, meters, STT-ready 16 kHz mono snapshots, and 250 ms PCM chunk events for streaming STT clients
- Audio rehearsal in Settings that briefly runs native capture and reports live microphone/system peaks before a real interview
- Local Whisper chunk-driven streaming from 250 ms PCM audio, Deepgram live WebSocket streaming with interim word preview, AssemblyAI and Google STT fallback commands, and first-class STT auto language detection
- Speaker diarization calibration for microphone, system audio, and provider speaker slots from Whisper, Deepgram, AssemblyAI, and Google STT
- Local Whisper setup helpers that scan for `whisper-cli`/`main` binaries, detect local `ggml` models, and download the official `base.en` model with SHA-1 verification
- Automatic interviewer question detection and answer triggering from live transcript updates
- Guarded auto-answer mode that can type saved AI answers into the active app after a configurable delay
- Token-budgeted context window management with history turn limits, supplemental context trimming, and reserved answer tokens
- Prompt templates for DSA/coding, system design, frontend, backend, DevOps/cloud, behavioral, and HR/culture-fit interviews
- Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, Mistral, Together AI, and Fireworks AI provider routing with streaming fallback and Settings model discovery
- Stealth overlay window with opacity, font controls, global hotkeys, click-through mode, position persistence, Windows capture exclusion, and a screen-sharing process auto-hide guard
- Dashboard session setup for company, role, interview type, tags, and notes, plus archive search, cursor-paged replay, transcript correction, Markdown, JSON, and PDF export
- Settings real-use preflight checker and saved preflight report for audio, STT, provider, automation, overlay, privacy, runtime budget, and live-call checklist readiness before an interview
- Trusted collaborative helper link with token-gated live transcript/answer snapshot sharing and inbound helper hints
- Resume, job description, OCR, and local knowledge-base context injection with stale-document cleanup controls
- Syntax-highlighted code answer extraction with clipboard copy and active-window typing for code/editor/chat handoff
- Practice interview mode with local scoring and AI follow-up question generation
- Analytics, TTS queue/playback, plugin manifests for prompt templates, practice packs, and custom session export templates, OS keychain API key storage, sensitive-action event logging, signed-update configuration, and GitHub `latest.json` release manifest generation
- SQLite-backed Rust command layer for sessions, transcripts, responses, settings, screenshots, secrets, and native actions
- Unit tests for audio, STT parsing, provider fallback, overlay safety, exports, analytics, plugins, hotkeys, OCR, practice, RAG, TTS, collaboration, preflight reports, runtime budgets, and persistence

Planned full build:

- Broader macOS/Linux packaging and store distribution

## Core Features

### Real-Time Interview Copilot

Caveman is designed to capture conversation audio, transcribe it, detect interviewer questions, build a model-ready context window, and stream AI-generated answer hints into the app and overlay. On Windows, Settings can enumerate visible applications so a session can be labeled and routed around the app you intend to capture while system loopback records desktop output.

### Stealth Overlay

The overlay is designed for interview use: always on top, adjustable opacity, adjustable font size, fast hide/show, markdown rendering, Windows screen-capture exclusion when supported by the operating system, and optional auto-hide while known conferencing or recording processes are running.

### Local-First AI Workflow

The architecture supports offline-first use with local Whisper and local LLM providers such as Ollama or LM Studio. Cloud providers such as OpenRouter can be enabled when the user chooses to send context to a cloud model.

### Real-Use Preflight

Settings includes a readiness panel that checks whether the current configuration is ready for a live interview. It flags manual/demo-like settings, missing STT keys or Whisper paths, blocked cloud providers in local-only mode, incomplete audio devices, overlay protection gaps, and risky automation settings.

### Session History

Sessions can store transcripts, AI responses, tags, notes, providers, model metadata, latency, and exports for review after the interview. Built-in Markdown, JSON, and PDF exports can be extended with plugin-defined text templates for resumes, recruiter summaries, or interview debriefs.

### Interview Practice

Practice mode lets an AI interviewer ask questions, score answers, and track weak areas across sessions.

### Collaborative Helper

Dashboard helper links run from the desktop app on localhost by default. A trusted helper can open the tokenized link, watch the active session transcript and saved AI answers, then send short hints back into the dashboard during a live interview.

### Signed Updates

Use `npm run tauri:build:signed` after creating a Tauri updater signing key. The script builds updater artifacts, verifies signed Windows bundles exist, and writes `latest.json` for GitHub Releases at `src-tauri/target/release/bundle/latest.json`. The `Release Signed Windows Build` GitHub Actions workflow can publish those assets to a GitHub Release when `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are configured as repository secrets.

Windows Authenticode signing is optional. Add `WINDOWS_CODESIGN_CERTIFICATE_BASE64` and `WINDOWS_CODESIGN_CERTIFICATE_PASSWORD` repository secrets to import a `.pfx` certificate during the release workflow, or set `WINDOWS_CODESIGN_CERTIFICATE_THUMBPRINT`/`WINDOWS_CODESIGN_SIGN_COMMAND` before running `npm run tauri:build:signed` locally. The build script injects Tauri's Windows signing config before updater artifacts are created so installer signatures and updater signatures are generated in the same release pass.

## Architecture

The intended pipeline follows the original product design:

```text
Audio Capture -> STT -> Context Builder -> Provider Router -> Overlay Renderer -> SQLite Session Store
```

Frontend state lives in React and Zustand. Native audio, persistence, hotkeys, overlay behavior, and security-sensitive work live behind Tauri commands in Rust.

## Tech Stack

- Desktop: Tauri v2
- Frontend: React, TypeScript, Vite
- Native backend: Rust
- Database: SQLite with `rusqlite`
- State: Zustand
- Testing: Vitest and Cargo tests
- AI provider targets: Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, Mistral, Together AI, Fireworks AI, and OpenAI-compatible APIs
- STT targets: whisper.cpp local sidecar and cloud STT providers

## Development

Install dependencies:

```powershell
npm install
```

Run the web frontend:

```powershell
npm run dev
```

Run the desktop app:

```powershell
npm run tauri dev
```

Run tests and checks:

```powershell
npm test
npm run typecheck
npm run build
cd src-tauri
cargo test
```

Build the desktop installer:

```powershell
npm run tauri build
```

## Documentation

- Full MVP slice: `docs/architecture/mvp-slice.md`
- MVP implementation plan: `docs/superpowers/plans/2026-05-19-caveman-mvp.md`
- Full feature design: `docs/superpowers/specs/2026-05-20-caveman-full-feature-design.md`
- Original product source: `C:\Users\mrpun\OneDrive\Desktop\goal.txt`

## Recommended GitHub Topics

Use these repository topics for GitHub search:

```text
ai-interview-copilot
interview-assistant
interview-prep
real-time-transcription
speech-to-text
whisper
ollama
openrouter
tauri
react
typescript
rust
sqlite
desktop-app
system-design
coding-interview
```

## License

No license has been selected yet. Add a license before distributing the app publicly.
