# Caveman AI Interview Copilot

Caveman AI Interview Copilot is a desktop app for real-time interview assistance. It combines live transcription, AI answer generation, a stealth overlay, local-first session history, and provider support for tools such as Whisper, Ollama, LM Studio, and OpenRouter.

The app targets technical interviews, coding rounds, system design interviews, behavioral interviews, sales calls, and oral exam practice. It is built with Tauri, React, TypeScript, Rust, SQLite, and a local-first architecture.

## Why This Project Exists

Interviews move fast. You may understand the topic and still lose time structuring an answer. Caveman listens to the conversation, builds context, generates concise answer prompts, and shows them in an overlay while saving the session for review.

## SEO Keywords

AI interview copilot, AI interview assistant, real-time interview assistant, live interview transcription, Whisper interview assistant, Ollama interview copilot, OpenRouter interview assistant, Tauri desktop app, Rust desktop app, React interview tool, system design interview helper, coding interview assistant, behavioral interview practice, stealth overlay app.

## Current Status

This repository contains the working MVP shell and the full product design for the complete Caveman build.

Implemented now:

- Tauri v2 desktop app with Rust backend and React frontend
- Dashboard for active interview sessions
- Native CPAL microphone, system audio, and dual-stream capture with device selection, gain, noise gate, meters, STT-ready 16 kHz mono snapshots, and 250 ms PCM chunk events for streaming STT clients
- Local Whisper chunk-driven streaming from 250 ms PCM audio, Deepgram live WebSocket streaming with interim word preview, plus AssemblyAI and Google STT fallback commands
- Speaker diarization calibration for microphone, system audio, and provider speaker slots from Whisper, Deepgram, AssemblyAI, and Google STT
- Local Whisper setup helpers that scan for `whisper-cli`/`main` binaries, detect local `ggml` models, and download the official `base.en` model with SHA-1 verification
- Automatic interviewer question detection and answer triggering from live transcript updates
- Ollama, LM Studio, OpenRouter, OpenAI, Anthropic, and Groq provider routing with streaming fallback
- Stealth overlay window with opacity, font controls, global hotkeys, click-through mode, position persistence, and Windows capture exclusion
- Session archive with search, replay, transcript correction, Markdown, JSON, and PDF export
- Resume, job description, OCR, and local knowledge-base context injection
- Code answer extraction and active-window typing for code/editor/chat handoff
- Practice interview mode with local scoring and AI follow-up question generation
- Analytics, TTS queue/playback, plugin manifests/practice packs, OS keychain API key storage, and signed-update configuration
- SQLite-backed Rust command layer for sessions, transcripts, responses, settings, screenshots, secrets, and native actions
- Unit tests for audio, STT parsing, provider fallback, overlay safety, exports, analytics, plugins, hotkeys, OCR, practice, RAG, TTS, and persistence

Planned full build:

- Long-session transcript cursoring for very large histories
- Collaborative helper mode for trusted remote observers
- Production release signing, hosted update manifest publishing, and broader platform packaging

## Core Features

### Real-Time Interview Copilot

Caveman is designed to capture conversation audio, transcribe it, detect interviewer questions, build a model-ready context window, and stream AI-generated answer hints into the app and overlay.

### Stealth Overlay

The overlay is designed for interview use: always on top, adjustable opacity, adjustable font size, fast hide/show, markdown rendering, and Windows screen-capture exclusion when supported by the operating system.

### Local-First AI Workflow

The architecture supports offline-first use with local Whisper and local LLM providers such as Ollama or LM Studio. Cloud providers such as OpenRouter can be enabled when the user chooses to send context to a cloud model.

### Session History

Sessions can store transcripts, AI responses, tags, notes, providers, model metadata, latency, and exports for review after the interview.

### Interview Practice

The full roadmap includes a practice mode where an AI interviewer asks questions, scores answers, and tracks weak areas across sessions.

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
- AI provider targets: Ollama, LM Studio, OpenRouter, OpenAI-compatible APIs
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
