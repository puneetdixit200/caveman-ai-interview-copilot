# Caveman MVP Design

## Goal

Build the first working Caveman desktop application slice from `goal.txt`: a Tauri/React shell with native persistence, overlay UI, transcript/session flows, model routing boundaries, and tests.

## Architecture

Caveman uses Tauri v2 for the desktop shell, React and TypeScript for the dashboard and overlay UI, Zustand for overlay state, Rust for native commands, and SQLite for local session data.

The first slice keeps low-level audio/STT/LLM integrations behind interfaces so the app can run, test, and evolve without changing the user-facing workflow.

## Components

- Dashboard: active session controls, audio status, transcript feed, generated response preview, overlay controls.
- Sessions: history list and Markdown export preview.
- Settings: provider configuration, API key vault status, profiles, prompt templates.
- Rust backend: SQLite migrations and commands for sessions, transcripts, settings, audio/STT discovery, and prompt templates.

## Testing

- Vitest covers context building, provider fallback streaming, overlay state, and Markdown export.
- Cargo tests cover SQLite session/transcript/settings persistence.
- Build verification uses TypeScript typecheck and Vite production build.

