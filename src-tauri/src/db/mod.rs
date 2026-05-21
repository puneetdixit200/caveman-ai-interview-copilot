use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{AiResponse, Session, Transcript};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSession {
    pub title: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub interview_type: String,
    pub tags: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSession {
    pub id: String,
    pub title: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub interview_type: String,
    pub tags: Vec<String>,
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAiResponse {
    pub session_id: String,
    pub trigger_transcript_id: Option<i64>,
    pub prompt_messages: String,
    pub response: String,
    pub model: String,
    pub provider: String,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub latency_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptCursor {
    pub timestamp_ms: i64,
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPage {
    pub items: Vec<Transcript>,
    pub total_count: i64,
    pub has_more_before: bool,
    pub has_more_after: bool,
    pub previous_cursor: Option<TranscriptCursor>,
    pub next_cursor: Option<TranscriptCursor>,
}

pub struct Database {
    connection: Mutex<Connection>,
}

const SESSION_INTERVIEW_TYPE_CHECK: &str =
    "('dsa','system_design','frontend','backend','devops_cloud','behavioral','hr','mixed')";

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path.as_ref())
            .with_context(|| format!("open sqlite database at {}", path.as_ref().display()))?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn in_memory() -> Result<Self> {
        let database = Self {
            connection: Mutex::new(Connection::open_in_memory()?),
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn create_session(&self, input: NewSession) -> Result<Session> {
        let id = Uuid::new_v4().simple().to_string();
        let now = Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&input.tags)?;
        let connection = self.lock()?;

        connection.execute(
            "INSERT INTO sessions (
                id, title, company, role, interview_type, tags, status, total_tokens,
                duration_seconds, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', 0, 0, ?7, ?8)",
            params![
                id,
                input.title,
                input.company,
                input.role,
                input.interview_type,
                tags_json,
                input.notes,
                now
            ],
        )?;
        drop(connection);

        self.get_session(&id)
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, title, company, role, interview_type, tags, status, model_used, provider,
                    total_tokens, duration_seconds, notes, created_at, ended_at
             FROM sessions
             ORDER BY created_at DESC",
        )?;

        let rows = statement.query_map([], map_session)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn update_session(&self, input: UpdateSession) -> Result<Session> {
        let title = input.title.trim().to_string();
        if title.is_empty() {
            anyhow::bail!("session title cannot be empty");
        }

        let interview_type = input.interview_type.trim().to_string();
        validate_interview_type(&interview_type)?;
        let status = input.status.trim().to_string();
        validate_session_status(&status)?;

        let company = normalize_optional_text(input.company);
        let role = normalize_optional_text(input.role);
        let notes = normalize_optional_text(input.notes);
        let tags_json = serde_json::to_string(&normalize_tags(input.tags))?;
        let ended_at = if status == "active" {
            None
        } else {
            Some(Utc::now().to_rfc3339())
        };
        let connection = self.lock()?;

        let updated_rows = connection.execute(
            "UPDATE sessions
             SET title = ?2,
                 company = ?3,
                 role = ?4,
                 interview_type = ?5,
                 tags = ?6,
                 status = ?7,
                 notes = ?8,
                 ended_at = CASE
                   WHEN ?7 = 'active' THEN NULL
                   ELSE COALESCE(ended_at, ?9)
                 END
            WHERE id = ?1",
            params![
                &input.id,
                title,
                company,
                role,
                interview_type,
                tags_json,
                status,
                notes,
                ended_at
            ],
        )?;
        if updated_rows == 0 {
            anyhow::bail!("session was not found");
        }
        drop(connection);

        self.get_session(&input.id)
    }

    pub fn add_transcript(
        &self,
        session_id: &str,
        speaker: &str,
        content: &str,
        timestamp_ms: i64,
        confidence: Option<f64>,
    ) -> Result<Transcript> {
        let now = Utc::now().to_rfc3339();
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO transcripts (session_id, speaker, content, confidence, timestamp_ms, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![session_id, speaker, content, confidence, timestamp_ms, now],
        )?;
        let id = connection.last_insert_rowid();
        drop(connection);
        self.get_transcript(id)
    }

    pub fn list_transcripts(&self, session_id: &str) -> Result<Vec<Transcript>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, session_id, speaker, content, confidence, timestamp_ms, created_at
             FROM transcripts
             WHERE session_id = ?1
             ORDER BY timestamp_ms ASC, id ASC",
        )?;
        let rows = statement.query_map(params![session_id], map_transcript)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn list_transcripts_page(
        &self,
        session_id: &str,
        cursor: Option<TranscriptCursor>,
        direction: &str,
        limit: i64,
    ) -> Result<TranscriptPage> {
        let limit = limit.clamp(1, 500);
        let fetch_limit = limit + 1;
        let direction = if direction == "before" {
            "before"
        } else {
            "after"
        };
        let connection = self.lock()?;
        let total_count = connection.query_row(
            "SELECT COUNT(*) FROM transcripts WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, i64>(0),
        )?;

        let mut items = match (direction, cursor.as_ref()) {
            ("before", Some(cursor)) => {
                let mut statement = connection.prepare(
                    "SELECT id, session_id, speaker, content, confidence, timestamp_ms, created_at
                     FROM transcripts
                     WHERE session_id = ?1
                       AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND id < ?3))
                     ORDER BY timestamp_ms DESC, id DESC
                     LIMIT ?4",
                )?;
                let rows = statement.query_map(
                    params![session_id, cursor.timestamp_ms, cursor.id, fetch_limit],
                    map_transcript,
                )?;
                let mut rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
                rows.reverse();
                rows
            }
            ("after", Some(cursor)) => {
                let mut statement = connection.prepare(
                    "SELECT id, session_id, speaker, content, confidence, timestamp_ms, created_at
                     FROM transcripts
                     WHERE session_id = ?1
                       AND (timestamp_ms > ?2 OR (timestamp_ms = ?2 AND id > ?3))
                     ORDER BY timestamp_ms ASC, id ASC
                     LIMIT ?4",
                )?;
                let rows = statement.query_map(
                    params![session_id, cursor.timestamp_ms, cursor.id, fetch_limit],
                    map_transcript,
                )?;
                rows.collect::<rusqlite::Result<Vec<_>>>()?
            }
            _ => {
                let mut statement = connection.prepare(
                    "SELECT id, session_id, speaker, content, confidence, timestamp_ms, created_at
                     FROM transcripts
                     WHERE session_id = ?1
                     ORDER BY timestamp_ms ASC, id ASC
                     LIMIT ?2",
                )?;
                let rows = statement.query_map(params![session_id, fetch_limit], map_transcript)?;
                rows.collect::<rusqlite::Result<Vec<_>>>()?
            }
        };

        let fetched_extra = items.len() > limit as usize;
        if direction == "before" && fetched_extra {
            items.remove(0);
        } else if fetched_extra {
            items.truncate(limit as usize);
        }

        let previous_cursor = items.first().map(transcript_cursor);
        let next_cursor = items.last().map(transcript_cursor);
        let has_more_before = match previous_cursor.as_ref() {
            Some(cursor) => has_transcript_before(&connection, session_id, cursor)?,
            None => false,
        };
        let has_more_after = match next_cursor.as_ref() {
            Some(cursor) => has_transcript_after(&connection, session_id, cursor)?,
            None => false,
        };

        Ok(TranscriptPage {
            items,
            total_count,
            has_more_before,
            has_more_after,
            previous_cursor,
            next_cursor,
        })
    }

    pub fn update_transcript(
        &self,
        id: i64,
        speaker: &str,
        content: &str,
        timestamp_ms: i64,
        confidence: Option<f64>,
    ) -> Result<Transcript> {
        let normalized_content = content.trim();
        if normalized_content.is_empty() {
            anyhow::bail!("transcript content cannot be empty");
        }

        let connection = self.lock()?;
        let updated_rows = connection.execute(
            "UPDATE transcripts
             SET speaker = ?1, content = ?2, confidence = ?3, timestamp_ms = ?4
             WHERE id = ?5",
            params![speaker, normalized_content, confidence, timestamp_ms, id],
        )?;
        if updated_rows == 0 {
            anyhow::bail!("transcript {id} was not found");
        }
        drop(connection);

        self.get_transcript(id)
    }

    pub fn delete_transcript(&self, id: i64) -> Result<()> {
        let connection = self.lock()?;
        let deleted_rows =
            connection.execute("DELETE FROM transcripts WHERE id = ?1", params![id])?;
        if deleted_rows == 0 {
            anyhow::bail!("transcript {id} was not found");
        }
        Ok(())
    }

    pub fn add_ai_response(&self, input: NewAiResponse) -> Result<AiResponse> {
        let now = Utc::now().to_rfc3339();
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO ai_responses (
                session_id, trigger_transcript_id, prompt_messages, response, model, provider,
                input_tokens, output_tokens, latency_ms, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                input.session_id,
                input.trigger_transcript_id,
                input.prompt_messages,
                input.response,
                input.model,
                input.provider,
                input.input_tokens,
                input.output_tokens,
                input.latency_ms,
                now
            ],
        )?;
        let id = connection.last_insert_rowid();
        drop(connection);
        self.get_ai_response(id)
    }

    pub fn list_ai_responses(&self, session_id: &str) -> Result<Vec<AiResponse>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, session_id, trigger_transcript_id, prompt_messages, response, model,
                    provider, input_tokens, output_tokens, latency_ms, created_at
             FROM ai_responses
             WHERE session_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![session_id], map_ai_response)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn save_setting(&self, key: &str, value: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let value = statement.query_row(params![key], |row| row.get::<_, String>(0));

        match value {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn get_session(&self, id: &str) -> Result<Session> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, title, company, role, interview_type, tags, status, model_used, provider,
                        total_tokens, duration_seconds, notes, created_at, ended_at
                 FROM sessions WHERE id = ?1",
                params![id],
                map_session,
            )
            .map_err(Into::into)
    }

    fn get_transcript(&self, id: i64) -> Result<Transcript> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, session_id, speaker, content, confidence, timestamp_ms, created_at
                 FROM transcripts WHERE id = ?1",
                params![id],
                map_transcript,
            )
            .map_err(Into::into)
    }

    fn get_ai_response(&self, id: i64) -> Result<AiResponse> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, session_id, trigger_transcript_id, prompt_messages, response, model,
                        provider, input_tokens, output_tokens, latency_ms, created_at
                 FROM ai_responses WHERE id = ?1",
                params![id],
                map_ai_response,
            )
            .map_err(Into::into)
    }

    fn migrate(&self) -> Result<()> {
        let connection = self.lock()?;
        connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                company TEXT,
                role TEXT,
                interview_type TEXT NOT NULL CHECK(interview_type IN ('dsa','system_design','frontend','backend','devops_cloud','behavioral','hr','mixed')),
                tags TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
                model_used TEXT,
                provider TEXT,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                ended_at TEXT
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                speaker TEXT NOT NULL CHECK(speaker IN ('interviewer','candidate','unknown')),
                content TEXT NOT NULL,
                confidence REAL,
                timestamp_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                trigger_transcript_id INTEGER REFERENCES transcripts(id),
                prompt_messages TEXT NOT NULL,
                response TEXT NOT NULL,
                model TEXT NOT NULL,
                provider TEXT NOT NULL,
                input_tokens INTEGER,
                output_tokens INTEGER,
                latency_ms INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL UNIQUE,
                encrypted_key BLOB NOT NULL,
                display_name TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                last_used TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompt_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id, timestamp_ms);
            CREATE INDEX IF NOT EXISTS idx_responses_session ON ai_responses(session_id, created_at);
            ",
        )?;
        Self::migrate_session_interview_types(&connection)?;
        Ok(())
    }

    fn migrate_session_interview_types(connection: &Connection) -> Result<()> {
        let sessions_sql = connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        let Some(sessions_sql) = sessions_sql else {
            return Ok(());
        };

        if sessions_sql.contains("'frontend'")
            && sessions_sql.contains("'backend'")
            && sessions_sql.contains("'devops_cloud'")
        {
            return Ok(());
        }

        connection.execute_batch(&format!(
            "
            PRAGMA foreign_keys = OFF;
            PRAGMA legacy_alter_table = ON;
            BEGIN TRANSACTION;

            ALTER TABLE sessions RENAME TO sessions_legacy_interview_types;

            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                company TEXT,
                role TEXT,
                interview_type TEXT NOT NULL CHECK(interview_type IN {SESSION_INTERVIEW_TYPE_CHECK}),
                tags TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
                model_used TEXT,
                provider TEXT,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                ended_at TEXT
            );

            INSERT INTO sessions (
                id, title, company, role, interview_type, tags, status, model_used, provider,
                total_tokens, duration_seconds, notes, created_at, ended_at
            )
            SELECT
                id, title, company, role, interview_type, tags, status, model_used, provider,
                total_tokens, duration_seconds, notes, created_at, ended_at
            FROM sessions_legacy_interview_types;

            DROP TABLE sessions_legacy_interview_types;

            COMMIT;
            PRAGMA legacy_alter_table = OFF;
            PRAGMA foreign_keys = ON;
            "
        ))?;

        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| anyhow::anyhow!("database connection lock poisoned"))
    }
}

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    let tags_json: String = row.get(5)?;
    let tags = serde_json::from_str(&tags_json).unwrap_or_default();

    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        company: row.get(2)?,
        role: row.get(3)?,
        interview_type: row.get(4)?,
        tags,
        status: row.get(6)?,
        model_used: row.get(7)?,
        provider: row.get(8)?,
        total_tokens: row.get(9)?,
        duration_seconds: row.get(10)?,
        notes: row.get(11)?,
        created_at: row.get(12)?,
        ended_at: row.get(13)?,
    })
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();

    for tag in tags {
        let tag = tag.trim().to_string();
        if !tag.is_empty() && !normalized.contains(&tag) {
            normalized.push(tag);
        }
    }

    normalized
}

