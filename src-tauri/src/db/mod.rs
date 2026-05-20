use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
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

pub struct Database {
    connection: Mutex<Connection>,
}

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
                interview_type TEXT NOT NULL CHECK(interview_type IN ('dsa','system_design','behavioral','hr','mixed')),
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
