use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize};

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

pub const PROTECTED_WINDOW_LABELS: [&str; 2] = ["main", "overlay"];
pub const PROTECTION_REFRESH_FAIL_CLOSED_MARKER: &str =
    "Native privacy shield hid app windows after protection refresh failed closed.";
pub const STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER: &str =
    "Startup privacy shield denied initial companion window show.";
pub const COMPANION_HIDE_UNSAFE_PROTECTION_MARKER: &str =
    "Companion app windows stayed hidden because capture exclusion was not proven.";
pub const COMPANION_UNSAFE_PROTECTION_MARKER: &str =
    "Companion window capture exclusion is unsafe.";
pub const BOUNDS_UPDATE_UNSAFE_PROTECTION_MARKER: &str =
    "Overlay bounds update refused before capture exclusion was proven.";
pub const OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER: &str =
    "Overlay show was reverted because capture exclusion was not proven after visibility changed.";
pub const COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER: &str =
    "Companion app window show was reverted because capture exclusion was not proven after visibility changed.";
pub const OVERLAY_POST_SHOW_SHARE_RISK_MARKER: &str =
    "Overlay show was reverted because screen-share risk was detected after visibility changed.";
pub const COMPANION_POST_SHOW_SHARE_RISK_MARKER: &str =
    "Companion app window show was reverted because screen-share risk was detected after visibility changed.";
pub const COMPANION_WINDOW_BOUNDS_REPAIR_MARKER: &str =
    "Companion app window bounds are repaired before and after privacy-approved startup show.";
pub const COMPANION_WINDOW_NATIVE_BOUNDS_REPAIR_MARKER: &str =
    "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows.";
pub const COMPANION_WINDOW_BACKGROUND_REPAIR_MARKER: &str =
    "Companion app windows are restored and repaired while privacy shield stays clear.";
pub const COMPANION_WINDOW_WATCHDOG_PRIVACY_PAUSE_MARKER: &str =
    "Companion window bounds watchdog pauses repairs while screen-share risk is active.";
pub const COMPANION_WINDOW_WATCHDOG_VISIBLE_RESTORE_MARKER: &str =
    "Companion window bounds watchdog performs a visible restore only after privacy clears.";
pub const COMPANION_WINDOW_FOREGROUND_REPAIR_MARKER: &str =
    "Companion app windows are focused only when unusable bounds need repair after privacy clears.";
pub const COMPANION_WINDOW_APP_ACTIVATION_REPAIR_MARKER: &str =
    "macOS companion window repair reactivates the app only after unusable bounds are detected.";
pub const COMPANION_WINDOW_SHARE_RISK_CLEAR_REPAIR_MARKER: &str =
    "Companion app windows reactivate after screen-share risk clears to recover usable bounds.";
pub const COMPANION_WINDOW_REOPEN_PRIVACY_RESTORE_MARKER: &str =
    "Companion app windows use a privacy-gated reopen restore when the bundle is reopened.";
const COMPANION_WINDOW_MIN_WIDTH: u32 = 1024;
const COMPANION_WINDOW_MIN_HEIGHT: u32 = 720;
const COMPANION_WINDOW_DEFAULT_WIDTH: u32 = 1280;
const COMPANION_WINDOW_DEFAULT_HEIGHT: u32 = 820;
const COMPANION_WINDOW_MIN_VISIBLE_WIDTH: u32 = 320;
const COMPANION_WINDOW_MIN_VISIBLE_HEIGHT: u32 = 240;
pub const STARTUP_COMPANION_WINDOW_REPAIR_DELAYS_MS: [u64; 3] = [150, 600, 1_500];
pub const COMPANION_WINDOW_BOUNDS_WATCHDOG_INTERVAL_MS: u64 = 500;
#[cfg(target_os = "macos")]
const COMPANION_WINDOW_APP_ACTIVATION_REPAIR_INTERVAL_MS: u64 = 2_000;

#[cfg(target_os = "macos")]
static COMPANION_WINDOW_LAST_APP_ACTIVATION_REPAIR: std::sync::OnceLock<
    std::sync::Mutex<Option<std::time::Instant>>,
> = std::sync::OnceLock::new();

pub fn protected_window_labels() -> [&'static str; 2] {
    PROTECTED_WINDOW_LABELS
}

pub fn enforce_capture_exclusion_setting(_requested: Option<bool>) -> bool {
    true
}

pub fn is_overlay_window_label(label: &str) -> bool {
    label == "overlay"
}

pub fn is_companion_window_label(label: &str) -> bool {
    !is_overlay_window_label(label)
}

pub fn configure_overlay_security(app: &mut tauri::App) -> bool {
    use tauri::Manager;

    let mut protection_statuses = Vec::new();
    for (label, window) in app.webview_windows() {
        let _ = window.set_content_protected(true);
        protection_statuses.push(apply_capture_exclusion(&window, true));

        if is_overlay_window_label(&label) {
            let _ = window.set_always_on_top(true);
            let _ = window.set_skip_taskbar(true);
            let _ = window.set_decorations(false);
            let _ = window.set_shadow(false);
            let _ = window.set_ignore_cursor_events(true);
        }
    }

    let startup_hide_reason = startup_privacy_shield_hide_reason(
        &protection_statuses,
        crate::screen_share::native_privacy_shield_decision(
            crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
        ),
    );

    let startup_allows_initial_show = startup_hide_reason.is_none();

    if !startup_allows_initial_show {
        for (_, window) in app.webview_windows() {
            let _ = window.hide();
        }
    }

    startup_allows_initial_show
}

