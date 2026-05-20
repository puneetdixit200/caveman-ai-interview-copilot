use serde::{Deserialize, Serialize};
use tauri::{PhysicalPosition, PhysicalSize};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub monitor_name: Option<String>,
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

pub fn get_overlay_window_bounds(app: &tauri::AppHandle) -> anyhow::Result<OverlayWindowBounds> {
    use tauri::Manager;

    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| anyhow::anyhow!("Overlay window was not found."))?;
    read_overlay_window_bounds(&window)
}

pub fn set_overlay_window_bounds(
    app: &tauri::AppHandle,
    bounds: OverlayWindowBounds,
) -> anyhow::Result<OverlayWindowBounds> {
    use tauri::Manager;

    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| anyhow::anyhow!("Overlay window was not found."))?;
    let bounds = sanitize_overlay_bounds(bounds);
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    window.set_size(PhysicalSize::new(bounds.width, bounds.height))?;
    let _ = protect_overlay_window(app);
    read_overlay_window_bounds(&window)
}

pub fn sanitize_overlay_bounds(bounds: OverlayWindowBounds) -> OverlayWindowBounds {
    OverlayWindowBounds {
        x: bounds.x.clamp(-100_000, 100_000),
        y: bounds.y.clamp(-100_000, 100_000),
        width: bounds.width.clamp(320, 2_400),
        height: bounds.height.clamp(180, 1_600),
        monitor_name: bounds.monitor_name,
    }
}

fn read_overlay_window_bounds(
    window: &tauri::WebviewWindow,
) -> anyhow::Result<OverlayWindowBounds> {
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let monitor_name = window
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());

    Ok(OverlayWindowBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        monitor_name,
    })
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
