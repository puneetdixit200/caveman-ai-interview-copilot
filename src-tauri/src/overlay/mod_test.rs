use super::{
    bounds_update_privacy_gate_message, capture_exclusion_disabled_status,
    capture_exclusion_enabled_status, capture_exclusion_unavailable_status,
    companion_capture_exclusion_status, companion_visibility_success_status,
    enforce_capture_exclusion_setting, is_companion_window_label, is_overlay_window_label,
    native_show_privacy_gate_status, post_show_privacy_recheck_message, protected_window_labels,
    protection_refresh_fail_closed_message, sanitize_companion_window_bounds,
    sanitize_overlay_bounds, startup_privacy_shield_hide_reason, windows_capture_exclusion_status,
    OverlayProtectionStatus, OverlayWindowBounds, BOUNDS_UPDATE_UNSAFE_PROTECTION_MARKER,
    COMPANION_HIDE_UNSAFE_PROTECTION_MARKER, COMPANION_POST_SHOW_SHARE_RISK_MARKER,
    COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER, COMPANION_UNSAFE_PROTECTION_MARKER,
    COMPANION_WINDOW_APP_ACTIVATION_REPAIR_MARKER, COMPANION_WINDOW_BACKGROUND_REPAIR_MARKER,
    COMPANION_WINDOW_BOUNDS_REPAIR_MARKER, COMPANION_WINDOW_BOUNDS_WATCHDOG_INTERVAL_MS,
    COMPANION_WINDOW_FOREGROUND_REPAIR_MARKER, COMPANION_WINDOW_SHARE_RISK_CLEAR_REPAIR_MARKER,
    OVERLAY_POST_SHOW_SHARE_RISK_MARKER, OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,
    PROTECTION_REFRESH_FAIL_CLOSED_MARKER, STARTUP_COMPANION_WINDOW_REPAIR_DELAYS_MS,
    STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER,
};
use crate::screen_share::NativePrivacyShieldDecision;

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
fn forces_capture_exclusion_on_even_when_callers_request_disabled() {
    assert!(enforce_capture_exclusion_setting(None));
    assert!(enforce_capture_exclusion_setting(Some(true)));
    assert!(enforce_capture_exclusion_setting(Some(false)));
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
fn repairs_tiny_offscreen_companion_window_to_centered_monitor_bounds() {
    assert!(COMPANION_WINDOW_BOUNDS_REPAIR_MARKER.contains("bounds are repaired"));
    assert!(COMPANION_WINDOW_BACKGROUND_REPAIR_MARKER.contains("restored and repaired"));
    assert!(COMPANION_WINDOW_FOREGROUND_REPAIR_MARKER.contains("unusable bounds need repair"));
    assert!(COMPANION_WINDOW_APP_ACTIVATION_REPAIR_MARKER.contains("reactivates the app"));
    assert!(COMPANION_WINDOW_SHARE_RISK_CLEAR_REPAIR_MARKER.contains("screen-share risk clears"));
    assert_eq!(STARTUP_COMPANION_WINDOW_REPAIR_DELAYS_MS, [150, 600, 1_500]);
    assert_eq!(COMPANION_WINDOW_BOUNDS_WATCHDOG_INTERVAL_MS, 500);

    let repaired = sanitize_companion_window_bounds(
        OverlayWindowBounds {
            x: -233,
            y: 423,
            width: 168,
            height: 142,
            monitor_name: None,
        },
        OverlayWindowBounds {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
            monitor_name: Some("Built-in Display".to_string()),
        },
    );

    assert_eq!(
        repaired,
        OverlayWindowBounds {
            x: 80,
            y: 40,
            width: 1280,
            height: 820,
            monitor_name: Some("Built-in Display".to_string()),
        }
    );
}

#[test]
fn preserves_usable_companion_window_on_secondary_monitor() {
    let bounds = OverlayWindowBounds {
        x: -1800,
        y: 80,
        width: 1100,
        height: 760,
        monitor_name: None,
    };

    let repaired = sanitize_companion_window_bounds(
        bounds.clone(),
        OverlayWindowBounds {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
            monitor_name: Some("Left Display".to_string()),
        },
    );

    assert_eq!(repaired, bounds);
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

#[test]
fn treats_every_non_overlay_window_as_sensitive_companion_window() {
    assert!(is_companion_window_label("main"));
    assert!(is_companion_window_label("settings"));
    assert!(!is_companion_window_label("overlay"));
}

#[test]
fn reports_enabled_capture_exclusion_when_windows_uses_legacy_monitor_fallback() {
    let status = windows_capture_exclusion_status(false, false, false, true, true);

    assert_eq!(status.capture_exclusion, "enabled");
    assert!(status
        .message
        .unwrap()
        .contains("legacy WDA_MONITOR fallback"));
}

#[test]
fn windows_capture_exclusion_fails_closed_when_readback_does_not_confirm_exclusion() {
    let status = windows_capture_exclusion_status(false, true, false, false, false);

    assert_eq!(status.capture_exclusion, "failed");
    assert!(status
        .message
        .unwrap()
        .contains("Windows display-affinity readback did not confirm capture exclusion"));
}

#[test]
fn native_visibility_gate_blocks_show_when_share_or_capture_risk_is_active() {
    let protected = capture_exclusion_enabled_status(false);

    let blocked_by_share = native_show_privacy_gate_status(
        true,
        protected,
        NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        },
        "the overlay",
    );

    assert_eq!(blocked_by_share.capture_exclusion, "enabled");
    assert!(!blocked_by_share.visible);
    assert!(blocked_by_share
        .message
        .unwrap()
        .contains("Native privacy shield denied showing the overlay"));

    let blocked_by_capture = native_show_privacy_gate_status(
        true,
        capture_exclusion_disabled_status(false),
        NativePrivacyShieldDecision::Allow,
        "the overlay",
    );

    assert_eq!(blocked_by_capture.capture_exclusion, "disabled");
    assert!(!blocked_by_capture.visible);
    assert!(blocked_by_capture
        .message
        .unwrap()
        .contains("Capture exclusion is not enforced"));
}

#[test]
fn native_visibility_gate_names_companion_windows_when_blocking_companion_show() {
    let blocked = native_show_privacy_gate_status(
        true,
        capture_exclusion_enabled_status(false),
        NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        },
        "companion app windows",
    );

    assert!(!blocked.visible);
    assert!(blocked
        .message
        .unwrap()
        .contains("Native privacy shield denied showing companion app windows"));
}

