use serde::Serialize;

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
    "facetime",
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
        .any(|candidate| *candidate == normalized)
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
    fn ignores_unrelated_processes() {
        let status = screen_share_status_for_processes(vec![ScreenShareProcess {
            name: "notepad.exe".to_string(),
            pid: Some(7),
        }]);

        assert!(!status.active);
        assert!(status.matched_processes.is_empty());
    }
}
