# Session Metadata Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users correct saved interview session metadata after the call: title, company, role, interview type, status, tags, and notes.

**Architecture:** Add one native SQLite update path, one typed Tauri wrapper, and one focused edit form inside the existing Sessions archive. The existing search, replay, analytics, and export views should update from the edited session record.

**Tech Stack:** Tauri 2, Rust, SQLite/rusqlite, React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Native Session Update

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/db_contract.rs`

- [ ] **Step 1: Write the failing Rust contract test**

Add a test that creates a session, calls `Database::update_session`, and asserts title, company, role, interview type, status, tags, notes, and `ended_at` are persisted.

Run: `cargo test --test db_contract session_metadata_can_be_updated_after_an_interview`

Expected: FAIL because `update_session` and its input type do not exist.

- [ ] **Step 2: Implement database update**

Add an `UpdateSession` struct with optional string fields normalized to `None` when blank, tags trimmed/deduped, validated non-empty title, and status-driven `ended_at` handling.

- [ ] **Step 3: Expose Tauri command**

Add `commands::update_session` and register it in `tauri::generate_handler!`.

- [ ] **Step 4: Verify Rust test passes**

Run: `cargo test --test db_contract session_metadata_can_be_updated_after_an_interview`

Expected: PASS.

### Task 2: Frontend Wrapper And Archive Form

**Files:**
- Modify: `src/types/session.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/pages/Sessions.tsx`
- Test: `src/pages/Sessions.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Add a test that opens a session metadata editor, changes title/company/role/status/tags/notes, saves, and expects `tauri.updateSession` to receive normalized fields and the updated archive to show them.

Run: `npm test -- --run src/pages/Sessions.test.tsx`

Expected: FAIL because the edit form and wrapper do not exist.

- [ ] **Step 2: Implement typed frontend update wrapper**

Add `UpdateSessionInput` and `updateSession(input)` that invokes `update_session` in Tauri and falls back to the updated record in browser tests.

- [ ] **Step 3: Implement Sessions edit form**

Add an edit button in the replay header. The form should support title, company, role, interview type, status, comma-separated tags, and notes. On save, update `sessions`, preserve selection, refresh search data, and status text.

- [ ] **Step 4: Verify UI test passes**

Run: `npm test -- --run src/pages/Sessions.test.tsx`

Expected: PASS.

### Task 3: Final Verification

- [ ] Run `npm test -- --run src/pages/Sessions.test.tsx`
- [ ] Run `cargo test --test db_contract`
- [ ] Run `npm run verify`
- [ ] Run `cargo test`
- [ ] Commit and push the slice.
