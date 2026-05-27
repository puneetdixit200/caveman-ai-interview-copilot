use serde::Serialize;

pub const ACTIVE_WINDOW_TYPING_PRIVACY_MARKER: &str =
    "Native privacy shield denied active-window typing during screen-share risk.";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypingResult {
    pub character_count: usize,
    pub input_event_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowInfo {
    pub title: String,
    pub process_name: String,
    pub executable_path: Option<String>,
    pub editor_kind: Option<String>,
    pub is_code_editor: bool,
}

pub fn get_active_window_info() -> anyhow::Result<ActiveWindowInfo> {
    platform_active_window_info()
}

pub fn type_text_into_active_window(text: &str) -> anyhow::Result<TypingResult> {
    let units = unicode_key_units(text);
    if units.is_empty() {
        return Err(anyhow::anyhow!("Text to type is empty"));
    }

    send_unicode_key_units(&units)?;
    Ok(TypingResult {
        character_count: text.chars().count(),
        input_event_count: units.len() * 2,
    })
}

pub fn native_typing_privacy_gate_message(
    screen_share_decision: crate::screen_share::NativePrivacyShieldDecision,
) -> Option<String> {
    if let crate::screen_share::NativePrivacyShieldDecision::Hide { reason } = screen_share_decision
    {
        std::hint::black_box(ACTIVE_WINDOW_TYPING_PRIVACY_MARKER);
        return Some(format!("{ACTIVE_WINDOW_TYPING_PRIVACY_MARKER} {reason}"));
    }

    None
}

pub fn unicode_key_units(text: &str) -> Vec<u16> {
    let mut units = Vec::new();
    for character in text.chars() {
        if character == '\n' || character == '\r' {
            units.push('\r' as u16);
            continue;
        }

        let mut buffer = [0; 2];
        units.extend(character.encode_utf16(&mut buffer).iter().copied());
    }

    units
}

pub fn active_window_info_from_parts(
    title: impl Into<String>,
    process_name: impl Into<String>,
    executable_path: Option<String>,
) -> ActiveWindowInfo {
    let title = title.into();
    let process_name = process_name.into();
    let editor_kind = detect_code_editor(&process_name, &title, executable_path.as_deref());
    ActiveWindowInfo {
        title,
        process_name,
        executable_path,
        is_code_editor: editor_kind.is_some(),
        editor_kind,
    }
}

fn detect_code_editor(
    process_name: &str,
    title: &str,
    executable_path: Option<&str>,
) -> Option<String> {
    let process = normalized_process_name(process_name, executable_path);
    let title = title.to_ascii_lowercase();
    let editor = match process.as_str() {
        "code.exe" => Some("VS Code"),
        "code - insiders.exe" => Some("VS Code Insiders"),
        "vscodium.exe" | "codium.exe" => Some("VSCodium"),
        "cursor.exe" => Some("Cursor"),
        "windsurf.exe" => Some("Windsurf"),
        "devenv.exe" => Some("Visual Studio"),
        "webstorm64.exe" | "webstorm.exe" => Some("WebStorm"),
        "idea64.exe" | "idea.exe" => Some("IntelliJ IDEA"),
        "pycharm64.exe" | "pycharm.exe" => Some("PyCharm"),
        "rider64.exe" | "rider.exe" => Some("Rider"),
        "clion64.exe" | "clion.exe" => Some("CLion"),
        "datagrip64.exe" | "datagrip.exe" => Some("DataGrip"),
        "sublime_text.exe" => Some("Sublime Text"),
        "notepad++.exe" => Some("Notepad++"),
        "zed.exe" => Some("Zed"),
        "atom.exe" => Some("Atom"),
        "emacs.exe" | "runemacs.exe" => Some("Emacs"),
        "gvim.exe" | "vim.exe" | "nvim.exe" | "nvim-qt.exe" | "neovide.exe" => Some("Neovim"),
        "windows terminal.exe"
        | "windowsterminal.exe"
        | "wt.exe"
        | "alacritty.exe"
        | "wezterm-gui.exe"
        | "wezterm.exe"
        | "conhost.exe"
        | "cmd.exe"
        | "powershell.exe"
        | "pwsh.exe" => terminal_editor_kind(&title),
        _ => None,
    };

    editor.map(str::to_string)
}

fn normalized_process_name(process_name: &str, executable_path: Option<&str>) -> String {
    let raw = if process_name.trim().is_empty() {
        executable_path.and_then(executable_file_name).unwrap_or("")
    } else {
        process_name
    };

    raw.trim().to_ascii_lowercase()
}

fn executable_file_name(path: &str) -> Option<&str> {
    path.rsplit(['\\', '/'])
        .find(|segment| !segment.trim().is_empty())
}

fn terminal_editor_kind(title: &str) -> Option<&'static str> {
    if title.contains("nvim") || title.contains("neovim") {
        return Some("Neovim terminal");
    }

    if title.contains("vim") {
        return Some("Vim terminal");
    }

    if title.contains("helix") || title.contains(" hx ") || title.ends_with(" hx") {
        return Some("Helix terminal");
    }

    if title.contains("emacs") {
        return Some("Emacs terminal");
    }

    None
}

#[cfg(windows)]
fn platform_active_window_info() -> anyhow::Result<ActiveWindowInfo> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0 == std::ptr::null_mut() {
        return Err(anyhow::anyhow!("No active foreground window was found"));
    }

    let title = read_window_title(hwnd);
    let mut process_id = 0_u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }
    if process_id == 0 {
        return Err(anyhow::anyhow!(
            "Could not resolve the active window process id"
        ));
    }

    let executable_path = read_process_executable_path(process_id).ok();
    let process_name = executable_path
        .as_deref()
        .and_then(|path| std::path::Path::new(path).file_name())
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| process_id.to_string());

    Ok(active_window_info_from_parts(
        title,
        process_name,
        executable_path,
    ))
}

