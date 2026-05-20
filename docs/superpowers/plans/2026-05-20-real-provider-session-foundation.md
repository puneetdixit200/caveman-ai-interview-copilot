# Real Provider Session Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo answer path with real persisted interview sessions, manual transcript entry, real provider streaming, and saved AI responses.

**Architecture:** Keep the current Tauri/React/Rust split. TypeScript owns provider HTTP streaming and prompt assembly for this slice. Rust/SQLite owns session, transcript, AI response, and settings persistence through Tauri commands.

**Tech Stack:** Tauri v2, React 19, TypeScript, Vitest, Rust, rusqlite, fetch streaming.

---

## Scope Check

The full product spec includes audio capture, STT, OCR, TTS, RAG, plugins, and collaboration. This plan implements the first real-use slice only: provider configuration, real chat streaming, manual transcript entry, and persistence. Audio/STT and the advanced features remain separate plans because they touch independent native subsystems.

## File Map

- `src/types/session.ts`: add persisted AI response input and prompt-message fields.
- `src/types/settings.ts`: add secret/API-key fields for local encrypted storage until OS keychain lands.
- `src/lib/providerClients.ts`: create real Ollama, LM Studio/OpenAI-compatible, and OpenRouter provider adapters.
- `src/lib/providerClients.test.ts`: test streaming parsers and request validation with mocked fetch.
- `src/lib/appConfig.ts`: create defaults, JSON parsing, and config validation helpers.
- `src/lib/appConfig.test.ts`: test defaults and invalid JSON fallback.
- `src/lib/sessionRuntime.ts`: create helpers for manual transcript timestamps, response assembly, and rough token estimates.
- `src/lib/sessionRuntime.test.ts`: test timestamping and token estimates.
- `src/lib/tauri.ts`: add typed command wrappers used by pages.
- `src-tauri/src/models.rs`: add `AiResponse`.
- `src-tauri/src/db/mod.rs`: add AI response insert/list methods and setting helpers already needed by typed config.
- `src-tauri/src/commands.rs`: expose `add_ai_response` and `list_ai_responses`.
- `src-tauri/tests/db_contract.rs`: test AI response round trip.
- `src/pages/Dashboard.tsx`: replace demo response generation with active session loading, manual transcript input, real provider streaming, and persistence.
- `src/pages/Settings.tsx`: replace static provider list with editable config saved in app settings.
- `src/pages/Sessions.tsx`: load real sessions and export selected session data.

## Task 1: Persist AI Responses In Rust

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands.rs`
- Test: `src-tauri/tests/db_contract.rs`

- [ ] Add `AiResponse` and `NewAiResponse` structs with camelCase serde fields: `id`, `sessionId`, `promptMessages`, `response`, `model`, `provider`, `inputTokens`, `outputTokens`, `latencyMs`, `createdAt`.
- [ ] Add a failing Rust test that creates a session, inserts one AI response, lists responses by session, and asserts prompt JSON, model, provider, response, and latency survive the round trip.
- [ ] Implement `Database::add_ai_response` and `Database::list_ai_responses` using the existing `ai_responses` table.
- [ ] Expose Tauri commands `add_ai_response` and `list_ai_responses`.
- [ ] Run `cargo test` inside `src-tauri`; expected result is all Rust tests passing.
- [ ] Commit with `feat: persist ai responses`.

## Task 2: Add Real Provider Clients

**Files:**
- Create: `src/lib/providerClients.ts`
- Create: `src/lib/providerClients.test.ts`
- Modify: `src/types/settings.ts`
- Modify: `src/lib/providerRouter.ts`

- [ ] Add provider config support for `apiKey?: string`, `headers?: Record<string, string>`, and enabled local/cloud providers.
- [ ] Write Vitest tests for parsing Ollama NDJSON chunks shaped as `{"message":{"content":"..."}}`.
- [ ] Write Vitest tests for parsing OpenAI/OpenRouter SSE chunks shaped as `data: {"choices":[{"delta":{"content":"..."}}]}` and stopping at `data: [DONE]`.
- [ ] Write Vitest tests that OpenRouter without an API key returns an unhealthy provider result instead of sending a request.
- [ ] Implement `createConfiguredProvider(config, fetchImpl)` returning an `AIProvider`.
- [ ] Implement health checks for local providers by calling their endpoint with a timeout-safe lightweight request.
- [ ] Run `npm test -- providerClients`; expected result is all provider client tests passing.
- [ ] Commit with `feat: add real ai provider clients`.

## Task 3: Add Settings Defaults And Persistence Helpers

**Files:**
- Create: `src/lib/appConfig.ts`
- Create: `src/lib/appConfig.test.ts`
- Modify: `src/lib/tauri.ts`

- [ ] Write tests that default config includes Ollama enabled at `http://localhost:11434/api/chat`, LM Studio disabled at `http://localhost:1234/v1/chat/completions`, and OpenRouter disabled until an API key is set.
- [ ] Write tests that malformed JSON falls back to defaults without throwing.
- [ ] Implement `DEFAULT_APP_CONFIG`, `parseAppConfig`, and `serializeAppConfig`.
- [ ] Add typed wrappers `getSetting`, `saveSetting`, `listSessions`, `createSession`, `addTranscript`, `listTranscripts`, `addAiResponse`, and `listAiResponses` in `src/lib/tauri.ts`.
- [ ] Run `npm test -- appConfig`; expected result is all config tests passing.
- [ ] Commit with `feat: add persisted app config helpers`.

