# Caveman MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested Tauri/React MVP shell for Caveman from `goal.txt`.

**Architecture:** React renders the dashboard, sessions, settings, and overlay surfaces. TypeScript core modules handle context assembly, provider fallback, overlay state, and export. Rust/Tauri owns SQLite persistence and native command boundaries.

**Tech Stack:** Tauri v2, React 19, TypeScript, Zustand, Vitest, Rust, rusqlite.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`

- [x] Create package and build scripts.
- [x] Add Vite, React, TypeScript, Vitest, and Tauri dependencies.
- [x] Add Rust manifest with Tauri and SQLite dependencies.

### Task 2: Test-First Core Modules

**Files:**
- Test: `src/lib/contextBuilder.test.ts`
- Test: `src/lib/providerRouter.test.ts`
- Test: `src/stores/overlayStore.test.ts`
- Test: `src/lib/sessionExport.test.ts`

- [x] Write failing tests for model context assembly.
- [x] Write failing tests for provider fallback streaming.
- [x] Write failing tests for overlay state clamping and visibility.
- [x] Write failing tests for Markdown export.
- [x] Implement minimal production modules and make tests pass.

### Task 3: Desktop UI

**Files:**
- Create: `src/App.tsx`
- Create: `src/pages/Dashboard.tsx`
- Create: `src/pages/Sessions.tsx`
- Create: `src/pages/Settings.tsx`
- Create: `src/components/**`
- Create: `src/index.css`

- [x] Build operational dashboard, sessions, settings, and overlay screens.
- [x] Keep controls wired to local state and tested core modules.

### Task 4: Rust Backend

**Files:**
- Test: `src-tauri/tests/db_contract.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/commands.rs`

- [x] Write failing SQLite contract tests.
- [x] Implement migrations and session/transcript/settings CRUD.
- [x] Expose Tauri commands for the frontend.

### Task 5: Verification

**Files:**
- Modify as needed based on test output.

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `cargo test` inside `src-tauri`.
- [x] Run `npm run tauri build`.
- [ ] Commit and push to GitHub.
