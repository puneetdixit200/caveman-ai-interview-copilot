# Caveman MVP Slice

## Implemented

- `src/lib/contextBuilder.ts` turns transcript history, prompt templates, and resume context into model-ready chat messages.
- `src/lib/providerRouter.ts` streams from the first healthy provider and falls back on health or stream failures.
- `src/stores/overlayStore.ts` owns overlay visibility, opacity, font size, and position-lock state.
- `src/lib/sessionExport.ts` exports session metadata, transcript lines, and AI responses to Markdown.
- `src-tauri/src/db/mod.rs` owns SQLite migrations and CRUD for sessions, transcripts, and settings.
- `src-tauri/src/commands.rs` exposes the Rust backend through Tauri commands.

## Next Production Integrations

1. Replace `src-tauri/src/audio/mod.rs` placeholder device data with `cpal` loopback and microphone streams.
2. Attach a whisper.cpp sidecar process in `src-tauri/src/stt/mod.rs` and emit partial transcript events.
3. Add OpenRouter, Ollama, LM Studio, and direct-provider HTTP clients behind the provider router.
4. Store API keys through OS keychain APIs and keep secrets out of the renderer process.
5. Apply Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` and macOS `NSWindowSharingNone` to the overlay.
6. Add end-to-end tests for session creation, transcript streaming, provider fallback, and export.

