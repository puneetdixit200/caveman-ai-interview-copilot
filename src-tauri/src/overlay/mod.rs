use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayProtectionStatus {
    pub always_on_top: bool,
    pub skip_taskbar: bool,
    pub capture_exclusion: String,
    pub click_through: bool,
    pub visible: bool,
    pub message: Option<String>,
}

pub fn configure_overlay_security(app: &mut tauri::App) {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_decorations(false);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        let _ = apply_capture_exclusion(&window);
    }
}

pub fn protect_overlay_window(app: &tauri::AppHandle) -> OverlayProtectionStatus {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("overlay") else {
        return OverlayProtectionStatus {
            always_on_top: false,
            skip_taskbar: false,
            capture_exclusion: "failed".to_string(),
            click_through: false,
            visible: false,
            message: Some("Overlay window was not found.".to_string()),
        };
    };

    let always_on_top = window.set_always_on_top(true).is_ok();
    let skip_taskbar = window.set_skip_taskbar(true).is_ok();
    let click_through = window.set_ignore_cursor_events(true).is_ok();
    let visible = window.is_visible().unwrap_or(false);
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(false);
    let mut status = apply_capture_exclusion(&window);
    status.always_on_top = always_on_top;
    status.skip_taskbar = skip_taskbar;
    status.click_through = click_through;
    status.visible = visible;
    status
}

pub fn set_overlay_window_visible(
    app: &tauri::AppHandle,
    visible: bool,
) -> OverlayProtectionStatus {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("overlay") else {
        return OverlayProtectionStatus {
            always_on_top: false,
            skip_taskbar: false,
            capture_exclusion: "failed".to_string(),
            click_through: false,
            visible: false,
            message: Some("Overlay window was not found.".to_string()),
        };
    };

    let mut status = protect_overlay_window(app);
    let visibility_result = if visible {
        window.show()
    } else {
        window.hide()
    };
    status.visible = visible && visibility_result.is_ok();

    if let Err(error) = visibility_result {
        status.message = Some(format!("Overlay visibility update failed: {error}"));
    }

    status
}

#[cfg(target_os = "windows")]
fn apply_capture_exclusion(window: &tauri::WebviewWindow) -> OverlayProtectionStatus {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    match window.hwnd() {
        Ok(hwnd) => {
            let ok = unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) }.is_ok();
            OverlayProtectionStatus {
                always_on_top: true,
                skip_taskbar: true,
                capture_exclusion: if ok { "enabled" } else { "failed" }.to_string(),
                click_through: false,
                visible: false,
                message: if ok {
                    None
                } else {
                    Some("Windows rejected SetWindowDisplayAffinity.".to_string())
                },
            }
        }
        Err(error) => OverlayProtectionStatus {
            always_on_top: true,
            skip_taskbar: true,
            capture_exclusion: "failed".to_string(),
            click_through: false,
            visible: false,
            message: Some(error.to_string()),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_capture_exclusion(_window: &tauri::WebviewWindow) -> OverlayProtectionStatus {
    capture_exclusion_unavailable_status()
}

pub fn capture_exclusion_unavailable_status() -> OverlayProtectionStatus {
    OverlayProtectionStatus {
        always_on_top: true,
        skip_taskbar: true,
        capture_exclusion: "unsupported".to_string(),
        click_through: false,
        visible: false,
        message: Some(
            "Capture exclusion is only implemented on Windows in this build.".to_string(),
        ),
    }
}

#[cfg(test)]
mod mod_test;
