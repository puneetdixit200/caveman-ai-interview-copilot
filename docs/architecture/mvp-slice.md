# Caveman MVP Slice

## Implemented

- `src/lib/contextBuilder.ts` turns transcript history, prompt templates, and resume context into model-ready chat messages.
- `src/lib/providerRouter.ts` streams from the first healthy provider and falls back on health or stream failures.
- `src/stores/overlayStore.ts` owns overlay visibility, opacity, font size, and position-lock state.
- `src/lib/sessionExport.ts` exports session metadata, transcript lines, and AI responses to Markdown.
- `src-tauri/src/db/mod.rs` owns SQLite migrations and CRUD for sessions, transcripts, and settings.
- `src-tauri/src/commands.rs` exposes the Rust backend through Tauri commands.

## Next Production Integrations

The original MVP integration gaps have been closed in the current app:

1. `src-tauri/src/audio/mod.rs` uses native capture paths for microphone, system, dual-stream, and virtual-cable sources.
2. `src-tauri/src/stt/mod.rs` and `src/lib/localWhisperStreaming.ts` support local whisper.cpp sidecars and streaming transcript events.
3. `src/lib/providerClients.ts` and `src/lib/providerRouter.ts` include Ollama, OpenRouter, LM Studio, llama.cpp, vLLM, and direct cloud provider routing.
4. `src-tauri/src/secrets/mod.rs` stores provider keys through the operating-system keychain instead of local settings JSON.
5. `src-tauri/src/overlay/mod.rs` applies platform capture-exclusion controls where supported, and the dashboard enforces the screen-share privacy shield.
6. `npm run verify`, `npm run obs:smoke`, `npm run audio:smoke`, and the `Desktop Package Smoke` workflow cover the release and live-use contracts.

## Remaining Commercial Release Gates

These are external release inputs, not code integrations:

1. Configure `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for signed updater artifacts.
2. Configure Windows Authenticode secrets, `WINDOWS_CODESIGN_CERTIFICATE_BASE64` and `WINDOWS_CODESIGN_CERTIFICATE_PASSWORD`, before publishing redistributable Windows installers.
3. Configure Apple Developer signing and notarization secrets before publishing macOS Intel or Apple Silicon releases.
4. Run the signed release workflow from a version tag and verify the generated GitHub Release assets plus `latest.json`.
