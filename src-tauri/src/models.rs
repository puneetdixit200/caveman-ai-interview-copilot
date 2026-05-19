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
    pub timestamp_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
}
