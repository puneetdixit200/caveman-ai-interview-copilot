use serde::Serialize;
use std::{thread, time::Duration};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareProcess {
    pub name: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareStatus {
    pub active: bool,
    pub matched_processes: Vec<ScreenShareProcess>,
    pub message: Option<String>,
}

const NATIVE_PRIVACY_SHIELD_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, PartialEq)]
pub enum NativePrivacyShieldDecision {
    Allow,
    Hide { reason: String },
}

const WATCHED_SCREEN_SHARE_PROCESSES: &[&str] = &[
    // Native meeting and huddle apps.
    "zoom.exe",
    "zoom.us",
    "teams.exe",
    "teams",
    "ms-teams.exe",
    "microsoft teams",
    "microsoft teams helper",
    "msteams",
    "discord.exe",
    "discord",
    "slack.exe",
    "slack",
    "skype.exe",
    "skype",
    "webexmta.exe",
    "webex",
    "ciscocollabhost.exe",
    "cisco webex meetings",
    "gotomeeting.exe",
    "gotomeeting",
    "g2mcomm.exe",
    "g2mstart.exe",
    "bluejeans.exe",
    "bluejeans",
    "ringcentral.exe",
    "ringcentral",
    "ringcentral meetings",
    "jitsi.exe",
    "jitsi",
    "jitsi meet",
    "join.me.exe",
    "join.me",
    "around.exe",
    "around",
    "mmhmm.exe",
    "mmhmm",
    "telegram.exe",
    "telegram",
    "whatsapp.exe",
    "whatsapp",
    "signal.exe",
    "signal",
    "lark.exe",
    "lark",
    "feishu",
    "dingtalk.exe",
    "dingtalk",
    "facetime",
    "google meet",
    // Browser shells used by Google Meet, browser Teams, Webex, HackerRank, etc.
    "chrome.exe",
    "chrome",
    "google chrome",
    "google chrome helper",
    "google chrome helper (renderer)",
    "msedge.exe",
    "microsoft edge",
    "firefox.exe",
    "firefox",
    "safari",
    "safari web content",
    "brave.exe",
    "brave browser",
    "arc",
    "arc helper",
    "opera.exe",
    "opera",
    "vivaldi.exe",
    "vivaldi",
    // Recording and broadcast tools that can expose overlays outside meeting apps.
    "obs64.exe",
    "obs32.exe",
    "obs",
    "streamlabs obs",
    "streamlabs desktop",
    "quicktime player",
    "quicktimeplayerx",
    "loom.exe",
    "loom",
    "camtasia.exe",
    "camtasia",
    "snagit32.exe",
    "snagit64.exe",
    "snagit",
    "screenflow",
    "xsplit.core.exe",
    "xsplit",
    "sharex.exe",
    "bandicam.exe",
    // Remote desktop and support tools also expose the overlay to another viewer.
    "teamviewer.exe",
    "teamviewer",
    "anydesk.exe",
    "anydesk",
    "rustdesk.exe",
    "rustdesk",
    "remoting_host.exe",
    "chrome remote desktop",
    "screen sharing",
    "screensharingagent",
    "screensharingd",
    "vncviewer.exe",
    "vnc viewer",
    "vncserver.exe",
    "vnc server",
    "parsecd.exe",
    "parsec.exe",
    "parsec",
    "splashtop streamer",
    "srserver.exe",
    "quickassist.exe",
    "msra.exe",
    "mstsc.exe",
    "msrdc.exe",
    "msrdcw.exe",
    "remotehelp.exe",
    "logmein.exe",
    "logmein",
    "logmeinrescue.exe",
    "lmi_rescue.exe",
    "goto opener.exe",
    "bomgar-scc.exe",
    "bomgar-rep.exe",
    "beyondtrust",
    "jump desktop",
    "jumpdesktopconnect",
    "nomachine",
    "nxplayer",
    "nxserver",
    "connectwisecontrol.client.exe",
    "screenconnect.clientservice.exe",
    // Local capture tools are treated as sharing risk when auto-hide is enabled.
    "snippingtool.exe",
    "screenclippinghost.exe",
    "gamebar.exe",
    "gamebarpresencewriter.exe",
    "nvidia share.exe",
    "nvidia broadcast.exe",
    "screenrec.exe",
    "screenrec",
    "cleanshot x",
    "kap",
    "screen studio",
    "screenpresso.exe",
    "camtasiarecorder.exe",
    "techsmith capture",
    "ecamm live",
];

