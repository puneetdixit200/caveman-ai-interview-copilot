pub fn configure_overlay_security(app: &mut tauri::App) {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_decorations(false);
        let _ = window.set_shadow(false);
    }
}
