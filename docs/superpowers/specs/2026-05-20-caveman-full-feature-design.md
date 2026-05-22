# Caveman Full Feature Design

## Source Of Truth

This design implements the original `C:\Users\mrpun\OneDrive\Desktop\goal.txt` PRD/TAD, not only the existing MVP shell. The current app already has a Tauri/React desktop shell, dashboard, overlay preview, session archive, prompt templates, SQLite session persistence, TypeScript provider-router interfaces, and tests. The remaining work is to replace demo data and interface stubs with production-capable feature paths while keeping the app testable after every feature lands.

## Scope

The full build covers the original MVP feature groups:

- Audio capture: system audio, microphone audio, dual stream attribution, device selection, virtual cable support.
- Real-time STT: local Whisper path, cloud fallback boundary, streaming transcript events, language metadata, speaker labels.
- AI response engine: Ollama, LM Studio, OpenRouter, OpenAI-compatible providers, context window management, response streaming, prompt templates.
- Overlay system: always-on-top transparent overlay, opacity/font controls, hotkeys, position persistence, markdown rendering, Windows/macOS capture exclusion.
- Conversation management: session recording, searchable history, replay-ready transcripts, Markdown/JSON export, tags, notes.
- Settings: provider configuration, API key vault, audio settings, hotkeys, profiles.

It also covers the requested advanced features:

- Resume and job description context.
- Screen OCR for coding prompts or shared problem statements.
- Auto-answer mode with explicit user opt-in and guardrails.
- Interview practice mode with simulated interviewer and scoring.
- A code answer panel with copyable formatted snippets.
- RAG over user-provided notes, docs, resume, JD, and past project material.
- Multi-language TTS for generated response playback.
- Basic analytics over saved sessions.
- A local-first plugin system for controlled extensions.
- Collaborative helper mode for trusted local-network or authenticated remote sharing.

## Phased Delivery

### Phase 1: Real App State And Configuration

Replace demo-only UI state with persisted settings and session-backed data.

- Add typed settings commands for providers, profiles, hotkeys, audio settings, resume context, and JD context.
- Add a setup wizard for first run: choose interview mode, choose local or cloud provider, test provider health, optionally add resume/JD.
- Add CRUD screens for profiles and prompt templates.
- Store non-secret config in SQLite settings.
- Store API keys through an OS keychain abstraction, with a development fallback that never exposes keys to the renderer.
- Replace dashboard demo transcript/responses with active session state loaded from the Rust backend.

Verification:

- Unit tests for settings parsing, profile selection, prompt-template selection, and context injection.
- Rust tests for settings/profile persistence and secret reference storage.
- Manual smoke test: clean app data starts wizard, saved settings survive restart.

### Phase 2: AI Providers And Response Streaming

Make `Generate` use real model providers.

- Implement Ollama chat streaming against `http://localhost:11434/api/chat`.
- Implement LM Studio/OpenAI-compatible chat streaming against `/v1/chat/completions`.
- Implement OpenRouter streaming with bearer auth and required metadata headers.
- Keep provider fallback behavior from the existing router.
- Persist generated AI responses with prompt metadata, provider, model, token estimates, and latency.
- Add a provider test button in Settings.

Verification:

- Unit tests with mocked fetch streams for Ollama NDJSON and OpenAI-compatible SSE.
- Unit tests for fallback from unhealthy provider to the next enabled provider.
- Integration smoke test with provider unavailable: UI shows actionable error and does not crash.
- Optional live manual test when Ollama or API keys are available.

### Phase 3: Hotkeys And Overlay Production Path

Make the overlay operational during interview use.

