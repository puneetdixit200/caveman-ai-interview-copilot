use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioApplication {
    pub id: String,
    pub name: String,
    pub pid: Option<u32>,
    pub window_title: Option<String>,
}

pub fn list_audio_applications() -> anyhow::Result<Vec<AudioApplication>> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/V", "/FO", "CSV", "/NH"])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!("Could not query application audio targets"));
        }

        return Ok(audio_applications_from_tasklist_csv(
            &String::from_utf8_lossy(&output.stdout),
        ));
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("ps")
            .args(["-axo", "pid=,comm="])
            .output()?;

        if !output.status.success() {
            return Err(anyhow::anyhow!("Could not query application audio targets"));
        }

        return Ok(audio_applications_from_macos_process_list(
            &String::from_utf8_lossy(&output.stdout),
        ));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(Vec::new())
    }
}

pub fn audio_applications_from_tasklist_csv(output: &str) -> Vec<AudioApplication> {
    output
        .lines()
        .filter_map(|line| {
            let columns = parse_csv_line(line);
            let name = columns.first()?.trim().to_string();
            let pid = columns
                .get(1)
                .and_then(|value| value.trim().parse::<u32>().ok());
            let window_title = columns
                .get(8)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty() && value != "N/A");

            if name.is_empty() || window_title.is_none() {
                return None;
            }

            Some(AudioApplication {
                id: pid
                    .map(|value| format!("pid:{value}"))
                    .unwrap_or_else(|| format!("process:{name}")),
                name,
                pid,
                window_title,
            })
        })
        .collect()
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn audio_applications_from_macos_process_list(output: &str) -> Vec<AudioApplication> {
    let mut seen_names = HashSet::new();

    output
        .lines()
        .filter_map(|line| {
            let (pid, command) = line.trim().split_once(char::is_whitespace)?;
            let pid = pid.trim().parse::<u32>().ok();
            let name = macos_app_name_from_command(command.trim())?;
            if !is_macos_call_audio_target(&name) {
                return None;
            }

            let normalized = normalize_application_name(&name);
            if !seen_names.insert(normalized) {
                return None;
            }

            Some(AudioApplication {
                id: pid
                    .map(|value| format!("pid:{value}"))
                    .unwrap_or_else(|| format!("process:{name}")),
                name: name.clone(),
                pid,
                window_title: Some(name),
            })
        })
        .collect()
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_app_name_from_command(command: &str) -> Option<String> {
    command
        .split('/')
        .find_map(|part| {
            part.strip_suffix(".app")
                .map(|bundle_name| bundle_name.trim().to_string())
        })
        .or_else(|| {
            std::path::Path::new(command)
                .file_name()
                .and_then(|value| value.to_str())
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn is_macos_call_audio_target(name: &str) -> bool {
    matches!(
        normalize_application_name(name).as_str(),
        "arc"
            | "brave browser"
            | "cisco webex meetings"
            | "discord"
            | "firefox"
            | "google chrome"
            | "microsoft edge"
            | "microsoft teams"
            | "msteams"
            | "obs"
            | "obs studio"
            | "safari"
            | "skype"
            | "slack"
            | "webex"
            | "zoom"
            | "zoom.us"
    )
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn normalize_application_name(name: &str) -> String {
    name.trim().trim_end_matches(".app").to_ascii_lowercase()
}

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
    fn parses_visible_applications_from_verbose_tasklist_csv() {
        let apps = audio_applications_from_tasklist_csv(
            "\"chrome.exe\",\"111\",\"Console\",\"1\",\"120,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:01:02\",\"Google Meet - Standup\"\n\"svchost.exe\",\"22\",\"Services\",\"0\",\"9,000 K\",\"Unknown\",\"N/A\",\"0:00:00\",\"N/A\"",
        );

        assert_eq!(
            apps,
            vec![AudioApplication {
                id: "pid:111".to_string(),
                name: "chrome.exe".to_string(),
                pid: Some(111),
                window_title: Some("Google Meet - Standup".to_string())
            }]
        );
    }

    #[test]
    fn parses_macos_call_applications_from_unix_process_list() {
        let apps = audio_applications_from_macos_process_list(
            " 4242 /Applications/zoom.us.app/Contents/MacOS/zoom.us\n 111 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n 77 /usr/sbin/syslogd\n 89 /Applications/Notes.app/Contents/MacOS/Notes",
        );

        assert_eq!(
            apps,
            vec![
                AudioApplication {
                    id: "pid:4242".to_string(),
                    name: "zoom.us".to_string(),
                    pid: Some(4242),
                    window_title: Some("zoom.us".to_string())
                },
                AudioApplication {
                    id: "pid:111".to_string(),
                    name: "Google Chrome".to_string(),
                    pid: Some(111),
                    window_title: Some("Google Chrome".to_string())
                }
            ]
        );
    }
}
