use tauri::{AppHandle, State};

use crate::ai;
use crate::audio::{self, AudioCaptureManager, AudioCaptureState};
use crate::db::{Database, NewAiResponse, NewSession};
use crate::models::{AiResponse, PromptTemplate, Session, Transcript};
use crate::overlay::OverlayProtectionStatus;
use crate::secrets::SecretStatus;
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
pub fn add_ai_response(
    database: State<'_, Database>,
    input: NewAiResponse,
) -> Result<AiResponse, String> {
    database.add_ai_response(input).map_err(to_command_error)
}

#[tauri::command]
pub fn list_ai_responses(
    database: State<'_, Database>,
    session_id: String,
) -> Result<Vec<AiResponse>, String> {
    database
        .list_ai_responses(&session_id)
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
pub fn save_provider_api_key(provider_id: String, secret: String) -> Result<SecretStatus, String> {
    crate::secrets::save_provider_api_key(&provider_id, &secret).map_err(to_command_error)
}

#[tauri::command]
pub fn get_provider_api_key(provider_id: String) -> Result<Option<String>, String> {
    crate::secrets::get_provider_api_key(&provider_id).map_err(to_command_error)
}

#[tauri::command]
pub fn delete_provider_api_key(provider_id: String) -> Result<SecretStatus, String> {
    crate::secrets::delete_provider_api_key(&provider_id).map_err(to_command_error)
}

#[tauri::command]
pub fn list_audio_devices() -> Vec<audio::AudioDevice> {
    audio::list_audio_devices()
}

#[tauri::command]
pub fn start_capture(
    app_handle: AppHandle,
    capture_manager: State<'_, AudioCaptureManager>,
    system_device_id: String,
    microphone_device_id: String,
) -> Result<AudioCaptureState, String> {
    capture_manager
        .start(app_handle, &system_device_id, &microphone_device_id)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn stop_capture(capture_manager: State<'_, AudioCaptureManager>) -> AudioCaptureState {
    capture_manager.stop()
}

#[tauri::command]
pub fn get_capture_status(capture_manager: State<'_, AudioCaptureManager>) -> AudioCaptureState {
    capture_manager.status()
}

#[tauri::command]
pub fn list_stt_providers() -> Vec<stt::SttProviderStatus> {
    stt::list_stt_providers()
}

#[tauri::command]
pub fn transcribe_with_local_whisper(
    input: stt::LocalWhisperRequest,
) -> Result<Vec<stt::TranscriptEvent>, String> {
    stt::transcribe_with_local_whisper(input).map_err(to_command_error)
}

#[tauri::command]
pub fn transcribe_with_cloud_stt(
    input: stt::CloudSttRequest,
) -> Result<Vec<stt::TranscriptEvent>, String> {
    stt::transcribe_with_cloud_stt(input).map_err(to_command_error)
}

#[tauri::command]
pub fn protect_overlay_window(app_handle: AppHandle) -> OverlayProtectionStatus {
    crate::overlay::protect_overlay_window(&app_handle)
}

#[tauri::command]
pub fn set_overlay_window_visible(app_handle: AppHandle, visible: bool) -> OverlayProtectionStatus {
    crate::overlay::set_overlay_window_visible(&app_handle, visible)
}

#[tauri::command]
pub fn list_prompt_templates() -> Vec<PromptTemplate> {
    ai::prompt_templates()
}

fn to_command_error(error: anyhow::Error) -> String {
    error.to_string()
}