pub fn startup_privacy_shield_hide_reason(
    protection_statuses: &[OverlayProtectionStatus],
    screen_share_decision: crate::screen_share::NativePrivacyShieldDecision,
) -> Option<String> {
    let mut reasons = Vec::new();
    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } = screen_share_decision
    {
        reasons.push(reason);
    }

    for status in protection_statuses {
        if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } =
            crate::screen_share::native_privacy_shield_decision_for_overlay_protection(status)
        {
            reasons.push(reason);
        }
    }

    if reasons.is_empty() {
        None
    } else {
        Some(format!(
            "{STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER} Startup privacy shield hid app windows. {}",
            reasons.join(" ")
        ))
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
    capture_exclusion_enabled: bool,
) -> anyhow::Result<OverlayWindowBounds> {
    use tauri::Manager;

    let capture_exclusion_enabled =
        enforce_capture_exclusion_setting(Some(capture_exclusion_enabled));
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| anyhow::anyhow!("Overlay window was not found."))?;

    let protection_status = protect_overlay_window(app, capture_exclusion_enabled);
    if let Some(message) = bounds_update_privacy_gate_message(
        &protection_status,
        crate::screen_share::native_privacy_shield_decision(
            crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
        ),
    ) {
        let _ = window.hide();
        let _ = set_companion_windows_visible(app, false, capture_exclusion_enabled);
        return Err(anyhow::anyhow!(message));
    }

    let bounds = sanitize_overlay_bounds(bounds);
    window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    window.set_size(PhysicalSize::new(bounds.width, bounds.height))?;
    let _ = protect_overlay_window(app, capture_exclusion_enabled);
    read_overlay_window_bounds(&window)
}

pub fn bounds_update_privacy_gate_message(
    protection_status: &OverlayProtectionStatus,
    screen_share_decision: crate::screen_share::NativePrivacyShieldDecision,
) -> Option<String> {
    let mut reasons = Vec::new();
    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } = screen_share_decision
    {
        reasons.push(reason);
    }

    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } =
        crate::screen_share::native_privacy_shield_decision_for_overlay_protection(
            protection_status,
        )
    {
        reasons.push(reason);
    }

    if reasons.is_empty() {
        None
    } else {
        Some(format!(
            "{BOUNDS_UPDATE_UNSAFE_PROTECTION_MARKER} {}",
            reasons.join(" ")
        ))
    }
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

pub fn protect_overlay_window(
    app: &tauri::AppHandle,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    use tauri::Manager;

    let capture_exclusion_enabled =
        enforce_capture_exclusion_setting(Some(capture_exclusion_enabled));
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
    let mut status = apply_capture_exclusion(&window, capture_exclusion_enabled);
    status.always_on_top = always_on_top;
    status.skip_taskbar = skip_taskbar;
    status.click_through = click_through;
    status.visible = visible;

    if let Some(message) =
        apply_capture_exclusion_to_companion_windows(app, capture_exclusion_enabled)
    {
        status.capture_exclusion = "failed".to_string();
        status.message = Some(match status.message {
            Some(existing) => format!("{existing} {message}"),
            None => message,
        });
    }

    if let Some(message) = protection_refresh_fail_closed_message(&status) {
        let mut messages = vec![message];
        if let Err(error) = window.hide() {
            messages.push(format!("Overlay fail-closed hide failed: {error}"));
        }
        messages.extend(hide_companion_windows_for_fail_closed(app));
        status.visible = false;
        status.message = Some(join_status_messages(status.message.take(), messages));
    }

    status
}

pub fn protection_refresh_fail_closed_message(status: &OverlayProtectionStatus) -> Option<String> {
    match crate::screen_share::native_privacy_shield_decision_for_overlay_protection(status) {
        crate::screen_share::NativePrivacyShieldDecision::Allow => None,
        crate::screen_share::NativePrivacyShieldDecision::Hide { reason } => {
            Some(format!("{PROTECTION_REFRESH_FAIL_CLOSED_MARKER} {reason}"))
        }
    }
}

fn join_status_messages(existing: Option<String>, additions: Vec<String>) -> String {
    existing
        .into_iter()
        .chain(additions)
        .filter(|message| !message.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn hide_companion_windows_for_fail_closed(app: &tauri::AppHandle) -> Vec<String> {
    use tauri::Manager;

    let mut failures = Vec::new();
    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        if let Err(error) = window.hide() {
            failures.push(format!("{label} window fail-closed hide failed: {error}"));
        }
    }
    failures
}

fn apply_capture_exclusion_to_companion_windows(
    app: &tauri::AppHandle,
    capture_exclusion_enabled: bool,
) -> Option<String> {
    use tauri::Manager;

    let capture_exclusion_enabled =
        enforce_capture_exclusion_setting(Some(capture_exclusion_enabled));
    let mut missing_required_windows = required_companion_window_labels();
    let mut protection_results = Vec::new();

    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        missing_required_windows.retain(|required| *required != label.as_str());

        let status = apply_capture_exclusion(&window, capture_exclusion_enabled);
        protection_results.push((label, status));
    }

    let status = companion_capture_exclusion_status(
        capture_exclusion_enabled,
        &protection_results,
        &missing_required_windows,
    );
    if status.capture_exclusion == "enabled" {
        None
    } else {
        Some(status.message.unwrap_or_else(|| {
            "Companion window capture exclusion could not be proven.".to_string()
        }))
    }
}

