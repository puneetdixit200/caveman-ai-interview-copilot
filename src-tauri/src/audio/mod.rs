use serde::Serialize;

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
    vec![
        AudioDevice {
            id: "loopback-default".to_string(),
            label: "System Output Loopback".to_string(),
            kind: "system".to_string(),
            selected: true,
            level: 0.0,
        },
        AudioDevice {
            id: "mic-default".to_string(),
            label: "Primary Microphone".to_string(),
            kind: "microphone".to_string(),
            selected: true,
            level: 0.0,
        },
        AudioDevice {
            id: "virtual-cable".to_string(),
            label: "Virtual Audio Cable".to_string(),
            kind: "virtual".to_string(),
            selected: false,
            level: 0.0,
        },
    ]
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
