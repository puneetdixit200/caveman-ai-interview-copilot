use super::{
    capture_exclusion_disabled_status, capture_exclusion_enabled_status,
    capture_exclusion_unavailable_status, is_overlay_window_label, protected_window_labels,
    sanitize_overlay_bounds, OverlayProtectionStatus, OverlayWindowBounds,
};

#[test]
fn reports_unavailable_capture_exclusion_for_unsupported_platforms() {
    let status = capture_exclusion_unavailable_status();

    assert_eq!(
        status,
        OverlayProtectionStatus {
            always_on_top: true,
            skip_taskbar: true,
            capture_exclusion: "unsupported".to_string(),
            click_through: false,
            visible: false,
            message: Some(
                "Capture exclusion is only implemented on Windows and macOS in this build."
                    .to_string()
            )
        }
    );
}

#[test]
fn reports_enabled_capture_exclusion_when_platform_api_accepts_request() {
    let status = capture_exclusion_enabled_status(false);

    assert_eq!(status.capture_exclusion, "enabled");
    assert!(!status.visible);
    assert!(status.message.is_none());
}

#[test]
fn reports_disabled_capture_exclusion_when_user_turns_it_off() {
    let status = capture_exclusion_disabled_status(false);

    assert_eq!(status.capture_exclusion, "disabled");
    assert!(!status.visible);
    assert!(status.message.unwrap().contains("disabled"));
}

#[test]
fn sanitizes_overlay_bounds_without_breaking_multi_monitor_coordinates() {
    let bounds = sanitize_overlay_bounds(OverlayWindowBounds {
        x: -1920,
        y: 40,
        width: 100,
        height: 90,
        monitor_name: Some("Left Display".to_string()),
    });

    assert_eq!(
        bounds,
        OverlayWindowBounds {
            x: -1920,
            y: 40,
            width: 320,
            height: 180,
            monitor_name: Some("Left Display".to_string()),
        }
    );
}

#[test]
fn protects_both_dashboard_and_overlay_windows_from_capture() {
    assert_eq!(protected_window_labels(), ["main", "overlay"]);
}

#[test]
fn applies_overlay_specific_chrome_only_to_overlay_window() {
    assert!(is_overlay_window_label("overlay"));
    assert!(!is_overlay_window_label("main"));
    assert!(!is_overlay_window_label("settings"));
}