pub fn companion_capture_exclusion_status(
    capture_exclusion_enabled: bool,
    protection_results: &[(String, OverlayProtectionStatus)],
    missing_required_windows: &[&str],
) -> OverlayProtectionStatus {
    let mut failures = Vec::new();

    if capture_exclusion_enabled {
        for (label, status) in protection_results {
            if let Some(message) = companion_capture_exclusion_failure_message(label, status) {
                failures.push(message);
            }
        }
    }

    for label in missing_required_windows {
        failures.push(format!("{label} window was not found."));
    }

    if !failures.is_empty() {
        return capture_exclusion_failed_status(false, failures.join(" "));
    }

    if capture_exclusion_enabled {
        capture_exclusion_enabled_status(false)
    } else {
        capture_exclusion_disabled_status(false)
    }
}

fn companion_capture_exclusion_failure_message(
    label: &str,
    status: &OverlayProtectionStatus,
) -> Option<String> {
    match crate::screen_share::native_privacy_shield_decision_for_overlay_protection(status) {
        crate::screen_share::NativePrivacyShieldDecision::Allow => None,
        crate::screen_share::NativePrivacyShieldDecision::Hide { reason } => Some(format!(
            "{label} {COMPANION_UNSAFE_PROTECTION_MARKER} {reason}"
        )),
    }
}

pub fn set_companion_windows_visible(
    app: &tauri::AppHandle,
    visible: bool,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    use tauri::Manager;

    let capture_exclusion_enabled =
        enforce_capture_exclusion_setting(Some(capture_exclusion_enabled));
    let mut missing_required_windows = required_companion_window_labels();
    let mut companion_windows = Vec::new();
    let mut protection_results = Vec::new();

    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        missing_required_windows.retain(|required| *required != label.as_str());

        let protection = apply_capture_exclusion(&window, capture_exclusion_enabled);
        protection_results.push((label.clone(), protection));
        companion_windows.push((label, window));
    }

    let protection_status = companion_capture_exclusion_status(
        capture_exclusion_enabled,
        &protection_results,
        &missing_required_windows,
    );

    if visible {
        let gated_status = native_show_privacy_gate_status(
            visible,
            protection_status.clone(),
            crate::screen_share::native_privacy_shield_decision(
                crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
            ),
            "companion app windows",
        );

        if native_show_was_denied(&gated_status) {
            for (_, window) in &companion_windows {
                let _ = window.hide();
            }

            return companion_window_status(gated_status);
        }
    }

    let mut visibility_failures = Vec::new();
    for (label, window) in &companion_windows {
        if visible {
            let _ = window.unminimize();
            let repaired_before_show = repair_companion_window_bounds(app, window);
            let native_repaired_before_show = repair_native_companion_window_bounds_if_needed(
                app,
                window,
                companion_window_needs_native_activation(app),
            );
            let visibility_result = window.show();
            let repaired_after_show = repair_companion_window_bounds(app, window);
            let native_repaired_after_show = repair_native_companion_window_bounds_if_needed(
                app,
                window,
                companion_window_needs_native_activation(app),
            );
            if visibility_result.is_ok()
                && (repaired_before_show
                    || native_repaired_before_show
                    || repaired_after_show
                    || native_repaired_after_show)
            {
                focus_repaired_companion_window(app, window);
            }

            if let Err(error) = visibility_result {
                visibility_failures
                    .push(format!("{label} window visibility update failed: {error}"));
            }
            continue;
        }

        match window.hide() {
            Ok(()) => {}
            Err(error) => {
                visibility_failures
                    .push(format!("{label} window visibility update failed: {error}"));
            }
        }
    }

    if !visibility_failures.is_empty() {
        return companion_window_status(capture_exclusion_failed_status(
            visible,
            visibility_failures.join(" "),
        ));
    }

    if visible {
        let post_show_protection_results = companion_windows
            .iter()
            .map(|(label, window)| {
                (
                    label.clone(),
                    apply_capture_exclusion(window, capture_exclusion_enabled),
                )
            })
            .collect::<Vec<_>>();
        let post_show_status = companion_capture_exclusion_status(
            capture_exclusion_enabled,
            &post_show_protection_results,
            &missing_required_windows,
        );
        let post_show_screen_share_decision = crate::screen_share::native_privacy_shield_decision(
            crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
        );

        if let Some(message) = post_show_privacy_recheck_message(
            &post_show_status,
            post_show_screen_share_decision,
            COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER,
            COMPANION_POST_SHOW_SHARE_RISK_MARKER,
        ) {
            let mut messages = vec![message];
            for (label, window) in &companion_windows {
                if let Err(error) = window.hide() {
                    messages.push(format!("{label} window post-show hide failed: {error}"));
                }
            }

            let mut hidden_status = post_show_status;
            hidden_status.visible = false;
            hidden_status.message =
                Some(join_status_messages(hidden_status.message.take(), messages));
            return companion_window_status(hidden_status);
        }

        return companion_visibility_success_status(
            visible,
            capture_exclusion_enabled,
            post_show_status,
        );
    }

    companion_visibility_success_status(visible, capture_exclusion_enabled, protection_status)
}

