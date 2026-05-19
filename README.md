# Caveman

Caveman is a desktop-first real-time interview copilot built with Tauri, React, TypeScript, Rust, and SQLite.

This repository implements the first working slice from `goal.txt`:

- Tauri v2 desktop shell with main and overlay windows
- React dashboard for live session control, transcript, AI response, overlay, sessions, and settings
- TypeScript core for context-window assembly, provider fallback streaming, overlay state, and markdown export
- Rust command layer for sessions, transcripts, settings, audio/STT capability discovery, and prompt templates
- SQLite schema matching the PRD tables for sessions, transcripts, AI responses, settings, API keys, and prompt templates
- Unit tests for the TypeScript core and Rust persistence contract

## Development

```powershell
npm install
npm run dev
npm test
npm run typecheck
npm run build
cd src-tauri
cargo test
```

Run the desktop app:

```powershell
npm run tauri dev
```

## Current Scope

The app is wired as a functional desktop MVP shell. Audio capture, whisper.cpp streaming, cloud STT sockets, local/cloud LLM HTTP clients, OS keychain encryption, and Windows display-affinity capture exclusion are represented as stable interfaces and command boundaries, but the low-level production integrations still need to be filled in behind those interfaces.

## Architecture

The pipeline follows the PRD:

`Audio Capture -> STT -> Context Builder -> Provider Router -> Overlay Renderer -> SQLite Session Store`

Frontend state stays in React/Zustand. Privacy-sensitive persistence and native OS work stays in Rust behind Tauri commands.

