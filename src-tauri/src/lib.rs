pub mod ai;
pub mod audio;
pub mod commands;
pub mod db;
pub mod models;
pub mod overlay;
pub mod stt;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database = db::Database::open(app_data_dir.join("caveman.sqlite3"))?;
            app.manage(database);
            overlay::configure_overlay_security(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::list_sessions,
            commands::add_transcript,
            commands::list_transcripts,
            commands::save_setting,
            commands::get_setting,
            commands::list_audio_devices,
            commands::start_capture,
            commands::list_stt_providers,
            commands::list_prompt_templates
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Caveman");
}
