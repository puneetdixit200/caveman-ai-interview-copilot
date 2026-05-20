pub mod ai;
pub mod audio;
pub mod commands;
pub mod db;
pub mod models;
pub mod overlay;
pub mod plugins;
pub mod secrets;
pub mod stt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database = db::Database::open(app_data_dir.join("caveman.sqlite3"))?;
            app.manage(database);
            app.manage(audio::AudioCaptureManager::default());
            overlay::configure_overlay_security(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::list_sessions,
            commands::add_transcript,
            commands::list_transcripts,
            commands::add_ai_response,
            commands::list_ai_responses,
            commands::save_setting,
            commands::get_setting,
            commands::save_provider_api_key,
            commands::get_provider_api_key,
            commands::delete_provider_api_key,
            commands::list_audio_devices,
            commands::start_capture,
            commands::stop_capture,
            commands::get_capture_status,
            commands::list_stt_providers,
            commands::transcribe_with_local_whisper,
            commands::transcribe_with_cloud_stt,
            commands::protect_overlay_window,
            commands::set_overlay_window_visible,
            commands::list_prompt_templates,
            commands::load_plugin_manifests
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Caveman");
}
