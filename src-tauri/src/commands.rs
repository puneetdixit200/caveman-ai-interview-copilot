use tauri::{AppHandle, Manager, State};

use crate::ai;
use crate::audio::{self, AudioCaptureManager, AudioCaptureState, AudioProcessingSettings};
use crate::collaboration::{
    CollaborationHint, CollaborationManager, CollaborationServerStatus, CollaborationSnapshot,
};
use crate::db::{Database, NewAiResponse, NewSession, TranscriptCursor, TranscriptPage};
use crate::models::{AiResponse, PromptTemplate, Session, Transcript};
use crate::ocr;
use crate::ocr::ScreenFrame;
use crate::overlay::{OverlayProtectionStatus, OverlayWindowBounds};
use crate::plugins::PluginManifestFile;
use crate::secrets::SecretStatus;
use crate::stt;
use crate::typing;

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
pub fn list_transcripts_page(
    database: State<'_, Database>,
    session_id: String,
    cursor: Option<TranscriptCursor>,
    direction: Option<String>,
    limit: Option<i64>,
) -> Result<TranscriptPage, String> {
    database
        .list_transcripts_page(
            &session_id,
            cursor,
            direction.as_deref().unwrap_or("after"),
            limit.unwrap_or(100),
        )
        .map_err(to_command_error)
}

