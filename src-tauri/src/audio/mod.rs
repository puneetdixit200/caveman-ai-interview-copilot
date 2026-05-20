use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub selected: bool,
    pub level: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureState {
    pub running: bool,
    pub system_device_id: String,
    pub microphone_device_id: String,
    pub sample_rate_hz: u32,
    pub channels: u16,
}

pub fn list_audio_devices() -> Vec<AudioDevice> {
    enumerate_audio_devices().unwrap_or_else(|_| fallback_audio_devices())
}

pub fn start_capture(system_device_id: &str, microphone_device_id: &str) -> AudioCaptureState {
    AudioCaptureState {
        running: true,
        system_device_id: system_device_id.to_string(),
        microphone_device_id: microphone_device_id.to_string(),
        sample_rate_hz: 16_000,
        channels: 1,
    }
}

fn enumerate_audio_devices() -> anyhow::Result<Vec<AudioDevice>> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let default_input = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let default_output = host
        .default_output_device()
        .and_then(|device| device.name().ok());
    let mut devices = Vec::new();
    let mut seen_ids = HashSet::new();

    if let Ok(inputs) = host.input_devices() {
        for (index, device) in inputs.enumerate() {
            let label = device
                .name()
                .unwrap_or_else(|_| format!("Microphone {}", index + 1));
            let kind = classify_device_kind(&label, "microphone");
            let id = stable_device_id(&kind, &label, index);
            if seen_ids.insert(id.clone()) {
                devices.push(AudioDevice {
                    id,
                    label: label.clone(),
                    kind,
                    selected: default_input.as_deref() == Some(label.as_str()),
                    level: 0.0,
                });
            }
        }
    }

    if let Ok(outputs) = host.output_devices() {
        for (index, device) in outputs.enumerate() {
            let label = device
                .name()
                .unwrap_or_else(|_| format!("System Output {}", index + 1));
            let kind = classify_device_kind(&label, "system");
            let id = stable_device_id(&kind, &label, index);
            if seen_ids.insert(id.clone()) {
                devices.push(AudioDevice {
                    id,
                    label: if kind == "system" {
                        format!("{label} (system audio source)")
                    } else {
                        label.clone()
                    },
                    kind,
                    selected: default_output.as_deref() == Some(label.as_str()),
                    level: 0.0,
                });
            }
        }
    }

    if devices.is_empty() {
        Ok(fallback_audio_devices())
    } else {
        Ok(devices)
    }
}

fn fallback_audio_devices() -> Vec<AudioDevice> {
    vec![
        AudioDevice {
            id: "system-default".to_string(),
            label: "Default system output".to_string(),
            kind: "system".to_string(),
            selected: true,
            level: 0.0,
        },
        AudioDevice {
            id: "microphone-default".to_string(),
            label: "Default microphone".to_string(),
            kind: "microphone".to_string(),
            selected: true,
            level: 0.0,
        },
        AudioDevice {
            id: "virtual-cable".to_string(),
            label: "Virtual audio cable".to_string(),
            kind: "virtual".to_string(),
            selected: false,
            level: 0.0,
        },
    ]
}

fn classify_device_kind(label: &str, fallback: &str) -> String {
    let lower = label.to_lowercase();
    if lower.contains("virtual") || lower.contains("cable") || lower.contains("vb-audio") {
        return "virtual".to_string();
    }

    fallback.to_string()
}

fn stable_device_id(kind: &str, label: &str, index: usize) -> String {
    let slug = label
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric() {
                Some(character.to_ascii_lowercase())
            } else if character.is_ascii_whitespace() || character == '-' || character == '_' {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        format!("{kind}-{index}")
    } else {
        format!("{kind}-{index}-{slug}")
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_device_kind, stable_device_id};

    #[test]
    fn classifies_virtual_audio_devices_from_name() {
        assert_eq!(
            classify_device_kind("VB-Audio Virtual Cable", "microphone"),
            "virtual"
        );
        assert_eq!(
            classify_device_kind("USB Microphone", "microphone"),
            "microphone"
        );
    }

    #[test]
    fn builds_stable_ascii_device_ids() {
        assert_eq!(
            stable_device_id("microphone", "USB Microphone (Realtek)", 2),
            "microphone-2-usb-microphone-realtek"
        );
    }
}