## Task 4: Add Runtime Helpers For Real Sessions

**Files:**
- Create: `src/lib/sessionRuntime.ts`
- Create: `src/lib/sessionRuntime.test.ts`

- [ ] Write tests for `nextTranscriptTimestampMs(startedAt, now)` returning elapsed milliseconds and never negative.
- [ ] Write tests for `estimateTokens(text)` returning at least one token for non-empty short text and a larger count for longer text.
- [ ] Write tests for `mergeStreamingResponse(chunks)` joining chunks exactly.
- [ ] Implement the three helpers with deterministic behavior.
- [ ] Run `npm test -- sessionRuntime`; expected result is all runtime tests passing.
- [ ] Commit with `feat: add session runtime helpers`.

## Task 5: Replace Dashboard Demo Flow

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/overlay/OverlayWindow.tsx` if the response shape requires prompt metadata.
- Modify: `src/components/overlay/TranscriptFeed.tsx` only if it assumes demo-only data.

- [ ] Load or create an active session on mount using Tauri commands.
- [ ] Load transcripts and AI responses from SQLite for the active session.
- [ ] Add manual transcript input with speaker selector: interviewer, candidate, unknown.
- [ ] Save manual transcript lines through `addTranscript` and refresh the feed.
- [ ] Generate real AI responses by building chat messages from saved transcripts and the selected prompt template, then streaming through enabled providers.
- [ ] Save completed AI responses through `addAiResponse`.
- [ ] Show provider errors in the dashboard instead of silently using demo data.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build`; expected result is all checks passing.
- [ ] Commit with `feat: wire dashboard to real providers`.

## Task 6: Replace Settings Demo Flow

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] Load `app.config` from settings on mount.
- [ ] Render editable fields for provider enabled state, endpoint, model, and API key.
- [ ] Save provider config to the settings table.
- [ ] Add a clear warning that API keys are temporarily stored in local app settings until OS keychain lands.
- [ ] Add a provider test action that calls the configured provider health check.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build`; expected result is all checks passing.
- [ ] Commit with `feat: make provider settings editable`.

## Task 7: Replace Sessions Demo Flow

**Files:**
- Modify: `src/pages/Sessions.tsx`

- [ ] Load real sessions from SQLite instead of `historicalSessions`.
- [ ] Selecting a session loads its transcripts and AI responses.
- [ ] Markdown export uses the selected real session data.
- [ ] Empty state explains that real sessions appear after using the dashboard.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `cargo test`; expected result is all checks passing.
- [ ] Commit with `feat: show real saved sessions`.

## Task 8: Desktop Smoke Test And Package Check

**Files:**
- Modify only if the smoke test reveals a real bug in files touched above.

- [ ] Launch the production executable or `npm run tauri dev`.
- [ ] Create a manual transcript line.
- [ ] Configure Ollama or leave it unavailable and confirm the dashboard shows an actionable provider error.
- [ ] If a provider is available, generate a response and confirm it saves to session history.
- [ ] Run `npm run tauri build`; expected result is installer build success.
- [ ] Commit any smoke-test fixes with a focused message.

## Completion Evidence

The slice is complete when these commands have fresh passing output:

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cd src-tauri; cargo test`
- `npm run tauri build`

Manual evidence must include either a real provider response saved to a session or an unavailable-provider error shown without demo fallback.