fn validate_interview_type(value: &str) -> Result<()> {
    if [
        "dsa",
        "system_design",
        "frontend",
        "backend",
        "devops_cloud",
        "behavioral",
        "hr",
        "mixed",
    ]
    .contains(&value)
    {
        return Ok(());
    }

    anyhow::bail!("unsupported interview type: {value}");
}

fn validate_session_status(value: &str) -> Result<()> {
    if ["active", "completed", "archived"].contains(&value) {
        return Ok(());
    }

    anyhow::bail!("unsupported session status: {value}");
}

fn map_transcript(row: &rusqlite::Row<'_>) -> rusqlite::Result<Transcript> {
    Ok(Transcript {
        id: row.get(0)?,
        session_id: row.get(1)?,
        speaker: row.get(2)?,
        content: row.get(3)?,
        confidence: row.get(4)?,
        timestamp_ms: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn transcript_cursor(transcript: &Transcript) -> TranscriptCursor {
    TranscriptCursor {
        timestamp_ms: transcript.timestamp_ms,
        id: transcript.id,
    }
}

fn has_transcript_before(
    connection: &Connection,
    session_id: &str,
    cursor: &TranscriptCursor,
) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM transcripts
            WHERE session_id = ?1
              AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND id < ?3))
            LIMIT 1
        )",
        params![session_id, cursor.timestamp_ms, cursor.id],
        |row| row.get::<_, bool>(0),
    )
}

fn has_transcript_after(
    connection: &Connection,
    session_id: &str,
    cursor: &TranscriptCursor,
) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM transcripts
            WHERE session_id = ?1
              AND (timestamp_ms > ?2 OR (timestamp_ms = ?2 AND id > ?3))
            LIMIT 1
        )",
        params![session_id, cursor.timestamp_ms, cursor.id],
        |row| row.get::<_, bool>(0),
    )
}

fn map_ai_response(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiResponse> {
    Ok(AiResponse {
        id: row.get(0)?,
        session_id: row.get(1)?,
        trigger_transcript_id: row.get(2)?,
        prompt_messages: row.get(3)?,
        response: row.get(4)?,
        model: row.get(5)?,
        provider: row.get(6)?,
        input_tokens: row.get(7)?,
        output_tokens: row.get(8)?,
        latency_ms: row.get(9)?,
        created_at: row.get(10)?,
    })
}