#[test]
fn startup_privacy_shield_hides_when_screen_share_is_already_running() {
    let reason = startup_privacy_shield_hide_reason(
        &[capture_exclusion_enabled_status(false)],
        NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        },
    )
    .expect("startup should hide when a screen-share process is already active");

    assert!(reason.contains("Known screen-sharing or recording process is running"));
    assert!(reason.contains(STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER));
}

#[test]
fn startup_privacy_shield_hides_when_capture_exclusion_is_not_proven() {
    let reason = startup_privacy_shield_hide_reason(
        &[capture_exclusion_unavailable_status()],
        NativePrivacyShieldDecision::Allow,
    )
    .expect("startup should hide when OS capture exclusion is unsupported");

    assert!(reason.contains("Capture exclusion is not enforced"));
    assert!(reason.contains("unsupported"));
    assert!(reason.contains(STARTUP_PRIVACY_SHIELD_DENIED_INITIAL_SHOW_MARKER));
}

#[test]
fn startup_privacy_shield_allows_when_capture_exclusion_is_enabled_and_share_is_clear() {
    assert_eq!(
        startup_privacy_shield_hide_reason(
            &[capture_exclusion_enabled_status(false)],
            NativePrivacyShieldDecision::Allow,
        ),
        None
    );
}

#[test]
fn protection_refresh_fails_closed_when_capture_exclusion_is_not_proven() {
    let message = protection_refresh_fail_closed_message(&capture_exclusion_unavailable_status())
        .expect("protection refresh should fail closed when capture exclusion is unavailable");

    assert!(message.contains(PROTECTION_REFRESH_FAIL_CLOSED_MARKER));
    assert!(message.contains("Capture exclusion is not enforced"));
    assert!(message.contains("unsupported"));
}

#[test]
fn protection_refresh_allows_when_capture_exclusion_is_enabled() {
    assert_eq!(
        protection_refresh_fail_closed_message(&capture_exclusion_enabled_status(false)),
        None
    );
}

#[test]
fn bounds_update_gate_blocks_when_share_or_capture_risk_is_active() {
    let blocked_by_share = bounds_update_privacy_gate_message(
        &capture_exclusion_enabled_status(false),
        NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        },
    )
    .expect("bounds update should be denied during screen-share risk");

    assert!(blocked_by_share.contains(BOUNDS_UPDATE_UNSAFE_PROTECTION_MARKER));
    assert!(blocked_by_share.contains("Known screen-sharing or recording process"));

    let blocked_by_capture = bounds_update_privacy_gate_message(
        &capture_exclusion_unavailable_status(),
        NativePrivacyShieldDecision::Allow,
    )
    .expect("bounds update should be denied when capture exclusion is not proven");

    assert!(blocked_by_capture.contains(BOUNDS_UPDATE_UNSAFE_PROTECTION_MARKER));
    assert!(blocked_by_capture.contains("Capture exclusion is not enforced"));
    assert!(blocked_by_capture.contains("unsupported"));
}

#[test]
fn bounds_update_gate_allows_when_share_clear_and_capture_exclusion_enabled() {
    assert_eq!(
        bounds_update_privacy_gate_message(
            &capture_exclusion_enabled_status(false),
            NativePrivacyShieldDecision::Allow,
        ),
        None
    );
}