#[tauri::command]
pub fn update_transcript(
    database: State<'_, Database>,
    id: i64,
    speaker: String,
    content: String,
    timestamp_ms: i64,
    confidence: Option<f64>,
) -> Result<Transcript, String> {
    database
        .update_transcript(id, &speaker, &content, timestamp_ms, confidence)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn delete_transcript(database: State<'_, Database>, id: i64) -> Result<(), String> {
    database.delete_transcript(id).map_err(to_command_error)
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
    capture_mode: Option<String>,
    dual_stream_enabled: Option<bool>,
    system_device_id: String,
    microphone_device_id: String,
    gain_db: Option<f32>,
    noise_gate_db: Option<f32>,
) -> Result<AudioCaptureState, String> {
    let source_selection =
        audio::CaptureSourceSelection::from_mode(capture_mode.as_deref(), dual_stream_enabled);
    capture_manager
        .start(
            app_handle,
            &system_device_id,
            &microphone_device_id,
            source_selection,
            AudioProcessingSettings::from_optional(gain_db, noise_gate_db),
        )
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
pub fn save_capture_snapshot(
    app_handle: AppHandle,
    capture_manager: State<'_, AudioCaptureManager>,
    source: String,
    max_seconds: Option<u32>,
) -> Result<audio::CaptureSnapshot, String> {
    capture_manager
        .save_snapshot(app_handle, &source, max_seconds.unwrap_or(6))
        .map_err(to_command_error)
}

#[tauri::command]
pub fn delete_capture_snapshot(app_handle: AppHandle, audio_path: String) -> Result<bool, String> {
    let app_cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    audio::delete_capture_snapshot_file(&app_cache_dir, &audio_path).map_err(to_command_error)
}

#[tauri::command]
pub fn list_stt_providers() -> Vec<stt::SttProviderStatus> {
    stt::list_stt_providers()
}

#[tauri::command]
pub fn detect_local_whisper_setup(
    app_handle: AppHandle,
    search_roots: Option<Vec<String>>,
) -> Result<stt::LocalWhisperSetupStatus, String> {
    let default_models_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("whisper-models");
    let roots = search_roots
        .unwrap_or_else(|| {
            stt::default_whisper_search_roots(default_models_dir.clone())
                .into_iter()
                .map(|path| path.display().to_string())
                .collect()
        })
        .into_iter()
        .map(std::path::PathBuf::from)
        .collect();

    Ok(stt::detect_local_whisper_setup_in_roots(
        roots,
        default_models_dir,
    ))
}

#[tauri::command]
pub fn download_whisper_model(
    app_handle: AppHandle,
    model: String,
    models_dir: Option<String>,
    source_url: Option<String>,
) -> Result<stt::WhisperModelDownloadResult, String> {
    let default_models_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("whisper-models")
        .display()
        .to_string();
    stt::download_whisper_model_to_dir(stt::WhisperModelDownloadRequest {
        model,
        models_dir: models_dir
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(default_models_dir),
        source_url,
    })
    .map_err(to_command_error)
}

#[tauri::command]
pub fn transcribe_with_local_whisper(
    input: stt::LocalWhisperRequest,
) -> Result<Vec<stt::TranscriptEvent>, String> {
    stt::transcribe_with_local_whisper(input).map_err(to_command_error)
}

#[tauri::command]
pub fn transcribe_local_whisper_pcm(
    app_handle: AppHandle,
    input: stt::LocalWhisperPcmRequest,
) -> Result<Vec<stt::TranscriptEvent>, String> {
    let output_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("local-whisper");
    stt::transcribe_local_whisper_pcm(input, output_dir).map_err(to_command_error)
}

#[tauri::command]
pub fn transcribe_with_cloud_stt(
    input: stt::CloudSttRequest,
) -> Result<Vec<stt::TranscriptEvent>, String> {
    stt::transcribe_with_cloud_stt(input).map_err(to_command_error)
}

#[tauri::command]
pub fn protect_overlay_window(
    app_handle: AppHandle,
    capture_exclusion_enabled: Option<bool>,
) -> OverlayProtectionStatus {
    crate::overlay::protect_overlay_window(&app_handle, capture_exclusion_enabled.unwrap_or(true))
}

#[tauri::command]
pub fn set_overlay_window_visible(
    app_handle: AppHandle,
    visible: bool,
    capture_exclusion_enabled: Option<bool>,
) -> OverlayProtectionStatus {
    crate::overlay::set_overlay_window_visible(
        &app_handle,
        visible,
        capture_exclusion_enabled.unwrap_or(true),
    )
}

#[tauri::command]
pub fn get_overlay_window_bounds(app_handle: AppHandle) -> Result<OverlayWindowBounds, String> {
    crate::overlay::get_overlay_window_bounds(&app_handle).map_err(to_command_error)
}

#[tauri::command]
pub fn set_overlay_window_bounds(
    app_handle: AppHandle,
    bounds: OverlayWindowBounds,
    capture_exclusion_enabled: Option<bool>,
) -> Result<OverlayWindowBounds, String> {
    crate::overlay::set_overlay_window_bounds(
        &app_handle,
        bounds,
        capture_exclusion_enabled.unwrap_or(true),
    )
    .map_err(to_command_error)
}

#[tauri::command]
pub fn list_prompt_templates() -> Vec<PromptTemplate> {
    ai::prompt_templates()
}

#[tauri::command]
pub fn load_plugin_manifests(directory: String) -> Result<Vec<PluginManifestFile>, String> {
    crate::plugins::load_plugin_manifest_files(directory).map_err(to_command_error)
}

#[tauri::command]
pub fn capture_screen_frame() -> Result<ScreenFrame, String> {
    ocr::capture_screen_frame().map_err(to_command_error)
}

#[tauri::command]
pub fn type_text_into_active_window(text: String) -> Result<typing::TypingResult, String> {
    typing::type_text_into_active_window(&text).map_err(to_command_error)
}

#[tauri::command]
pub fn start_collaboration_server(
    collaboration_manager: State<'_, CollaborationManager>,
    bind_host: Option<String>,
    port: Option<u16>,
    token: Option<String>,
) -> Result<CollaborationServerStatus, String> {
    collaboration_manager
        .start_server(bind_host, port, token)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn stop_collaboration_server(
    collaboration_manager: State<'_, CollaborationManager>,
) -> CollaborationServerStatus {
    collaboration_manager.stop_server()
}

#[tauri::command]
pub fn get_collaboration_status(
    collaboration_manager: State<'_, CollaborationManager>,
) -> CollaborationServerStatus {
    collaboration_manager.status()
}

#[tauri::command]
pub fn publish_collaboration_snapshot(
    collaboration_manager: State<'_, CollaborationManager>,
    snapshot: CollaborationSnapshot,
) -> Result<(), String> {
    collaboration_manager
        .publish_snapshot(snapshot)
        .map_err(to_command_error)
}

#[tauri::command]
pub fn list_collaboration_hints(
    collaboration_manager: State<'_, CollaborationManager>,
) -> Vec<CollaborationHint> {
    collaboration_manager.list_hints()
}

#[tauri::command]
pub fn clear_collaboration_hint(
    collaboration_manager: State<'_, CollaborationManager>,
    id: String,
) -> Result<(), String> {
    collaboration_manager
        .clear_hint(&id)
        .map_err(to_command_error)
}

fn to_command_error(error: anyhow::Error) -> String {
    error.to_string()
}
