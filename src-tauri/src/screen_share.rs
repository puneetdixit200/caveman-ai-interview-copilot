use serde::Serialize;
use std::{thread, time::Duration};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareProcess {
    pub name: String,
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareStatus {
    pub active: bool,
    pub matched_processes: Vec<ScreenShareProcess>,
    pub message: Option<String>,
}

const NATIVE_PRIVACY_SHIELD_INTERVAL: Duration = Duration::from_millis(500);
const EDGE_WEBVIEW_HOST_PROCESS: &str = "msedgewebview2.exe";
const EDGE_PWA_HOST_PROCESS: &str = "msedge_proxy.exe";
const CHROME_PWA_HOST_PROCESS: &str = "chrome_proxy.exe";
const BRAVE_PWA_HOST_PROCESS: &str = "brave_proxy.exe";
const OPERA_PWA_HOST_PROCESS: &str = "opera_proxy.exe";
const VIVALDI_PWA_HOST_PROCESS: &str = "vivaldi_proxy.exe";
const WEBEX_HOST_PROCESS: &str = "webexhost.exe";
const SCREENCONNECT_WINDOWS_CLIENT_PROCESS: &str = "screenconnect.windowsclient.exe";
const SCREENCONNECT_CLIENT_PROCESS: &str = "screenconnect.client.exe";
const ZOHO_ASSIST_PROCESS: &str = "zohoassist.exe";
const ZOHO_ASSIST_CONNECT_PROCESS: &str = "za_connect.exe";
const TEAMS_WEB_MEETING_ORIGIN: &str = "teams.microsoft.com";
const TEAMS_CONSUMER_WEB_MEETING_ORIGIN: &str = "teams.live.com";
const TEAMS_CLOUD_WEB_MEETING_ORIGIN: &str = "teams.cloud.microsoft";
const MEET_WEB_MEETING_ORIGIN: &str = "meet.google.com";
const ZOOM_WEB_MEETING_ORIGIN: &str = "zoom.us";
const SLACK_WEB_HUDDLE_ORIGIN: &str = "app.slack.com";
const DISCORD_WEB_HUDDLE_ORIGIN: &str = "discord.com";
const WHATSAPP_WEB_CALL_ORIGIN: &str = "web.whatsapp.com";
const WHEREBY_WEB_MEETING_ORIGIN: &str = "whereby.com";
const RIVERSIDE_WEB_MEETING_ORIGIN: &str = "riverside.fm";
const STREAMYARD_WEB_MEETING_ORIGIN: &str = "streamyard.com";
const LIVESTORM_WEB_MEETING_ORIGIN: &str = "livestorm.co";
const BIGBLUEBUTTON_MEETING_TITLE: &str = "bigbluebutton";
const TELLA_WEB_RECORDER_ORIGIN: &str = "tella.tv";
const PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS: &[&str] = &[
    EDGE_WEBVIEW_HOST_PROCESS,
    EDGE_PWA_HOST_PROCESS,
    CHROME_PWA_HOST_PROCESS,
    BRAVE_PWA_HOST_PROCESS,
    OPERA_PWA_HOST_PROCESS,
    VIVALDI_PWA_HOST_PROCESS,
    WEBEX_HOST_PROCESS,
    SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
    SCREENCONNECT_CLIENT_PROCESS,
    ZOHO_ASSIST_PROCESS,
    ZOHO_ASSIST_CONNECT_PROCESS,
    TEAMS_WEB_MEETING_ORIGIN,
    TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
    TEAMS_CLOUD_WEB_MEETING_ORIGIN,
    MEET_WEB_MEETING_ORIGIN,
    ZOOM_WEB_MEETING_ORIGIN,
    SLACK_WEB_HUDDLE_ORIGIN,
    DISCORD_WEB_HUDDLE_ORIGIN,
    WHATSAPP_WEB_CALL_ORIGIN,
    WHEREBY_WEB_MEETING_ORIGIN,
    RIVERSIDE_WEB_MEETING_ORIGIN,
    STREAMYARD_WEB_MEETING_ORIGIN,
    LIVESTORM_WEB_MEETING_ORIGIN,
    BIGBLUEBUTTON_MEETING_TITLE,
    TELLA_WEB_RECORDER_ORIGIN,
];

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
    WEBEX_HOST_PROCESS,
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
    SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
    SCREENCONNECT_CLIENT_PROCESS,
    ZOHO_ASSIST_PROCESS,
    ZOHO_ASSIST_CONNECT_PROCESS,
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

const WATCHED_SCREEN_SHARE_TITLES: &[&str] = &[
    "google meet",
    MEET_WEB_MEETING_ORIGIN,
    "microsoft teams",
    "teams meeting",
    TEAMS_WEB_MEETING_ORIGIN,
    TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
    TEAMS_CLOUD_WEB_MEETING_ORIGIN,
    "zoom meeting",
    ZOOM_WEB_MEETING_ORIGIN,
    "webex meeting",
    "whereby",
    WHEREBY_WEB_MEETING_ORIGIN,
    "riverside",
    RIVERSIDE_WEB_MEETING_ORIGIN,
    "streamyard",
    STREAMYARD_WEB_MEETING_ORIGIN,
    "livestorm",
    LIVESTORM_WEB_MEETING_ORIGIN,
    BIGBLUEBUTTON_MEETING_TITLE,
    "tella",
    TELLA_WEB_RECORDER_ORIGIN,
    "slack huddle",
    SLACK_WEB_HUDDLE_ORIGIN,
    "discord",
    DISCORD_WEB_HUDDLE_ORIGIN,
    WHATSAPP_WEB_CALL_ORIGIN,
    "screen sharing",
    "screen share",
    "presenting",
    "hackerrank interview",
    "interview - google meet",
    "interview - microsoft teams",
];

const SCREEN_SHARE_TITLE_HOST_PROCESSES: &[&str] = &[
    EDGE_WEBVIEW_HOST_PROCESS,
    EDGE_PWA_HOST_PROCESS,
    "applicationframehost.exe",
    CHROME_PWA_HOST_PROCESS,
    BRAVE_PWA_HOST_PROCESS,
    OPERA_PWA_HOST_PROCESS,
    VIVALDI_PWA_HOST_PROCESS,
];

pub fn detect_screen_share_status() -> anyhow::Result<ScreenShareStatus> {
    retain_package_privacy_shield_webview_markers();

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/V", "/FO", "CSV", "/NH"])
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

fn retain_package_privacy_shield_webview_markers() {
    std::hint::black_box(PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS);
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
        .filter(|process| {
            is_watched_screen_share_process(&process.name)
                || (is_screen_share_window_title_host_process(&process.name)
                    && is_watched_screen_share_window_title(process.window_title.as_deref()))
        })
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

fn is_screen_share_window_title_host_process(name: &str) -> bool {
    let normalized = normalize_process_name(name);
    SCREEN_SHARE_TITLE_HOST_PROCESSES
        .iter()
        .any(|candidate| process_name_matches_candidate(&normalized, candidate))
}

fn is_watched_screen_share_window_title(title: Option<&str>) -> bool {
    let Some(title) = title else {
        return false;
    };
    let normalized = title.trim().to_ascii_lowercase();
    !normalized.is_empty()
        && normalized != "n/a"
        && WATCHED_SCREEN_SHARE_TITLES
            .iter()
            .any(|candidate| normalized.contains(&candidate.to_ascii_lowercase()))
}

fn process_name_matches_candidate(normalized: &str, candidate: &str) -> bool {
    process_name_matches_candidate_literal(normalized, candidate)
        || candidate
            .strip_suffix(".exe")
            .is_some_and(|candidate_stem| {
                process_name_matches_candidate_literal(normalized, candidate_stem)
            })
}

fn process_name_matches_candidate_literal(normalized: &str, candidate: &str) -> bool {
    normalized == candidate
        || normalized.strip_prefix(candidate).is_some_and(|suffix| {
            matches!(
                suffix.as_bytes().first(),
                Some(b' ' | b'(' | b'-' | b'.' | b'_')
            )
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
            let window_title = columns
                .get(8)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty() && value != "N/A");
            Some(ScreenShareProcess {
                name,
                pid,
                window_title,
            })
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
                window_title: None,
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
                pid: Some(4242),
                window_title: None,
            }]
        );
    }

    #[test]
    fn detects_windows_meeting_titles_from_webview_and_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedgewebview2.exe\",\"222\",\"Console\",\"1\",\"120,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:01:02\",\"Microsoft Teams - Interview\"\n\"ApplicationFrameHost.exe\",\"333\",\"Console\",\"1\",\"90,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:33\",\"Google Meet - Candidate Screen\"\n\"chrome_proxy.exe\",\"444\",\"Console\",\"1\",\"55,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:17\",\"HackerRank Interview - Google Meet\"\n\"RuntimeBroker.exe\",\"555\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedgewebview2.exe", Some("Microsoft Teams - Interview")),
                (
                    "ApplicationFrameHost.exe",
                    Some("Google Meet - Candidate Screen")
                ),
                (
                    "chrome_proxy.exe",
                    Some("HackerRank Interview - Google Meet")
                )
            ]
        );
    }

    #[test]
    fn detects_edge_installed_app_meeting_titles_from_pwa_host() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"555\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Google Meet - Candidate Screen\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "msedge_proxy.exe".to_string(),
                pid: Some(555),
                window_title: Some("Google Meet - Candidate Screen".to_string()),
            }]
        );
    }

    #[test]
    fn detects_meeting_titles_from_alternate_chromium_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"brave_proxy.exe\",\"601\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Google Meet - Candidate Screen\"\n\"opera_proxy.exe\",\"602\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Microsoft Teams - Interview\"\n\"vivaldi_proxy.exe\",\"603\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"teams.microsoft.com - Standup\"\n\"RuntimeBroker.exe\",\"604\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("brave_proxy.exe", Some("Google Meet - Candidate Screen")),
                ("opera_proxy.exe", Some("Microsoft Teams - Interview")),
                ("vivaldi_proxy.exe", Some("teams.microsoft.com - Standup"))
            ]
        );
    }

    #[test]
    fn detects_additional_web_meeting_and_recorder_titles_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"611\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Whereby - Candidate Interview\"\n\"chrome_proxy.exe\",\"612\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Riverside Recording Studio\"\n\"brave_proxy.exe\",\"613\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"StreamYard - Live Studio\"\n\"opera_proxy.exe\",\"614\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"Livestorm Webinar Room\"\n\"vivaldi_proxy.exe\",\"615\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:25\",\"BigBlueButton - Interview Room\"\n\"msedgewebview2.exe\",\"616\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:26\",\"Tella Screen Recording\"\n\"RuntimeBroker.exe\",\"617\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedge_proxy.exe", Some("Whereby - Candidate Interview")),
                ("chrome_proxy.exe", Some("Riverside Recording Studio")),
                ("brave_proxy.exe", Some("StreamYard - Live Studio")),
                ("opera_proxy.exe", Some("Livestorm Webinar Room")),
                ("vivaldi_proxy.exe", Some("BigBlueButton - Interview Room")),
                ("msedgewebview2.exe", Some("Tella Screen Recording"))
            ]
        );
    }

    #[test]
    fn detects_zoom_and_slack_web_origins_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome_proxy.exe\",\"621\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"join.zoom.us/wc/123456789\"\n\"msedge_proxy.exe\",\"622\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"app.slack.com/client/T123/C456\"\n\"RuntimeBroker.exe\",\"623\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome_proxy.exe", Some("join.zoom.us/wc/123456789")),
                ("msedge_proxy.exe", Some("app.slack.com/client/T123/C456"))
            ]
        );
    }

    #[test]
    fn recognizes_zoom_and_slack_web_origin_titles() {
        assert!(is_watched_screen_share_window_title(Some(
            "join.zoom.us/wc/123456789"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "app.slack.com/client/T123/C456"
        )));
    }

    #[test]
    fn detects_consumer_teams_and_web_huddle_origins_from_webview_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedgewebview2.exe\",\"631\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"teams.live.com/v2/meet/123\"\n\"ApplicationFrameHost.exe\",\"632\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"teams.cloud.microsoft/meet/456\"\n\"msedge_proxy.exe\",\"633\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"discord.com/channels/123/456\"\n\"chrome_proxy.exe\",\"634\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"web.whatsapp.com - Video call\"\n\"RuntimeBroker.exe\",\"635\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedgewebview2.exe", Some("teams.live.com/v2/meet/123")),
                (
                    "ApplicationFrameHost.exe",
                    Some("teams.cloud.microsoft/meet/456")
                ),
                ("msedge_proxy.exe", Some("discord.com/channels/123/456")),
                ("chrome_proxy.exe", Some("web.whatsapp.com - Video call"))
            ]
        );
    }

    #[test]
    fn recognizes_consumer_teams_and_web_huddle_origin_titles() {
        assert!(is_watched_screen_share_window_title(Some(
            "teams.live.com/v2/meet/123"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "teams.cloud.microsoft/meet/456"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "discord.com/channels/123/456"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "web.whatsapp.com - Video call"
        )));
    }

    #[test]
    fn anchors_webview_markers_for_packaged_privacy_attestation() {
        assert_eq!(
            PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS,
            &[
                EDGE_WEBVIEW_HOST_PROCESS,
                EDGE_PWA_HOST_PROCESS,
                CHROME_PWA_HOST_PROCESS,
                BRAVE_PWA_HOST_PROCESS,
                OPERA_PWA_HOST_PROCESS,
                VIVALDI_PWA_HOST_PROCESS,
                WEBEX_HOST_PROCESS,
                SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
                SCREENCONNECT_CLIENT_PROCESS,
                ZOHO_ASSIST_PROCESS,
                ZOHO_ASSIST_CONNECT_PROCESS,
                TEAMS_WEB_MEETING_ORIGIN,
                TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
                TEAMS_CLOUD_WEB_MEETING_ORIGIN,
                MEET_WEB_MEETING_ORIGIN,
                ZOOM_WEB_MEETING_ORIGIN,
                SLACK_WEB_HUDDLE_ORIGIN,
                DISCORD_WEB_HUDDLE_ORIGIN,
                WHATSAPP_WEB_CALL_ORIGIN,
                WHEREBY_WEB_MEETING_ORIGIN,
                RIVERSIDE_WEB_MEETING_ORIGIN,
                STREAMYARD_WEB_MEETING_ORIGIN,
                LIVESTORM_WEB_MEETING_ORIGIN,
                BIGBLUEBUTTON_MEETING_TITLE,
                TELLA_WEB_RECORDER_ORIGIN
            ]
        );
    }

    #[test]
    fn ignores_meeting_titles_from_unrelated_windows() {
        let status = screen_share_status_for_processes(vec![
            ScreenShareProcess {
                name: "notepad.exe".to_string(),
                pid: Some(771),
                window_title: Some("Google Meet prep notes".to_string()),
            },
            ScreenShareProcess {
                name: "msedgewebview2.exe".to_string(),
                pid: Some(772),
                window_title: Some("N/A".to_string()),
            },
        ]);

        assert!(!status.active);
        assert_eq!(status.matched_processes, Vec::<ScreenShareProcess>::new());
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
                pid: Some(4242),
                window_title: None,
            }]
        );
    }

    #[test]
    fn detects_browser_based_meeting_and_recording_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string(),
                pid: Some(1001),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams".to_string(),
                pid: Some(1002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Safari.app/Contents/MacOS/Safari".to_string(),
                pid: Some(1003),
                window_title: None,
            },
            ScreenShareProcess {
                name: "QuickTime Player".to_string(),
                pid: Some(1004),
                window_title: None,
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
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU)".to_string(),
                pid: Some(1102),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/OBS.app/Contents/Frameworks/OBS Helper (Renderer).app/Contents/MacOS/OBS Helper (Renderer)".to_string(),
                pid: Some(1103),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Google Meet".to_string(),
                pid: Some(1104),
                window_title: None,
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
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/TeamViewer.app/Contents/MacOS/TeamViewer".to_string(),
                pid: Some(2002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "AnyDesk.exe".to_string(),
                pid: Some(2003),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/System/Library/CoreServices/Applications/Screen Sharing.app/Contents/MacOS/Screen Sharing".to_string(),
                pid: Some(2004),
                window_title: None,
            },
            ScreenShareProcess {
                name: "remoting_host.exe".to_string(),
                pid: Some(2005),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/RustDesk.app/Contents/MacOS/RustDesk".to_string(),
                pid: Some(2006),
                window_title: None,
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
    fn detects_webex_and_screenconnect_screen_share_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Webex\\WebexHost.exe".to_string(),
                pid: Some(2501),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenConnect.WindowsClient.exe".to_string(),
                pid: Some(2502),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenConnect.Client.exe".to_string(),
                pid: Some(2503),
                window_title: None,
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
            vec![Some(2501), Some(2502), Some(2503)]
        );
    }

    #[test]
    fn detects_remote_support_service_and_assist_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: "TeamViewer_Service.exe".to_string(),
                pid: Some(2601),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZohoAssist.exe".to_string(),
                pid: Some(2602),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZA_Connect.exe".to_string(),
                pid: Some(2603),
                window_title: None,
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
            vec![Some(2601), Some(2602), Some(2603)]
        );
    }

    #[test]
    fn detects_exe_detector_candidates_reported_without_extension() {
        let processes = vec![
            ScreenShareProcess {
                name: "ScreenConnect.Client".to_string(),
                pid: Some(2701),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZohoAssist".to_string(),
                pid: Some(2702),
                window_title: None,
            },
            ScreenShareProcess {
                name: "QuickAssist".to_string(),
                pid: Some(2703),
                window_title: None,
            },
            ScreenShareProcess {
                name: "TeamViewer_Service".to_string(),
                pid: Some(2704),
                window_title: None,
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
            vec![Some(2701), Some(2702), Some(2703), Some(2704)]
        );
    }

    #[test]
    fn detects_additional_meeting_remote_assistance_and_capture_tools() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Users\\candidate\\AppData\\Local\\RingCentral\\RingCentral.exe"
                    .to_string(),
                pid: Some(3001),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Jitsi Meet.app/Contents/MacOS/Jitsi Meet".to_string(),
                pid: Some(3002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "WhatsApp.exe".to_string(),
                pid: Some(3003),
                window_title: None,
            },
            ScreenShareProcess {
                name: r"C:\\Windows\\System32\\QuickAssist.exe".to_string(),
                pid: Some(3004),
                window_title: None,
            },
            ScreenShareProcess {
                name: "msra.exe".to_string(),
                pid: Some(3005),
                window_title: None,
            },
            ScreenShareProcess {
                name: "SnippingTool.exe".to_string(),
                pid: Some(3006),
                window_title: None,
            },
            ScreenShareProcess {
                name: "NVIDIA Share.exe".to_string(),
                pid: Some(3007),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/CleanShot X.app/Contents/MacOS/CleanShot X".to_string(),
                pid: Some(3008),
                window_title: None,
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
            window_title: None,
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
                window_title: None,
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