#[test]
fn post_show_privacy_recheck_blocks_when_capture_exclusion_is_not_proven() {
    let overlay_message = post_show_privacy_recheck_message(
        &capture_exclusion_unavailable_status(),
        NativePrivacyShieldDecision::Allow,
        OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,
        OVERLAY_POST_SHOW_SHARE_RISK_MARKER,
    )
    .expect("overlay show must be reverted when post-show protection is unsafe");

    assert!(overlay_message.contains(OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER));
    assert!(overlay_message.contains("Capture exclusion is not enforced"));
    assert!(overlay_message.contains("unsupported"));

    let companion_message = post_show_privacy_recheck_message(
        &capture_exclusion_disabled_status(true),
        NativePrivacyShieldDecision::Allow,
        COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER,
        COMPANION_POST_SHOW_SHARE_RISK_MARKER,
    )
    .expect("companion show must be reverted when post-show protection is unsafe");

    assert!(companion_message.contains(COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER));
    assert!(companion_message.contains("Capture exclusion is not enforced"));
    assert!(companion_message.contains("disabled"));
}

#[test]
fn post_show_privacy_recheck_blocks_when_screen_share_risk_appears_after_show() {
    let overlay_message = post_show_privacy_recheck_message(
        &capture_exclusion_enabled_status(true),
        NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        },
        OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,
        OVERLAY_POST_SHOW_SHARE_RISK_MARKER,
    )
    .expect("overlay show must be reverted when screen-share risk appears after show");

    assert!(overlay_message.contains(OVERLAY_POST_SHOW_SHARE_RISK_MARKER));
    assert!(overlay_message.contains("Known screen-sharing or recording process"));

    let companion_message = post_show_privacy_recheck_message(
        &capture_exclusion_enabled_status(true),
        NativePrivacyShieldDecision::Hide {
            reason: "Screen-share guard failed closed: tasklist failed".to_string(),
        },
        COMPANION_POST_SHOW_UNSAFE_PROTECTION_MARKER,
        COMPANION_POST_SHOW_SHARE_RISK_MARKER,
    )
    .expect("companion show must be reverted when screen-share guard fails after show");

    assert!(companion_message.contains(COMPANION_POST_SHOW_SHARE_RISK_MARKER));
    assert!(companion_message.contains("Screen-share guard failed closed"));
}

#[test]
fn post_show_privacy_recheck_allows_when_capture_exclusion_is_enabled() {
    assert_eq!(
        post_show_privacy_recheck_message(
            &capture_exclusion_enabled_status(true),
            NativePrivacyShieldDecision::Allow,
            OVERLAY_POST_SHOW_UNSAFE_PROTECTION_MARKER,
            OVERLAY_POST_SHOW_SHARE_RISK_MARKER,
        ),
        None
    );
}

#[test]
fn hidden_companion_windows_preserve_unsafe_capture_status() {
    let status =
        companion_visibility_success_status(false, true, capture_exclusion_unavailable_status());

    assert_eq!(status.capture_exclusion, "unsupported");
    assert!(!status.visible);
    let message = status.message.unwrap();
    assert!(message.contains("Capture exclusion is only implemented"));
    assert!(message.contains(COMPANION_HIDE_UNSAFE_PROTECTION_MARKER));
}

#[test]
fn hidden_companion_windows_do_not_report_unsafe_when_protection_is_enabled() {
    let status =
        companion_visibility_success_status(false, true, capture_exclusion_enabled_status(false));

    assert_eq!(status.capture_exclusion, "enabled");
    assert!(!status.visible);
    assert!(!status
        .message
        .unwrap()
        .contains(COMPANION_HIDE_UNSAFE_PROTECTION_MARKER));
}

#[test]
fn companion_capture_exclusion_fails_closed_for_unsupported_protection() {
    let protection_results = vec![("main".to_string(), capture_exclusion_unavailable_status())];

    let status = companion_capture_exclusion_status(true, &protection_results, &[]);

    assert_eq!(status.capture_exclusion, "failed");
    let message = status.message.unwrap();
    assert!(message.contains(COMPANION_UNSAFE_PROTECTION_MARKER));
    assert!(message.contains("Capture exclusion is not enforced"));
    assert!(message.contains("unsupported"));
}

#[test]
fn companion_capture_exclusion_fails_closed_for_disabled_protection() {
    let protection_results = vec![("main".to_string(), capture_exclusion_disabled_status(false))];

    let status = companion_capture_exclusion_status(true, &protection_results, &[]);

    assert_eq!(status.capture_exclusion, "failed");
    let message = status.message.unwrap();
    assert!(message.contains(COMPANION_UNSAFE_PROTECTION_MARKER));
    assert!(message.contains("disabled"));
}

#[test]
fn companion_capture_exclusion_requires_required_companion_windows() {
    let status = companion_capture_exclusion_status(true, &[], &["main"]);

    assert_eq!(status.capture_exclusion, "failed");
    assert!(status
        .message
        .unwrap()
        .contains("main window was not found"));
}
