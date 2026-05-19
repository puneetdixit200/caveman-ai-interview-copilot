use tauri::State;

use crate::ai;
use crate::audio::{self, AudioCaptureState};
use crate::db::{Database, NewSession};
use crate::models::{PromptTemplate, Session, Transcript};
use crate::stt;

#[tauri::command]
pub fn create_session(database: State<'_, Database>, input: NewSession) -> Result<Session, String> {
    database.create_session(input).map_err(to_command_error)
}

#[tauri::command]
pub fn list_sessions(database: State<'_, Database>) -> Result<Vec<Session>, String> {
    database.list_sessions().map_err(to_command_error)
}

#[tauri::command]
pub fn add_transcript(
    database: State<'_, Database>,
    session_id: String,
    speaker: String,
    content: String,
    timestamp_ms: i64,
    confidence: Option<f64>,
) -> Result<Transcript, String> {
    database
        .add_transcript(&session_id, &speaker, &content, timestamp_ms, confidence)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn list_transcripts(
    database: State<'_, Database>,
    session_id: String,
) -> Result<Vec<Transcript>, String> {
    database
        .list_transcripts(&session_id)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn save_setting(
    database: State<'_, Database>,
    key: String,
    value: String,
) -> Result<(), String> {
    database
        .save_setting(&key, &value)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn get_setting(database: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    database.get_setting(&key).map_err(to_command_error)
}

#[tauri::command]
pub fn list_audio_devices() -> Vec<audio::AudioDevice> {
    audio::list_audio_devices()
}

#[tauri::command]
pub fn start_capture(system_device_id: String, microphone_device_id: String) -> AudioCaptureState {
    audio::start_capture(&system_device_id, &microphone_device_id)
}

#[tauri::command]
pub fn list_stt_providers() -> Vec<stt::SttProviderStatus> {
    stt::list_stt_providers()
}

#[tauri::command]
pub fn list_prompt_templates() -> Vec<PromptTemplate> {
    ai::prompt_templates()
}

fn to_command_error(error: anyhow::Error) -> String {
    error.to_string()
}