pub fn companion_visibility_success_status(
    visible: bool,
    capture_exclusion_enabled: bool,
    protection_status: OverlayProtectionStatus,
) -> OverlayProtectionStatus {
    let protection_is_unsafe = matches!(
        crate::screen_share::native_privacy_shield_decision_for_overlay_protection(
            &protection_status
        ),
        crate::screen_share::NativePrivacyShieldDecision::Hide { .. }
    );
    let mut status = if protection_is_unsafe {
        protection_status
    } else if capture_exclusion_enabled {
        capture_exclusion_enabled_status(visible)
    } else {
        capture_exclusion_disabled_status(visible)
    };
    status.visible = visible && status.capture_exclusion == "enabled";
    if !visible {
        let mut messages =
            vec!["Companion app windows hidden because screen-share risk is active.".to_string()];
        if protection_is_unsafe {
            messages.push(COMPANION_HIDE_UNSAFE_PROTECTION_MARKER.to_string());
        }
        status.message = Some(join_status_messages(status.message.take(), messages));
    }
    companion_window_status(status)
}

pub fn focus_companion_windows(app: &tauri::AppHandle) {
    use tauri::Manager;

    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        let native_repaired = repair_native_companion_window_bounds_if_needed(
            app,
            &window,
            companion_window_needs_native_activation(app),
        );
        let _ = window.unminimize();
        let repaired = repair_companion_window_bounds(app, &window);
        if native_repaired || repaired {
            activate_app_for_companion_window_repair(app);
        }
        let _ = window.set_focus();
        let _ = repair_companion_window_bounds(app, &window);
    }
}

pub fn restore_companion_windows_after_clear_privacy_check(app: &tauri::AppHandle) {
    use tauri::Manager;

    std::hint::black_box(COMPANION_WINDOW_BACKGROUND_REPAIR_MARKER);

    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        let needs_native_activation = companion_window_needs_native_activation(app);
        let _ = window.unminimize();
        let repaired_before_show = repair_companion_window_bounds(app, &window);
        let native_repaired_before_show =
            repair_native_companion_window_bounds_if_needed(app, &window, needs_native_activation);
        let visibility_result = window.show();
        let repaired_after_show = repair_companion_window_bounds(app, &window);
        let native_repaired_after_show = repair_native_companion_window_bounds_if_needed(
            app,
            &window,
            companion_window_needs_native_activation(app),
        );
        if visibility_result.is_ok()
            && (needs_native_activation
                || repaired_before_show
                || native_repaired_before_show
                || repaired_after_show
                || native_repaired_after_show)
        {
            focus_repaired_companion_window(app, &window);
        }
    }
}

pub fn restore_companion_windows_after_share_risk_cleared(app: &tauri::AppHandle) {
    use tauri::Manager;

    std::hint::black_box(COMPANION_WINDOW_SHARE_RISK_CLEAR_REPAIR_MARKER);

    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        let _ = window.unminimize();
        let _ = repair_companion_window_bounds(app, &window);
        let _ = force_repair_companion_window_bounds(app, &window);
        let _ = window.show();
        let _ = force_repair_companion_window_bounds(app, &window);
        activate_app_for_companion_window_repair(app);
        let _ = window.set_focus();
        let _ = repair_companion_window_bounds(app, &window);
    }
}

pub fn restore_companion_windows_after_user_reopen(app: &tauri::AppHandle) {
    std::hint::black_box(COMPANION_WINDOW_REOPEN_PRIVACY_RESTORE_MARKER);

    let protection_status = protect_overlay_window(app, true);
    let screen_share_decision = crate::screen_share::native_privacy_shield_decision(
        crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
    );
    if matches!(
        crate::screen_share::native_privacy_shield_decision_for_overlay_protection(
            &protection_status
        ),
        crate::screen_share::NativePrivacyShieldDecision::Hide { .. }
    ) || matches!(
        screen_share_decision,
        crate::screen_share::NativePrivacyShieldDecision::Hide { .. }
    ) {
        let _ = set_overlay_window_visible(app, false, true);
        let _ = set_companion_windows_visible(app, false, true);
        return;
    }

    restore_companion_windows_after_share_risk_cleared(app);
    focus_companion_windows(app);
}

pub fn repair_companion_window_bounds_without_show(app: &tauri::AppHandle) {
    use tauri::Manager;

    std::hint::black_box(COMPANION_WINDOW_BACKGROUND_REPAIR_MARKER);
    std::hint::black_box(COMPANION_WINDOW_WATCHDOG_PRIVACY_PAUSE_MARKER);
    std::hint::black_box(COMPANION_WINDOW_WATCHDOG_VISIBLE_RESTORE_MARKER);

    if crate::screen_share::native_privacy_shield_share_risk_is_active() {
        return;
    }

    let mut needs_visible_restore = false;
    for (label, window) in app.webview_windows() {
        if !is_companion_window_label(&label) {
            continue;
        }

        let needs_native_activation = companion_window_needs_native_activation(app);
        needs_visible_restore = needs_visible_restore || needs_native_activation;
        let _ =
            repair_native_companion_window_bounds_if_needed(app, &window, needs_native_activation);
        let _ = repair_companion_window_bounds(app, &window);
    }

    if needs_visible_restore {
        restore_companion_windows_after_clear_privacy_check(app);
    }
}