- Add global hotkeys for show/hide overlay, generate response, start/stop session, and panic hide.
- Persist overlay position, opacity, lock state, font size, and theme.
- Add markdown rendering for bullets, code blocks, and short answer sections.
- Add Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` and macOS `NSWindowSharingType::None` for capture exclusion when supported.
- Add overlay status indicators so the user knows whether stealth protection is active, unsupported, or failed.

Verification:

- Unit tests for overlay settings and markdown rendering.
- Rust tests or command-level tests for hotkey config validation.
- Manual Windows check: toggle overlay, generate response, resize font, restart app, confirm persisted state.
- Manual capture-exclusion check using a screenshot or screen-share capture tool where available.

### Phase 4: Audio Capture And STT Event Pipeline

Replace audio/STT stubs with a real streaming pipeline.

- Use `cpal` for microphone capture.
- Add a Windows system-audio loopback path using WASAPI where available; keep virtual cable selection as fallback.
- Normalize audio to 16 kHz mono PCM chunks.
- Add gain and noise gate settings.
- Emit audio-level events to the dashboard for live meters.
- Add an STT provider trait.
- Implement a local Whisper sidecar boundary that can run a configured whisper.cpp executable/model path.
- Add a Deepgram-style cloud STT WebSocket implementation path that is enabled only when keys/settings exist.
- Persist transcript segments with speaker, timestamp, confidence, source stream, and language.

Verification:

- Rust unit tests for audio config validation, chunk metadata, noise gate/gain logic, and transcript event serialization.
- Mock STT tests that feed fake chunks and verify transcript persistence/events.
- Manual test: microphone levels move, session start/stop works, transcript events appear from mock/local STT path.
- If local Whisper binary/model is present, live manual test with spoken phrase and latency notes.

### Phase 5: Automatic Answer Triggering

Use the live transcript to generate responses automatically.

- Detect interviewer questions using punctuation, silence timeout, and speaker attribution.
- Add modes: manual only, suggest on question, and continuous coach.
- Prevent duplicate triggers for the same transcript segment.
- Assemble sliding context with prompt, resume/JD, recent transcript, and optional OCR text.
- Stream answer chunks into both dashboard and overlay.

Verification:

- Unit tests for trigger detection, duplicate suppression, context-window trimming, and resume/JD injection.
- Unit tests for generated response persistence after stream completion.
- Manual test with synthetic transcript segments: question triggers one answer, candidate speech does not trigger by default.

### Phase 6: Screen OCR, Code Panel, And Auto-Answer

Add screen context for coding and system design prompts.

- Let the user capture a screen region or active screenshot from the dashboard.
- Run OCR through a local command boundary. The initial implementation uses the same boundary for a bundled OCR binary, an installed local OCR executable, or a deterministic test adapter.
- Store OCR captures as session context with timestamps.
- Show extracted text in a review panel before it is sent to AI.
- Add a code answer panel that extracts code blocks from AI responses and offers copy buttons.
- Add auto-answer mode behind an explicit setting. It can copy a drafted answer to clipboard or insert into a focused text field only after the user confirms the risk.

Verification:

- Unit tests for OCR text normalization and code-block extraction.
- Manual test with a sample screenshot containing code/problem text.
- Safety check: OCR text is not sent to cloud provider unless cloud provider is selected and enabled.
- Unit tests for auto-answer guardrails: disabled by default, requires explicit enablement, and records an event when used.

### Phase 7: Practice Mode And Analytics

Add interview prep features on top of the same session engine.

- Simulated interviewer asks questions by interview type and difficulty.
- User can answer manually or through microphone/STT when available.
- AI scores answers on clarity, correctness, structure, and missing points.
- Analytics summarize question types, response quality, provider latency, session duration, and common weak areas.

Verification:

- Unit tests for practice-session state machine and scoring prompt construction.
- Unit tests for analytics calculations.
- Manual test: start practice, answer, score appears, session saved and export includes score.

### Phase 8: RAG Knowledge Context

Add retrieval over user-provided material so answers can reference the user's own background.

- Let the user add notes, resume text, job descriptions, project docs, and plain text snippets.
- Store source metadata and extracted text locally.
- Build a lightweight local retrieval index using chunked text, keyword search, and recency weighting.
- Inject only the top relevant snippets into the context builder with source labels.
- Keep cloud-provider prompts transparent by showing which snippets will be sent.

Verification:

- Unit tests for chunking, ranking, source filtering, and prompt injection.
- Rust tests for local document persistence.
- Manual test: add a project note, ask a related mock question, confirm the generated prompt includes the relevant snippet.

### Phase 9: TTS Response Playback

Add optional spoken playback for generated hints.

- Add a TTS provider abstraction.
- Implement OS/browser speech synthesis as the first local path.
- Add controls for voice, speed, volume, language, and mute.
- Never auto-play in stealth mode unless the user explicitly enables it for a profile.

Verification:

- Unit tests for TTS settings and queue behavior.
- Manual test: generate response, play/pause/stop TTS, confirm profile mute is honored.

### Phase 10: Plugin System

Add a constrained plugin surface without giving plugins raw filesystem or secret access.

- Define a plugin manifest format for local plugins.
- Allow plugins to contribute prompt templates, export formats, and practice question packs.
- Validate plugin manifests before loading.
- Disable plugins by default in new installs.
- Record plugin load errors in the event log.

Verification:

- Unit tests for manifest validation and plugin enable/disable behavior.
- Manual test with a sample local plugin that adds one prompt template.

### Phase 11: Collaborative Helper Mode

Add a controlled way for a trusted helper to view transcript context and send hints.

- Start with local-network or authenticated session-link sharing, not open public sharing.
- Let the user choose what to share: transcript only, AI responses, or full session context.
- Add incoming helper hints as separate events and overlay cards.
- Provide one-click stop sharing.

Verification:

- Unit tests for share permissions and event handling.
- Manual test with a simulated helper event: hint appears, stop sharing blocks further hints.

## Data Model Changes

The existing SQLite schema remains the base. Add or extend tables for:

- `profiles`: profile name, interview type, provider id, STT mode, overlay config, hotkey config.
- `providers`: provider id, kind, endpoint, model, enabled, secret reference.
- `context_documents`: resume/JD/notes content or file metadata, scoped by profile/session.
- `ocr_captures`: session id, extracted text, timestamp, image metadata, provider.
- `practice_scores`: session id, rubric JSON, score, feedback, created at.
- `knowledge_documents`: source type, title, content hash, extracted text, created at.
- `knowledge_chunks`: document id, chunk text, rank metadata, source label.
- `plugins`: manifest id, name, version, enabled, path, validation status.
- `collaboration_sessions`: session id, share mode, token hash, active flag, created at, ended at.
- `events`: normalized audit trail for session start/stop, provider errors, hotkey actions, and STT status.

Secrets are not stored directly in SQLite. The DB stores only provider ids and keychain references.

## Error Handling

- Provider unavailable: show provider-specific setup action and try fallback if enabled.
- Missing API key: block cloud provider use until the user stores a key.
- Missing Whisper binary/model: allow mock/manual transcript mode and show setup instructions.
- Audio permission/device failure: keep the session open, show device error, and allow manual transcript entry.
- Capture exclusion unsupported: keep overlay usable but clearly label stealth as unsupported.
- OCR failure: keep extracted text empty and preserve the screenshot metadata/error for troubleshooting.
- RAG index failure: leave documents saved, disable retrieval for that profile, and show a repair action.
- TTS failure: stop playback, preserve generated text, and show voice/device error.
- Plugin failure: disable the failed plugin and keep the app running.
- Collaboration failure: stop sharing and preserve local session state.

## Testing Strategy

Every feature must have at least one automated verification before it is marked done:

- TypeScript unit tests for frontend state, provider streaming parsing, trigger logic, context building, export, OCR normalization, analytics, and practice mode.
- Rust tests for persistence, command validation, audio/STT configuration, secret reference handling, plugin/collaboration validation, and event serialization.
- Build checks after each phase: `npm test`, `npm run typecheck`, `npm run build`, and `cargo test`.
- Desktop smoke checks after UI/native phases: `npm run tauri dev` or production executable launch.
- Final packaging check: `npm run tauri build`.

The implementation plan must include a checklist item for each original PRD feature and its test evidence.

## Non-Functional Targets

Use the original targets as acceptance goals:

- App startup under 3 seconds after heavy provider checks are deferred.
- Overlay re-render remains interactive during streaming.
- AI first-token latency is measured and displayed per response.
- Offline mode blocks cloud network calls and uses only local provider/STT paths.
- Raw audio is processed in memory and not written to disk by default.
- Transcripts and responses remain local unless the chosen provider requires a request.

Some targets, especially STT latency under 500 ms, depend on the user machine, model size, and installed Whisper runtime. The app should measure and display actual latency rather than pretending the target is always met.

## Acceptance Checklist

- Audio capture has real microphone path, system/virtual input selection, and visible levels.
- STT has a streaming local path, cloud configuration path, and mock/manual adapters reserved for tests and missing-runtime troubleshooting.
- AI providers include Ollama, LM Studio/OpenAI-compatible, and OpenRouter.
- Provider fallback is tested.
- Overlay supports hotkeys, persistence, markdown/code rendering, and Windows/macOS capture exclusion status.
- Sessions save transcripts, AI responses, tags, notes, and exports.
- Settings save providers, profiles, audio settings, hotkeys, prompt templates, resume/JD context, and secret references.
- Resume/JD context appears in generated prompts.
- OCR can capture/extract/review text before AI use.
- Auto-answer mode is disabled by default, guarded, tested, and event-logged.
- Practice mode can ask, collect, score, and save practice answers.
- RAG can retrieve local user notes/docs and inject labeled snippets.
- TTS can read generated answers with profile-level mute controls.
- Plugin loading is manifest-validated and disabled by default.
- Collaborative mode can share a scoped session and stop sharing immediately.
- Analytics summarize saved session data.
- Each feature has automated tests or documented manual evidence.
