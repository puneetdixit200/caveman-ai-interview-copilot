pub mod ai;
pub mod audio;
pub mod audio_apps;
pub mod collaboration;
pub mod commands;
pub mod db;
pub mod models;
pub mod ocr;
pub mod overlay;
pub mod plugins;
pub mod screen_share;
pub mod secrets;
pub mod stt;
pub mod typing;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database = db::Database::open(app_data_dir.join("caveman.sqlite3"))?;
            app.manage(database);
            app.manage(audio::AudioCaptureManager::default());
            app.manage(collaboration::CollaborationManager::default());
            overlay::configure_overlay_security(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::list_sessions,
            commands::add_transcript,
            commands::list_transcripts,
            commands::list_transcripts_page,
            commands::update_transcript,
            commands::delete_transcript,
            commands::add_ai_response,
            commands::list_ai_responses,
            commands::save_setting,
            commands::get_setting,
            commands::save_provider_api_key,
            commands::get_provider_api_key,
            commands::delete_provider_api_key,
            commands::list_audio_devices,
            commands::list_audio_applications,
            commands::start_capture,
            commands::stop_capture,
            commands::get_capture_status,
            commands::save_capture_snapshot,
            commands::delete_capture_snapshot,
            commands::list_stt_providers,
            commands::detect_local_whisper_setup,
            commands::download_whisper_model,
            commands::transcribe_with_local_whisper,
            commands::transcribe_local_whisper_pcm,
            commands::transcribe_with_cloud_stt,
            commands::protect_overlay_window,
            commands::set_overlay_window_visible,
            commands::get_overlay_window_bounds,
            commands::set_overlay_window_bounds,
            commands::detect_screen_share_status,
            commands::list_prompt_templates,
            commands::load_plugin_manifests,
            commands::capture_screen_frame,
            commands::type_text_into_active_window,
            commands::start_collaboration_server,
            commands::stop_collaboration_server,
            commands::get_collaboration_status,
            commands::publish_collaboration_snapshot,
            commands::list_collaboration_hints,
            commands::clear_collaboration_hint
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Caveman");
}
