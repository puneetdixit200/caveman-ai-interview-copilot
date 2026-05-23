use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{
    AiResponse, KnowledgeBase, KnowledgeChunk, KnowledgeDocumentRecord, PracticeScore,
    SecurityEvent, Session, Transcript,
};

const KNOWLEDGE_BASE_SETTING_KEY: &str = "knowledge.base";

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPracticeScore {
    pub session_id: String,
    pub question_id: String,
    pub question: String,
    pub answer: String,
    pub score: i64,
    pub feedback: String,
    pub next_action: String,
    pub matched_signals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSecurityEvent {
    pub category: String,
    pub action: String,
    pub target: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeChunk {
    pub id: String,
    pub source_label: String,
    pub text: String,
    pub created_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewKnowledgeDocument {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub text: String,
    pub created_at_ms: Option<i64>,
    pub chunks: Vec<NewKnowledgeChunk>,
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
        source: Option<String>,
        language: Option<String>,
    ) -> Result<Transcript> {
        let now = Utc::now().to_rfc3339();
        let source = normalize_optional_text(source);
        let language = normalize_optional_text(language);
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO transcripts (
                session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                session_id,
                speaker,
                content,
                confidence,
                source,
                language,
                timestamp_ms,
                now
            ],
        )?;
        let id = connection.last_insert_rowid();
        drop(connection);
        self.get_transcript(id)
    }

    pub fn list_transcripts(&self, session_id: &str) -> Result<Vec<Transcript>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
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
                    "SELECT id, session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
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
                    "SELECT id, session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
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
                    "SELECT id, session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
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

    pub fn add_practice_score(&self, input: NewPracticeScore) -> Result<PracticeScore> {
        let session_id = input.session_id.trim().to_string();
        if session_id.is_empty() {
            anyhow::bail!("practice score session id cannot be empty");
        }

        let question_id = input.question_id.trim().to_string();
        if question_id.is_empty() {
            anyhow::bail!("practice score question id cannot be empty");
        }

        let question = input.question.trim().to_string();
        if question.is_empty() {
            anyhow::bail!("practice score question cannot be empty");
        }

        let answer = input.answer.trim().to_string();
        if answer.is_empty() {
            anyhow::bail!("practice score answer cannot be empty");
        }

        let feedback = input.feedback.trim().to_string();
        let next_action = input.next_action.trim().to_string();
        let matched_signals = normalize_tags(input.matched_signals);
        let matched_signals_json = serde_json::to_string(&matched_signals)?;
        let score = input.score.clamp(1, 5);
        let now = Utc::now().to_rfc3339();
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO practice_scores (
                session_id, question_id, question, answer, score, feedback,
                next_action, matched_signals, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                session_id,
                question_id,
                question,
                answer,
                score,
                feedback,
                next_action,
                matched_signals_json,
                now
            ],
        )?;
        let id = connection.last_insert_rowid();
        drop(connection);

        self.get_practice_score(id)
    }

    pub fn list_practice_scores(&self, session_id: &str) -> Result<Vec<PracticeScore>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, session_id, question_id, question, answer, score, feedback,
                    next_action, matched_signals, created_at
             FROM practice_scores
             WHERE session_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map(params![session_id], map_practice_score)?;
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

    pub fn record_security_event(&self, input: NewSecurityEvent) -> Result<SecurityEvent> {
        let category = input.category.trim().to_string();
        if category.is_empty() {
            anyhow::bail!("security event category cannot be empty");
        }

        let action = input.action.trim().to_string();
        if action.is_empty() {
            anyhow::bail!("security event action cannot be empty");
        }

        let now = Utc::now().to_rfc3339();
        let target = normalize_optional_text(input.target);
        let details = normalize_optional_text(input.details);
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO security_events (category, action, target, details, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![category, action, target, details, now],
        )?;
        let id = connection.last_insert_rowid();
        drop(connection);

        self.get_security_event(id)
    }

    pub fn list_security_events(&self, limit: i64) -> Result<Vec<SecurityEvent>> {
        let limit = limit.clamp(1, 200);
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, category, action, target, details, created_at
             FROM security_events
             ORDER BY id DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], map_security_event)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn upsert_knowledge_document(&self, input: NewKnowledgeDocument) -> Result<KnowledgeBase> {
        let id = input.id.trim().to_string();
        if id.is_empty() {
            anyhow::bail!("knowledge document id cannot be empty");
        }

        let title = input.title.trim().to_string();
        if title.is_empty() {
            anyhow::bail!("knowledge document title cannot be empty");
        }

        let source_type = input.source_type.trim().to_string();
        if source_type.is_empty() {
            anyhow::bail!("knowledge document source type cannot be empty");
        }

        let text = input.text.trim().to_string();
        if text.is_empty() {
            anyhow::bail!("knowledge document text cannot be empty");
        }

        let created_at_ms = input.created_at_ms.unwrap_or_else(current_timestamp_ms);
        let connection = self.lock()?;
        let transaction = connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO knowledge_documents (
                id, title, source_type, extracted_text, character_count, created_at_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                source_type = excluded.source_type,
                extracted_text = excluded.extracted_text,
                character_count = excluded.character_count,
                created_at_ms = excluded.created_at_ms",
            params![
                &id,
                &title,
                &source_type,
                &text,
                text.chars().count() as i64,
                created_at_ms
            ],
        )?;
        transaction.execute(
            "DELETE FROM knowledge_chunks WHERE document_id = ?1",
            params![&id],
        )?;

        for (index, chunk) in input.chunks.into_iter().enumerate() {
            let chunk_id = normalize_chunk_id(chunk.id, &id, index);
            let source_label = chunk.source_label.trim().to_string();
            let chunk_text = chunk.text.trim().to_string();
            if chunk_text.is_empty() {
                continue;
            }

            transaction.execute(
                "INSERT INTO knowledge_chunks (
                    id, document_id, source_label, text, rank_order, created_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    chunk_id,
                    &id,
                    if source_label.is_empty() {
                        format!("{source_type}: {title}")
                    } else {
                        source_label
                    },
                    chunk_text,
                    index as i64,
                    chunk.created_at_ms.or(Some(created_at_ms))
                ],
            )?;
        }

        transaction.commit()?;
        drop(connection);

        self.list_knowledge_base()
    }

    pub fn list_knowledge_base(&self) -> Result<KnowledgeBase> {
        let connection = self.lock()?;
        Self::migrate_legacy_knowledge_setting(&connection)?;
        let mut document_statement = connection.prepare(
            "SELECT id, title, source_type, character_count, created_at_ms
             FROM knowledge_documents
             ORDER BY created_at_ms ASC, id ASC",
        )?;
        let documents = document_statement
            .query_map([], map_knowledge_document_record)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut chunk_statement = connection.prepare(
            "SELECT id, document_id, source_label, text, created_at_ms
             FROM knowledge_chunks
             ORDER BY rank_order ASC, id ASC",
        )?;
        let chunks = chunk_statement
            .query_map([], map_knowledge_chunk)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(KnowledgeBase { documents, chunks })
    }

    fn migrate_legacy_knowledge_setting(connection: &Connection) -> Result<()> {
        let document_count: i64 =
            connection.query_row("SELECT COUNT(*) FROM knowledge_documents", [], |row| {
                row.get(0)
            })?;
        if document_count > 0 {
            return Ok(());
        }

        let raw = connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![KNOWLEDGE_BASE_SETTING_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(raw) = raw else {
            return Ok(());
        };
        if raw.trim().is_empty() {
            return Ok(());
        }

        let base = match serde_json::from_str::<KnowledgeBase>(&raw) {
            Ok(base) => base,
            Err(_) => return Ok(()),
        };
        if base.documents.is_empty() {
            return Ok(());
        }

        let transaction = connection.unchecked_transaction()?;
        for document in &base.documents {
            let id = document.id.trim().to_string();
            let title = document.title.trim().to_string();
            if id.is_empty() || title.is_empty() {
                continue;
            }

            let source_type = match document.source_type.trim() {
                "" => "legacy".to_string(),
                value => value.to_string(),
            };
            let document_chunks = base
                .chunks
                .iter()
                .filter(|chunk| chunk.document_id == document.id)
                .collect::<Vec<_>>();
            let extracted_text = document_chunks
                .iter()
                .map(|chunk| chunk.text.trim())
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            let character_count = if document.character_count > 0 {
                document.character_count
            } else {
                extracted_text.chars().count() as i64
            };

            transaction.execute(
                "INSERT OR IGNORE INTO knowledge_documents (
                    id, title, source_type, extracted_text, character_count, created_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &id,
                    &title,
                    &source_type,
                    &extracted_text,
                    character_count,
                    document.created_at_ms
                ],
            )?;

            for (index, chunk) in document_chunks.into_iter().enumerate() {
                let chunk_text = chunk.text.trim().to_string();
                if chunk_text.is_empty() {
                    continue;
                }
                let chunk_id = normalize_chunk_id(chunk.id.clone(), &id, index);
                let source_label = match chunk.source_label.trim() {
                    "" => format!("{source_type}: {title}"),
                    value => value.to_string(),
                };

                transaction.execute(
                    "INSERT OR IGNORE INTO knowledge_chunks (
                        id, document_id, source_label, text, rank_order, created_at_ms
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        chunk_id,
                        &id,
                        source_label,
                        chunk_text,
                        index as i64,
                        chunk.created_at_ms
                    ],
                )?;
            }
        }
        transaction.commit()?;

        Ok(())
    }

    pub fn delete_knowledge_document(&self, document_id: &str) -> Result<KnowledgeBase> {
        let connection = self.lock()?;
        connection.execute(
            "DELETE FROM knowledge_documents WHERE id = ?1",
            params![document_id],
        )?;
        drop(connection);

        self.list_knowledge_base()
    }

    pub fn clear_knowledge_base(&self) -> Result<KnowledgeBase> {
        let connection = self.lock()?;
        connection.execute("DELETE FROM knowledge_documents", [])?;
        drop(connection);

        self.list_knowledge_base()
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
                "SELECT id, session_id, speaker, content, confidence, source, language, timestamp_ms, created_at
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

    fn get_practice_score(&self, id: i64) -> Result<PracticeScore> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, session_id, question_id, question, answer, score, feedback,
                        next_action, matched_signals, created_at
                 FROM practice_scores WHERE id = ?1",
                params![id],
                map_practice_score,
            )
            .map_err(Into::into)
    }

    fn get_security_event(&self, id: i64) -> Result<SecurityEvent> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT id, category, action, target, details, created_at
                 FROM security_events WHERE id = ?1",
                params![id],
                map_security_event,
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
                source TEXT,
                language TEXT,
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

            CREATE TABLE IF NOT EXISTS practice_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                question_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
                feedback TEXT NOT NULL,
                next_action TEXT NOT NULL,
                matched_signals TEXT NOT NULL DEFAULT '[]',
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

            CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT,
                details TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                source_type TEXT NOT NULL,
                extracted_text TEXT NOT NULL,
                character_count INTEGER NOT NULL,
                created_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
                source_label TEXT NOT NULL,
                text TEXT NOT NULL,
                rank_order INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER
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
            CREATE INDEX IF NOT EXISTS idx_practice_scores_session ON practice_scores(session_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
            CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id, rank_order);
            ",
        )?;
        Self::ensure_optional_transcript_metadata_columns(&connection)?;
        Self::migrate_session_interview_types(&connection)?;
        Ok(())
    }

    fn ensure_optional_transcript_metadata_columns(connection: &Connection) -> Result<()> {
        let columns = table_columns(connection, "transcripts")?;
        for column in ["source", "language"] {
            if !columns.iter().any(|existing| existing == column) {
                connection.execute(
                    &format!("ALTER TABLE transcripts ADD COLUMN {column} TEXT"),
                    [],
                )?;
            }
        }

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

fn current_timestamp_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn normalize_chunk_id(id: String, document_id: &str, index: usize) -> String {
    let id = id.trim().to_string();
    if id.is_empty() {
        format!("{document_id}-{}", index + 1)
    } else {
        id
    }
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
        source: row.get(5)?,
        language: row.get(6)?,
        timestamp_ms: row.get(7)?,
        created_at: row.get(8)?,
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

fn map_practice_score(row: &rusqlite::Row<'_>) -> rusqlite::Result<PracticeScore> {
    let matched_signals_json: String = row.get(8)?;
    let matched_signals = serde_json::from_str(&matched_signals_json).unwrap_or_default();

    Ok(PracticeScore {
        id: row.get(0)?,
        session_id: row.get(1)?,
        question_id: row.get(2)?,
        question: row.get(3)?,
        answer: row.get(4)?,
        score: row.get(5)?,
        feedback: row.get(6)?,
        next_action: row.get(7)?,
        matched_signals,
        created_at: row.get(9)?,
    })
}

fn map_security_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<SecurityEvent> {
    Ok(SecurityEvent {
        id: row.get(0)?,
        category: row.get(1)?,
        action: row.get(2)?,
        target: row.get(3)?,
        details: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_knowledge_document_record(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<KnowledgeDocumentRecord> {
    Ok(KnowledgeDocumentRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        source_type: row.get(2)?,
        character_count: row.get(3)?,
        created_at_ms: row.get(4)?,
    })
}

fn map_knowledge_chunk(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeChunk> {
    Ok(KnowledgeChunk {
        id: row.get(0)?,
        document_id: row.get(1)?,
        source_label: row.get(2)?,
        text: row.get(3)?,
        created_at_ms: row.get(4)?,
    })
}