pub fn detect_screen_share_status() -> anyhow::Result<ScreenShareStatus> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Could not query running processes for screen-share guard"
            ));
        }

        return Ok(screen_share_status_for_processes(parse_tasklist_csv(
            &String::from_utf8_lossy(&output.stdout),
        )));
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("ps")
            .args(["-axo", "pid=,comm="])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Could not query running processes for screen-share guard"
            ));
        }

        return Ok(screen_share_status_for_processes(parse_unix_process_list(
            &String::from_utf8_lossy(&output.stdout),
        )));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: Some(
                "Screen-share process guard is only implemented on Windows and macOS in this build."
                    .to_string(),
            ),
        })
    }
}

pub fn native_privacy_shield_decision(
    status: anyhow::Result<ScreenShareStatus>,
) -> NativePrivacyShieldDecision {
    match status {
        Ok(status) if status.active => NativePrivacyShieldDecision::Hide {
            reason: status.message.unwrap_or_else(|| {
                "Known screen-sharing or recording process is running.".to_string()
            }),
        },
        Ok(status) if screen_share_guard_is_unsupported(&status) => {
            NativePrivacyShieldDecision::Hide {
                reason: "Screen-share guard is not available on this platform.".to_string(),
            }
        }
        Ok(_) => NativePrivacyShieldDecision::Allow,
        Err(error) => NativePrivacyShieldDecision::Hide {
            reason: format!("Screen-share guard failed closed: {error}"),
        },
    }
}

fn screen_share_guard_is_unsupported(status: &ScreenShareStatus) -> bool {
    status
        .message
        .as_deref()
        .is_some_and(|message| message.contains("only implemented on Windows and macOS"))
}

pub fn native_privacy_shield_decision_for_overlay_protection(
    status: &crate::overlay::OverlayProtectionStatus,
) -> NativePrivacyShieldDecision {
    if status.capture_exclusion == "enabled" {
        return NativePrivacyShieldDecision::Allow;
    }

    let detail = status
        .message
        .as_deref()
        .unwrap_or("capture exclusion reported an unsafe state");

    NativePrivacyShieldDecision::Hide {
        reason: format!(
            "Capture exclusion is not enforced: {}. {detail}",
            status.capture_exclusion
        ),
    }
}

pub fn start_native_privacy_shield(app: tauri::AppHandle) {
    let _ = thread::Builder::new()
        .name("screen-share-privacy-shield".to_string())
        .spawn(move || loop {
            match native_privacy_shield_decision(detect_screen_share_status()) {
                NativePrivacyShieldDecision::Allow => {
                    let status = crate::overlay::protect_overlay_window(&app, true);
                    if matches!(
                        native_privacy_shield_decision_for_overlay_protection(&status),
                        NativePrivacyShieldDecision::Hide { .. }
                    ) {
                        hide_app_windows_for_native_privacy_shield(&app);
                    }
                }
                NativePrivacyShieldDecision::Hide { .. } => {
                    hide_app_windows_for_native_privacy_shield(&app);
                }
            }

            thread::sleep(NATIVE_PRIVACY_SHIELD_INTERVAL);
        });
}

fn hide_app_windows_for_native_privacy_shield(app: &tauri::AppHandle) {
    let _ = crate::overlay::set_overlay_window_visible(app, false, true);
    let _ = crate::overlay::set_companion_windows_visible(app, false, true);
}

fn screen_share_status_for_processes(processes: Vec<ScreenShareProcess>) -> ScreenShareStatus {
    let matched_processes = processes
        .into_iter()
        .filter(|process| is_watched_screen_share_process(&process.name))
        .collect::<Vec<_>>();

    ScreenShareStatus {
        active: !matched_processes.is_empty(),
        message: if matched_processes.is_empty() {
            None
        } else {
            Some("Known screen-sharing or recording process is running.".to_string())
        },
        matched_processes,
    }
}