pub fn start_companion_window_bounds_watchdog(app: tauri::AppHandle) -> anyhow::Result<()> {
    std::thread::Builder::new()
        .name("companion-window-bounds-watchdog".to_string())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(
                COMPANION_WINDOW_BOUNDS_WATCHDOG_INTERVAL_MS,
            ));
            let main_thread_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                repair_companion_window_bounds_without_show(&main_thread_app);
            });
        })
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("{error}"))
}

pub fn schedule_startup_companion_window_repair(app: tauri::AppHandle) {
    for delay_ms in STARTUP_COMPANION_WINDOW_REPAIR_DELAYS_MS {
        let worker_app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let main_thread_app = worker_app.clone();
            let _ = worker_app.run_on_main_thread(move || {
                let status = set_companion_windows_visible(&main_thread_app, true, true);
                if status.visible {
                    focus_companion_windows(&main_thread_app);
                }
            });
        });
    }
}

pub fn set_overlay_window_visible(
    app: &tauri::AppHandle,
    visible: bool,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    use tauri::Manager;

    let capture_exclusion_enabled =
        enforce_capture_exclusion_setting(Some(capture_exclusion_enabled));
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

    let mut status = protect_overlay_window(app, capture_exclusion_enabled);
    if visible {
        let gated_status = native_show_privacy_gate_status(
            visible,
            status.clone(),
            crate::screen_share::native_privacy_shield_decision(
                crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
            ),
            "the overlay",
        );

        if native_show_was_denied(&gated_status) {
            let _ = window.hide();
            let _ = set_companion_windows_visible(app, false, capture_exclusion_enabled);
            return gated_status;
        }
    }

    let visibility_result = if visible {
        window.show()
    } else {
        window.hide()
    };
    status.visible = visible && visibility_result.is_ok();

    if let Err(error) = visibility_result {
        status.message = Some(format!("Overlay visibility update failed: {error}"));
    }

    if visible && status.visible {
        let post_show_status = protect_overlay_window(app, capture_exclusion_enabled);
        let post_show_screen_share_decision = crate::screen_share::native_privacy_shield_decision(
            crate::screen_share::detect_screen_share_status_for_native_privacy_shield(),
        );
        if let Some(message) = post_show_privacy_recheck_message(
            &post_show_status,
            post_show_screen_share_decision,
            OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,
            OVERLAY_POST_SHOW_SHARE_RISK_MARKER,
        ) {
            let _ = window.hide();
            let _ = set_companion_windows_visible(app, false, capture_exclusion_enabled);
            let mut hidden_status = post_show_status;
            hidden_status.visible = false;
            hidden_status.message = Some(join_status_messages(
                hidden_status.message.take(),
                vec![message],
            ));
            return hidden_status;
        }

        return post_show_status;
    }

    status
}

pub fn native_show_privacy_gate_status(
    requested_visible: bool,
    mut status: OverlayProtectionStatus,
    screen_share_decision: crate::screen_share::NativePrivacyShieldDecision,
    target_name: &str,
) -> OverlayProtectionStatus {
    if !requested_visible {
        return status;
    }

    let mut reasons = Vec::new();
    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } = screen_share_decision
    {
        reasons.push(reason);
    }

    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } =
        crate::screen_share::native_privacy_shield_decision_for_overlay_protection(&status)
    {
        reasons.push(reason);
    }

    if reasons.is_empty() {
        return status;
    }

    status.visible = false;
    status.message = Some(format!(
        "Native privacy shield denied showing {target_name}. {}",
        reasons.join(" ")
    ));
    status
}

pub fn post_show_privacy_recheck_message(
    status: &OverlayProtectionStatus,
    screen_share_decision: crate::screen_share::NativePrivacyShieldDecision,
    capture_exclusion_marker: &str,
    screen_share_marker: &str,
) -> Option<String> {
    let mut reasons = Vec::new();

    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } = screen_share_decision
    {
        reasons.push(format!("{screen_share_marker} {reason}"));
    }

    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } =
        crate::screen_share::native_privacy_shield_decision_for_overlay_protection(status)
    {
        reasons.push(format!("{capture_exclusion_marker} {reason}"));
    }

    if reasons.is_empty() {
        None
    } else {
        Some(reasons.join(" "))
    }
}

fn companion_window_status(mut status: OverlayProtectionStatus) -> OverlayProtectionStatus {
    status.always_on_top = false;
    status.skip_taskbar = false;
    status.click_through = false;
    status
}

fn focus_repaired_companion_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    std::hint::black_box(COMPANION_WINDOW_FOREGROUND_REPAIR_MARKER);

    activate_app_for_companion_window_repair(app);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = repair_companion_window_bounds(app, window);
}

