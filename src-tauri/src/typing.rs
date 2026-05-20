use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypingResult {
    pub character_count: usize,
    pub input_event_count: usize,
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
    use super::unicode_key_units;

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
}