#[cfg(windows)]
fn read_window_title(hwnd: windows::Win32::Foundation::HWND) -> String {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;

    let mut buffer = vec![0_u16; 512];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..length as usize])
        .trim()
        .to_string()
}

#[cfg(windows)]
fn read_process_executable_path(process_id: u32) -> anyhow::Result<String> {
    use windows::core::PWSTR;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
            .map_err(|error| anyhow::anyhow!("Could not open active process: {error}"))?
    };
    let _handle_guard = HandleGuard(handle);
    let mut buffer = vec![0_u16; 32_768];
    let mut length = buffer.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )
        .map_err(|error| anyhow::anyhow!("Could not read active process path: {error}"))?;
    }

    Ok(String::from_utf16_lossy(&buffer[..length as usize]))
}

#[cfg(windows)]
struct HandleGuard(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for HandleGuard {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(self.0) };
    }
}

#[cfg(not(windows))]
fn platform_active_window_info() -> anyhow::Result<ActiveWindowInfo> {
    Err(anyhow::anyhow!(
        "Active editor detection is currently implemented for Windows only"
    ))
}

#[cfg(windows)]
fn send_unicode_key_units(units: &[u16]) -> anyhow::Result<()> {
    use std::mem::size_of;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        VIRTUAL_KEY,
    };

    let mut inputs = Vec::with_capacity(units.len() * 2);
    for unit in units {
        inputs.push(unicode_input(*unit, false));
        inputs.push(unicode_input(*unit, true));
    }

    for chunk in inputs.chunks(256) {
        let sent = unsafe { SendInput(chunk, size_of::<INPUT>() as i32) };
        if sent != chunk.len() as u32 {
            return Err(anyhow::anyhow!(
                "Windows accepted {sent} of {} keyboard input events",
                chunk.len()
            ));
        }
    }

    fn unicode_input(unit: u16, key_up: bool) -> INPUT {
        let flags = if key_up {
            KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
        } else {
            KEYEVENTF_UNICODE
        };

        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn send_unicode_key_units(_units: &[u16]) -> anyhow::Result<()> {
    Err(anyhow::anyhow!(
        "Auto-typing into the active window is currently implemented for Windows only"
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        active_window_info_from_parts, detect_code_editor, native_typing_privacy_gate_message,
        unicode_key_units, ACTIVE_WINDOW_TYPING_PRIVACY_MARKER,
    };
    use crate::screen_share::NativePrivacyShieldDecision;

    #[test]
    fn unicode_key_units_normalize_newlines_for_windows_text_injection() {
        assert_eq!(
            unicode_key_units("Line one\nLine two"),
            vec![
                'L' as u16,
                'i' as u16,
                'n' as u16,
                'e' as u16,
                ' ' as u16,
                'o' as u16,
                'n' as u16,
                'e' as u16,
                '\r' as u16,
                'L' as u16,
                'i' as u16,
                'n' as u16,
                'e' as u16,
                ' ' as u16,
                't' as u16,
                'w' as u16,
                'o' as u16
            ]
        );
    }

    #[test]
    fn native_typing_privacy_gate_blocks_when_screen_share_risk_is_active() {
        let message = native_typing_privacy_gate_message(NativePrivacyShieldDecision::Hide {
            reason: "Known screen-sharing or recording process is running.".to_string(),
        })
        .expect("screen-share risk should block active-window typing");

        assert!(message.contains(ACTIVE_WINDOW_TYPING_PRIVACY_MARKER));
        assert!(message.contains("Known screen-sharing or recording process"));
    }

    #[test]
    fn native_typing_privacy_gate_allows_when_screen_share_is_clear() {
        assert_eq!(
            native_typing_privacy_gate_message(NativePrivacyShieldDecision::Allow),
            None
        );
    }

    #[test]
    fn detects_known_code_editor_processes() {
        assert_eq!(
            detect_code_editor("Code.exe", "main.ts - Visual Studio Code", None),
            Some("VS Code".to_string())
        );
        assert_eq!(
            detect_code_editor("Cursor.exe", "route.ts - Cursor", None),
            Some("Cursor".to_string())
        );
        assert_eq!(
            detect_code_editor("pycharm64.exe", "api.py - PyCharm", None),
            Some("PyCharm".to_string())
        );
        assert_eq!(
            detect_code_editor(
                "",
                "Program.cs - Microsoft Visual Studio",
                Some("C:\\VS\\devenv.exe")
            ),
            Some("Visual Studio".to_string())
        );
    }

    #[test]
    fn only_treats_terminal_windows_as_editors_when_editor_title_is_present() {
        assert_eq!(
            detect_code_editor("WindowsTerminal.exe", "nvim C:\\repo\\main.rs", None),
            Some("Neovim terminal".to_string())
        );
        assert_eq!(
            detect_code_editor("powershell.exe", "PowerShell", None),
            None
        );
    }

    #[test]
    fn builds_active_window_info_with_editor_flags() {
        assert_eq!(
            active_window_info_from_parts(
                "Interview - Google Meet",
                "chrome.exe",
                Some("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string())
            ),
            super::ActiveWindowInfo {
                title: "Interview - Google Meet".to_string(),
                process_name: "chrome.exe".to_string(),
                executable_path: Some(
                    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string()
                ),
                editor_kind: None,
                is_code_editor: false
            }
        );
    }
}