#[cfg(target_os = "macos")]
fn activate_app_for_companion_window_repair(app: &tauri::AppHandle) {
    std::hint::black_box(COMPANION_WINDOW_APP_ACTIVATION_REPAIR_MARKER);

    let _ = app.show();
    if !companion_window_app_activation_repair_is_due() {
        return;
    }

    let bundle_identifier = app.config().identifier.as_str();
    let _ = std::process::Command::new("open")
        .args(["-b", bundle_identifier])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

#[cfg(not(target_os = "macos"))]
fn activate_app_for_companion_window_repair(_app: &tauri::AppHandle) {
    std::hint::black_box(COMPANION_WINDOW_APP_ACTIVATION_REPAIR_MARKER);
}

#[cfg(target_os = "macos")]
fn companion_window_app_activation_repair_is_due() -> bool {
    let now = std::time::Instant::now();
    let lock = COMPANION_WINDOW_LAST_APP_ACTIVATION_REPAIR
        .get_or_init(|| std::sync::Mutex::new(None))
        .lock();
    let Ok(mut last_activation) = lock else {
        return true;
    };

    if last_activation.is_some_and(|last| {
        now.duration_since(last)
            < std::time::Duration::from_millis(COMPANION_WINDOW_APP_ACTIVATION_REPAIR_INTERVAL_MS)
    }) {
        return false;
    }

    *last_activation = Some(now);
    true
}

#[cfg(target_os = "macos")]
fn companion_window_needs_native_activation(app: &tauri::AppHandle) -> bool {
    let expected_title = app
        .config()
        .product_name
        .as_deref()
        .unwrap_or("Caveman")
        .to_string();

    macos_companion_cg_window_needs_activation(std::process::id(), &expected_title).unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn companion_window_needs_native_activation(_app: &tauri::AppHandle) -> bool {
    false
}

#[cfg(target_os = "macos")]
fn macos_companion_cg_window_needs_activation(
    process_id: u32,
    expected_title: &str,
) -> Option<bool> {
    use objc2_core_foundation::CFDictionary;
    use objc2_core_graphics::{CGWindowListCopyWindowInfo, CGWindowListOption};

    unsafe {
        let windows = CGWindowListCopyWindowInfo(
            CGWindowListOption::OptionAll | CGWindowListOption::ExcludeDesktopElements,
            0,
        )?;
        let process_id = i32::try_from(process_id).ok()?;

        for index in 0..windows.count() {
            let window_ref = windows.value_at_index(index) as *const CFDictionary;
            if window_ref.is_null() {
                continue;
            }

            let window = &*window_ref;
            if cf_number_i32(window, "kCGWindowOwnerPID").unwrap_or(-1) != process_id {
                continue;
            }
            if cf_string(window, "kCGWindowName").unwrap_or_default() != expected_title {
                continue;
            }
            if cf_number_i32(window, "kCGWindowSharingState").unwrap_or(-1) != 0 {
                continue;
            }

            let bounds = cf_rect(window, "kCGWindowBounds")?;
            let is_onscreen = cf_bool(window, "kCGWindowIsOnscreen").unwrap_or(false);
            return Some(
                !is_onscreen
                    || bounds.size.width < f64::from(COMPANION_WINDOW_MIN_WIDTH)
                    || bounds.size.height < f64::from(COMPANION_WINDOW_MIN_HEIGHT),
            );
        }
    }

    Some(true)
}

#[cfg(target_os = "macos")]
fn cf_value<T>(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<*const T> {
    unsafe {
        let key = objc2_core_foundation::CFString::from_str(key);
        let value =
            dictionary.value((key.as_ref() as *const objc2_core_foundation::CFString).cast());
        if value.is_null() {
            None
        } else {
            Some(value as *const T)
        }
    }
}

#[cfg(target_os = "macos")]
fn cf_string(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<String> {
    let value = cf_value::<objc2_core_foundation::CFString>(dictionary, key)?;
    Some(unsafe { (*value).to_string() })
}

#[cfg(target_os = "macos")]
fn cf_number_i32(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<i32> {
    let value = cf_value::<objc2_core_foundation::CFNumber>(dictionary, key)?;
    let mut output = 0_i32;
    let ok = unsafe {
        (*value).value(
            objc2_core_foundation::CFNumberType::IntType,
            (&mut output as *mut i32).cast(),
        )
    };
    ok.then_some(output)
}

#[cfg(target_os = "macos")]
fn cf_bool(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<bool> {
    let value = cf_value::<objc2_core_foundation::CFBoolean>(dictionary, key)?;
    Some(unsafe { (*value).value() })
}

#[cfg(target_os = "macos")]
fn cf_rect(
    dictionary: &objc2_core_foundation::CFDictionary,
    key: &str,
) -> Option<objc2_core_foundation::CGRect> {
    let value = cf_value::<objc2_core_foundation::CFDictionary>(dictionary, key)?;
    let mut rect = objc2_core_foundation::CGRect::default();
    let ok = unsafe {
        objc2_core_graphics::CGRectMakeWithDictionaryRepresentation(Some(&*value), &mut rect)
    };
    ok.then_some(rect)
}

fn repair_companion_window_bounds(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> bool {
    std::hint::black_box(COMPANION_WINDOW_BOUNDS_REPAIR_MARKER);

    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return false;
    };
    let scale_factor = window
        .scale_factor()
        .ok()
        .filter(|scale| *scale > 0.0)
        .unwrap_or_else(|| monitor.scale_factor());
    let logical_position = position.to_logical::<i32>(scale_factor);
    let logical_size = size.to_logical::<u32>(scale_factor);
    let logical_monitor_position = monitor.position().to_logical::<i32>(scale_factor);
    let logical_monitor_size = monitor.size().to_logical::<u32>(scale_factor);

    let current_bounds = OverlayWindowBounds {
        x: logical_position.x,
        y: logical_position.y,
        width: logical_size.width,
        height: logical_size.height,
        monitor_name: None,
    };
    let monitor_bounds = OverlayWindowBounds {
        x: logical_monitor_position.x,
        y: logical_monitor_position.y,
        width: logical_monitor_size.width,
        height: logical_monitor_size.height,
        monitor_name: monitor.name().cloned(),
    };
    let _ = window.set_min_size(Some(LogicalSize::new(
        COMPANION_WINDOW_MIN_WIDTH.min(monitor_bounds.width.max(1)),
        COMPANION_WINDOW_MIN_HEIGHT.min(monitor_bounds.height.max(1)),
    )));
    let repaired_bounds = sanitize_companion_window_bounds(current_bounds.clone(), monitor_bounds);
    if repaired_bounds == current_bounds {
        return false;
    }

    let size_result = window.set_size(LogicalSize::new(
        repaired_bounds.width,
        repaired_bounds.height,
    ));
    let position_result =
        window.set_position(LogicalPosition::new(repaired_bounds.x, repaired_bounds.y));
    size_result.is_ok() || position_result.is_ok()
}

fn repair_native_companion_window_bounds_if_needed(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    needed: bool,
) -> bool {
    if !needed {
        return false;
    }

    force_repair_companion_window_bounds(app, window)
}

fn force_repair_companion_window_bounds(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> bool {
    std::hint::black_box(COMPANION_WINDOW_NATIVE_BOUNDS_REPAIR_MARKER);

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return false;
    };
    let scale_factor = window
        .scale_factor()
        .ok()
        .filter(|scale| *scale > 0.0)
        .unwrap_or_else(|| monitor.scale_factor());
    let logical_monitor_position = monitor.position().to_logical::<i32>(scale_factor);
    let logical_monitor_size = monitor.size().to_logical::<u32>(scale_factor);
    let monitor_bounds = OverlayWindowBounds {
        x: logical_monitor_position.x,
        y: logical_monitor_position.y,
        width: logical_monitor_size.width,
        height: logical_monitor_size.height,
        monitor_name: monitor.name().cloned(),
    };
    let forced_bounds = sanitize_companion_window_bounds(
        OverlayWindowBounds {
            x: monitor_bounds.x,
            y: monitor_bounds.y,
            width: 0,
            height: 0,
            monitor_name: None,
        },
        monitor_bounds,
    );

    let _ = window.set_min_size(Some(LogicalSize::new(
        COMPANION_WINDOW_MIN_WIDTH.min(forced_bounds.width.max(1)),
        COMPANION_WINDOW_MIN_HEIGHT.min(forced_bounds.height.max(1)),
    )));
    let size_result = window.set_size(LogicalSize::new(forced_bounds.width, forced_bounds.height));
    let position_result =
        window.set_position(LogicalPosition::new(forced_bounds.x, forced_bounds.y));
    size_result.is_ok() || position_result.is_ok()
}

fn native_show_was_denied(status: &OverlayProtectionStatus) -> bool {
    status
        .message
        .as_deref()
        .is_some_and(|message| message.starts_with("Native privacy shield denied"))
}

fn required_companion_window_labels() -> Vec<&'static str> {
    protected_window_labels()
        .into_iter()
        .filter(|label| is_companion_window_label(label))
        .collect::<Vec<_>>()
}

pub fn sanitize_companion_window_bounds(
    bounds: OverlayWindowBounds,
    monitor: OverlayWindowBounds,
) -> OverlayWindowBounds {
    let min_width = COMPANION_WINDOW_MIN_WIDTH.min(monitor.width.max(1));
    let min_height = COMPANION_WINDOW_MIN_HEIGHT.min(monitor.height.max(1));
    let visible_width = intersect_extent(bounds.x, bounds.width, monitor.x, monitor.width);
    let visible_height = intersect_extent(bounds.y, bounds.height, monitor.y, monitor.height);
    let has_usable_size = bounds.width >= min_width && bounds.height >= min_height;
    let has_usable_visible_area = visible_width
        >= COMPANION_WINDOW_MIN_VISIBLE_WIDTH.min(min_width)
        && visible_height >= COMPANION_WINDOW_MIN_VISIBLE_HEIGHT.min(min_height);

    if has_usable_size && has_usable_visible_area {
        return bounds;
    }

    let width = COMPANION_WINDOW_DEFAULT_WIDTH.min(monitor.width.max(1));
    let height = COMPANION_WINDOW_DEFAULT_HEIGHT.min(monitor.height.max(1));
    let x = center_axis(monitor.x, monitor.width, width);
    let y = center_axis(monitor.y, monitor.height, height);

    OverlayWindowBounds {
        x,
        y,
        width,
        height,
        monitor_name: monitor.monitor_name,
    }
}

fn intersect_extent(a_origin: i32, a_size: u32, b_origin: i32, b_size: u32) -> u32 {
    let a_start = i64::from(a_origin);
    let a_end = a_start + i64::from(a_size);
    let b_start = i64::from(b_origin);
    let b_end = b_start + i64::from(b_size);
    let start = a_start.max(b_start);
    let end = a_end.min(b_end);
    end.saturating_sub(start).try_into().unwrap_or(u32::MAX)
}

fn center_axis(monitor_origin: i32, monitor_size: u32, window_size: u32) -> i32 {
    let offset = monitor_size.saturating_sub(window_size) / 2;
    monitor_origin.saturating_add(i32::try_from(offset).unwrap_or(i32::MAX))
}

#[cfg(target_os = "windows")]
fn apply_capture_exclusion(
    window: &tauri::WebviewWindow,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowDisplayAffinity, SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_MONITOR,
        WDA_NONE,
    };

    match window.hwnd() {
        Ok(hwnd) => {
            if !capture_exclusion_enabled {
                let ok = unsafe { SetWindowDisplayAffinity(hwnd, WDA_NONE) }.is_ok();
                let mut status = capture_exclusion_disabled_status(false);
                if !ok {
                    status.capture_exclusion = "failed".to_string();
                    status.message =
                        Some("Windows rejected disabling capture exclusion.".to_string());
                }
                return status;
            }

            let exclude_from_capture_ok =
                unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) }.is_ok();
            let exclude_from_capture_confirmed = if exclude_from_capture_ok {
                let mut affinity = 0u32;
                unsafe { GetWindowDisplayAffinity(hwnd, &mut affinity) }.is_ok()
                    && affinity == WDA_EXCLUDEFROMCAPTURE.0
            } else {
                false
            };
            if exclude_from_capture_confirmed {
                return windows_capture_exclusion_status(false, true, true, false, false);
            }

            let monitor_fallback_ok =
                unsafe { SetWindowDisplayAffinity(hwnd, WDA_MONITOR) }.is_ok();
            let monitor_fallback_confirmed = if monitor_fallback_ok {
                let mut affinity = 0u32;
                unsafe { GetWindowDisplayAffinity(hwnd, &mut affinity) }.is_ok()
                    && affinity == WDA_MONITOR.0
            } else {
                false
            };
            windows_capture_exclusion_status(
                false,
                exclude_from_capture_ok,
                exclude_from_capture_confirmed,
                monitor_fallback_ok,
                monitor_fallback_confirmed,
            )
        }
        Err(error) => capture_exclusion_failed_status(false, error.to_string()),
    }
}

pub fn windows_capture_exclusion_status(
    visible: bool,
    exclude_from_capture_set_ok: bool,
    exclude_from_capture_confirmed: bool,
    monitor_fallback_set_ok: bool,
    monitor_fallback_confirmed: bool,
) -> OverlayProtectionStatus {
    if exclude_from_capture_set_ok && exclude_from_capture_confirmed {
        return capture_exclusion_enabled_status(visible);
    }

    if monitor_fallback_set_ok && monitor_fallback_confirmed {
        let mut status = capture_exclusion_enabled_status(visible);
        status.message = Some(
            "Windows applied legacy WDA_MONITOR fallback; screen captures should blank the window instead of showing content."
                .to_string(),
        );
        return status;
    }

    capture_exclusion_failed_status(
        visible,
        if exclude_from_capture_set_ok || monitor_fallback_set_ok {
            "Windows display-affinity readback did not confirm capture exclusion.".to_string()
        } else {
            "Windows rejected WDA_EXCLUDEFROMCAPTURE and legacy WDA_MONITOR fallback.".to_string()
        },
    )
}

#[cfg(target_os = "macos")]
fn apply_capture_exclusion(
    window: &tauri::WebviewWindow,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    if !capture_exclusion_enabled {
        let mut status = capture_exclusion_disabled_status(false);
        if let Err(error) = window.set_content_protected(false) {
            status.capture_exclusion = "failed".to_string();
            status.message = Some(format!(
                "macOS rejected disabling content protection: {error}"
            ));
        }
        return status;
    }

    match window.set_content_protected(true) {
        Ok(()) => capture_exclusion_enabled_status(false),
        Err(error) => capture_exclusion_failed_status(
            false,
            format!("macOS rejected NSWindow content protection: {error}"),
        ),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_capture_exclusion(
    _window: &tauri::WebviewWindow,
    capture_exclusion_enabled: bool,
) -> OverlayProtectionStatus {
    if capture_exclusion_enabled {
        capture_exclusion_unavailable_status()
    } else {
        capture_exclusion_disabled_status(false)
    }
}

pub fn capture_exclusion_enabled_status(visible: bool) -> OverlayProtectionStatus {
    OverlayProtectionStatus {
        always_on_top: true,
        skip_taskbar: true,
        capture_exclusion: "enabled".to_string(),
        click_through: false,
        visible,
        message: None,
    }
}

pub fn capture_exclusion_disabled_status(visible: bool) -> OverlayProtectionStatus {
    OverlayProtectionStatus {
        always_on_top: true,
        skip_taskbar: true,
        capture_exclusion: "disabled".to_string(),
        click_through: false,
        visible,
        message: Some("Capture exclusion is disabled in Security settings.".to_string()),
    }
}

pub fn capture_exclusion_unavailable_status() -> OverlayProtectionStatus {
    OverlayProtectionStatus {
        always_on_top: true,
        skip_taskbar: true,
        capture_exclusion: "unsupported".to_string(),
        click_through: false,
        visible: false,
        message: Some(
            "Capture exclusion is only implemented on Windows and macOS in this build.".to_string(),
        ),
    }
}

fn capture_exclusion_failed_status(visible: bool, message: String) -> OverlayProtectionStatus {
    OverlayProtectionStatus {
        always_on_top: true,
        skip_taskbar: true,
        capture_exclusion: "failed".to_string(),
        click_through: false,
        visible,
        message: Some(message),
    }
}

#[cfg(test)]
mod mod_test;