fn is_watched_screen_share_process(name: &str) -> bool {
    let normalized = normalize_process_name(name);
    WATCHED_SCREEN_SHARE_PROCESSES
        .iter()
        .any(|candidate| process_name_matches_candidate(&normalized, candidate))
}

fn process_name_matches_candidate(normalized: &str, candidate: &str) -> bool {
    normalized == candidate
        || normalized.strip_prefix(candidate).is_some_and(|suffix| {
            matches!(suffix.as_bytes().first(), Some(b' ' | b'(' | b'-' | b'.'))
        })
}

fn normalize_process_name(name: &str) -> String {
    let trimmed = name.trim();
    trimmed
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(trimmed)
        .to_ascii_lowercase()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_tasklist_csv(output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let columns = parse_csv_line(line);
            let name = columns.first()?.trim().to_string();
            if name.is_empty() {
                return None;
            }

            let pid = columns
                .get(1)
                .and_then(|value| value.trim().parse::<u32>().ok());
            Some(ScreenShareProcess { name, pid })
        })
        .collect()
}

fn parse_unix_process_list(output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let (pid, name) = line.trim().split_once(char::is_whitespace)?;
            let name = name.trim().to_string();
            if name.is_empty() {
                return None;
            }

            Some(ScreenShareProcess {
                name,
                pid: pid.trim().parse::<u32>().ok(),
            })
        })
        .collect()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                current.push('"');
                let _ = chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    values.push(current.trim().to_string());
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_known_screen_share_processes_from_tasklist_output() {
        let processes = parse_tasklist_csv(
            "\"zoom.exe\",\"4242\",\"Console\",\"1\",\"118,000 K\"\n\"notepad.exe\",\"7\",\"Console\",\"1\",\"8,000 K\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "zoom.exe".to_string(),
                pid: Some(4242)
            }]
        );
    }

    #[test]
    fn detects_known_screen_share_processes_from_unix_process_list() {
        let processes = parse_unix_process_list(
            " 4242 /Applications/zoom.us.app/Contents/MacOS/zoom.us\n  77 /Applications/Notes.app/Contents/MacOS/Notes",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "/Applications/zoom.us.app/Contents/MacOS/zoom.us".to_string(),
                pid: Some(4242)
            }]
        );
    }

    #[test]
    fn detects_browser_based_meeting_and_recording_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string(),
                pid: Some(1001),
            },
            ScreenShareProcess {
                name: "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams".to_string(),
                pid: Some(1002),
            },
            ScreenShareProcess {
                name: "/Applications/Safari.app/Contents/MacOS/Safari".to_string(),
                pid: Some(1003),
            },
            ScreenShareProcess {
                name: "QuickTime Player".to_string(),
                pid: Some(1004),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1001), Some(1002), Some(1003), Some(1004)]
        );
    }

    #[test]
    fn detects_meeting_browser_and_recorder_helper_process_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: "/Applications/Microsoft Teams.app/Contents/Frameworks/Microsoft Teams Helper (Renderer).app/Contents/MacOS/Microsoft Teams Helper (Renderer)".to_string(),
                pid: Some(1101),
            },
            ScreenShareProcess {
                name: "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU)".to_string(),
                pid: Some(1102),
            },
            ScreenShareProcess {
                name: "/Applications/OBS.app/Contents/Frameworks/OBS Helper (Renderer).app/Contents/MacOS/OBS Helper (Renderer)".to_string(),
                pid: Some(1103),
            },
            ScreenShareProcess {
                name: "Google Meet".to_string(),
                pid: Some(1104),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1101), Some(1102), Some(1103), Some(1104)]
        );
    }

    #[test]
    fn detects_remote_support_and_secondary_meeting_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\GoToMeeting\\g2mcomm.exe".to_string(),
                pid: Some(2001),
            },
            ScreenShareProcess {
                name: "/Applications/TeamViewer.app/Contents/MacOS/TeamViewer".to_string(),
                pid: Some(2002),
            },
            ScreenShareProcess {
                name: "AnyDesk.exe".to_string(),
                pid: Some(2003),
            },
            ScreenShareProcess {
                name: "/System/Library/CoreServices/Applications/Screen Sharing.app/Contents/MacOS/Screen Sharing".to_string(),
                pid: Some(2004),
            },
            ScreenShareProcess {
                name: "remoting_host.exe".to_string(),
                pid: Some(2005),
            },
            ScreenShareProcess {
                name: "/Applications/RustDesk.app/Contents/MacOS/RustDesk".to_string(),
                pid: Some(2006),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(2001),
                Some(2002),
                Some(2003),
                Some(2004),
                Some(2005),
                Some(2006)
            ]
        );
    }

    #[test]
    fn detects_additional_meeting_remote_assistance_and_capture_tools() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Users\\candidate\\AppData\\Local\\RingCentral\\RingCentral.exe"
                    .to_string(),
                pid: Some(3001),
            },
            ScreenShareProcess {
                name: "/Applications/Jitsi Meet.app/Contents/MacOS/Jitsi Meet".to_string(),
                pid: Some(3002),
            },
            ScreenShareProcess {
                name: "WhatsApp.exe".to_string(),
                pid: Some(3003),
            },
            ScreenShareProcess {
                name: r"C:\\Windows\\System32\\QuickAssist.exe".to_string(),
                pid: Some(3004),
            },
            ScreenShareProcess {
                name: "msra.exe".to_string(),
                pid: Some(3005),
            },
            ScreenShareProcess {
                name: "SnippingTool.exe".to_string(),
                pid: Some(3006),
            },
            ScreenShareProcess {
                name: "NVIDIA Share.exe".to_string(),
                pid: Some(3007),
            },
            ScreenShareProcess {
                name: "/Applications/CleanShot X.app/Contents/MacOS/CleanShot X".to_string(),
                pid: Some(3008),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(3001),
                Some(3002),
                Some(3003),
                Some(3004),
                Some(3005),
                Some(3006),
                Some(3007),
                Some(3008)
            ]
        );
    }

    #[test]
    fn ignores_unrelated_processes() {
        let status = screen_share_status_for_processes(vec![ScreenShareProcess {
            name: "notepad.exe".to_string(),
            pid: Some(7),
        }]);

        assert!(!status.active);
        assert!(status.matched_processes.is_empty());
    }

    #[test]
    fn native_privacy_shield_hides_when_screen_share_risk_is_active() {
        let status = ScreenShareStatus {
            active: true,
            matched_processes: vec![ScreenShareProcess {
                name: "teams.exe".to_string(),
                pid: Some(42),
            }],
            message: Some("Known screen-sharing or recording process is running.".to_string()),
        };

        let decision = native_privacy_shield_decision(Ok(status));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Known screen-sharing or recording process is running")
        ));
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_detection_errors() {
        let decision = native_privacy_shield_decision(Err(anyhow::anyhow!("ps failed")));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Screen-share guard failed closed")
                    && reason.contains("ps failed")
        ));
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_guard_is_unsupported() {
        let status = ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: Some(
                "Screen-share process guard is only implemented on Windows and macOS in this build."
                    .to_string(),
            ),
        };

        let decision = native_privacy_shield_decision(Ok(status));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Screen-share guard is not available")
        ));
    }

    #[test]
    fn native_privacy_shield_leaves_windows_alone_when_detection_is_clear() {
        let status = ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: None,
        };

        assert_eq!(
            native_privacy_shield_decision(Ok(status)),
            NativePrivacyShieldDecision::Allow
        );
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_capture_exclusion_is_not_enforced() {
        for capture_exclusion in ["failed", "unsupported", "disabled"] {
            let status = crate::overlay::OverlayProtectionStatus {
                always_on_top: true,
                skip_taskbar: true,
                capture_exclusion: capture_exclusion.to_string(),
                click_through: true,
                visible: true,
                message: Some(format!("capture exclusion reported {capture_exclusion}")),
            };

            let decision = native_privacy_shield_decision_for_overlay_protection(&status);

            assert!(matches!(
                decision,
                NativePrivacyShieldDecision::Hide { reason }
                    if reason.contains("Capture exclusion is not enforced")
                        && reason.contains(capture_exclusion)
            ));
        }
    }

    #[test]
    fn native_privacy_shield_polls_quickly_enough_for_new_share_sessions() {
        assert!(NATIVE_PRIVACY_SHIELD_INTERVAL <= Duration::from_millis(500));
    }
}
