use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub company: Option<String>,
    pub role: Option<String>,
    pub interview_type: String,
    pub tags: Vec<String>,
    pub status: String,
    pub model_used: Option<String>,
    pub provider: Option<String>,
    pub total_tokens: i64,
    pub duration_seconds: i64,
    pub notes: Option<String>,
    pub created_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: i64,
    pub session_id: String,
    pub speaker: String,
    pub content: String,
    pub confidence: Option<f64>,
    pub source: Option<String>,
    pub language: Option<String>,
    pub timestamp_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub id: i64,
    pub session_id: String,
    pub trigger_transcript_id: Option<i64>,
    pub prompt_messages: String,
    pub response: String,
    pub model: String,
    pub provider: String,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub latency_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PracticeScore {
    pub id: i64,
    pub session_id: String,
    pub question_id: String,
    pub question: String,
    pub answer: String,
    pub score: i64,
    pub feedback: String,
    pub next_action: String,
    pub matched_signals: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecurityEvent {
    pub id: i64,
    pub category: String,
    pub action: String,
    pub target: Option<String>,
    pub details: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocumentRecord {
    pub id: String,
    pub title: String,
    pub source_type: String,
    pub character_count: i64,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunk {
    pub id: String,
    pub document_id: String,
    pub source_label: String,
    pub text: String,
    pub created_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub documents: Vec<KnowledgeDocumentRecord>,
    pub chunks: Vec<KnowledgeChunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
}
