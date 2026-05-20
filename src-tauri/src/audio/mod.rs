use serde::Serialize;
use std::collections::HashSet;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter};

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
    pub microphone_level: f32,
    pub system_level: f32,
    pub system_capture_supported: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevelEvent {
    pub source: String,
    pub device_id: String,
    pub level: f32,
    pub rms: f32,
    pub peak: f32,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub timestamp_ms: i64,
}

impl AudioLevelEvent {
    pub fn from_samples(
        source: &str,
        device_id: &str,
        samples: &[f32],
        sample_rate_hz: u32,
        channels: u16,
    ) -> Self {
        let mut peak = 0.0_f32;
        let mut sum_squares = 0.0_f32;

        for sample in samples {
            let absolute = sample.abs().min(1.0);
            peak = peak.max(absolute);
            sum_squares += absolute * absolute;
        }

        let rms = if samples.is_empty() {
            0.0
        } else {
            (sum_squares / samples.len() as f32).sqrt()
        };

        Self {
            source: source.to_string(),
            device_id: device_id.to_string(),
            level: peak,
            rms,
            peak,
            sample_rate_hz,
            channels,
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
        }
    }
}

pub struct AudioCaptureManager {
    runtime: Mutex<CaptureRuntime>,
    state: Arc<Mutex<AudioCaptureState>>,
}

#[derive(Default)]
struct CaptureRuntime {
    stop_tx: Option<mpsc::Sender<()>>,
    thread: Option<JoinHandle<()>>,
}

impl Default for AudioCaptureManager {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(CaptureRuntime::default()),
            state: Arc::new(Mutex::new(stopped_state())),
        }
    }
}

pub fn list_audio_devices() -> Vec<AudioDevice> {
    enumerate_audio_devices().unwrap_or_else(|_| fallback_audio_devices())
}

impl AudioCaptureManager {
    pub fn start(
        &self,
        app_handle: AppHandle,
        system_device_id: &str,
        microphone_device_id: &str,
    ) -> anyhow::Result<AudioCaptureState> {
        self.stop();

        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let shared_state = self.state.clone();
        let system_device_id = system_device_id.to_string();
        let microphone_device_id = microphone_device_id.to_string();
        let thread = thread::spawn(move || {
            run_microphone_capture_thread(
                app_handle,
                system_device_id,
                microphone_device_id,
                shared_state,
                stop_rx,
                ready_tx,
            );
        });

        let state = match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(state)) => state,
            Ok(Err(error)) => {
                let _ = stop_tx.send(());
                let _ = thread.join();
                return Err(anyhow::anyhow!(error));
            }
            Err(_) => {
                let _ = stop_tx.send(());
                let _ = thread.join();
                return Err(anyhow::anyhow!(
                    "Timed out while starting microphone capture"
                ));
            }
        };

        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| anyhow::anyhow!("Audio capture state is unavailable"))?;
        runtime.stop_tx = Some(stop_tx);
        runtime.thread = Some(thread);

        Ok(state)
    }

    pub fn stop(&self) -> AudioCaptureState {
        let mut runtime = self.runtime.lock().expect("audio capture mutex poisoned");
        if let Some(stop_tx) = runtime.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(thread) = runtime.thread.take() {
            let _ = thread.join();
        }

        let mut state = self
            .state
            .lock()
            .expect("audio capture state mutex poisoned");
        state.running = false;
        state.microphone_level = 0.0;
        state.system_level = 0.0;
        state.clone()
    }

    pub fn status(&self) -> AudioCaptureState {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or_else(|_| stopped_state())
    }
}

fn enumerate_audio_devices() -> anyhow::Result<Vec<AudioDevice>> {
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
    use super::{classify_device_kind, stable_device_id, AudioCaptureManager, AudioLevelEvent};

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

    #[test]
    fn computes_audio_level_from_pcm_samples() {
        let event = AudioLevelEvent::from_samples(
            "microphone",
            "mic-1",
            &[0.0, 0.5, -1.0, 0.25],
            16_000,
            1,
        );

        assert_eq!(event.source, "microphone");
        assert_eq!(event.device_id, "mic-1");
        assert!((event.peak - 1.0).abs() < 0.001);
        assert!((event.rms - 0.572).abs() < 0.001);
        assert!((event.level - 1.0).abs() < 0.001);
    }

    #[test]
    fn capture_manager_defaults_to_stopped_status() {
        let manager = AudioCaptureManager::default();
        let status = manager.status();

        assert!(!status.running);
        assert_eq!(status.sample_rate_hz, 16_000);
        assert_eq!(status.channels, 1);
        assert_eq!(status.microphone_level, 0.0);
        assert!(!status.system_capture_supported);
    }
}

fn build_input_stream(
    device: &cpal::Device,
    sample_format: cpal::SampleFormat,
    config: &cpal::StreamConfig,
    device_id: String,
    sample_rate_hz: u32,
    channels: u16,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    app_handle: AppHandle,
) -> anyhow::Result<cpal::Stream> {
    match sample_format {
        cpal::SampleFormat::F32 => {
            let error_state = shared_state.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[f32], _| {
                    process_microphone_samples(
                        data.iter().copied(),
                        &device_id,
                        sample_rate_hz,
                        channels,
                        &shared_state,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        cpal::SampleFormat::I16 => {
            let error_state = shared_state.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[i16], _| {
                    process_microphone_samples(
                        data.iter().map(|sample| *sample as f32 / i16::MAX as f32),
                        &device_id,
                        sample_rate_hz,
                        channels,
                        &shared_state,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        cpal::SampleFormat::U16 => {
            let error_state = shared_state.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[u16], _| {
                    process_microphone_samples(
                        data.iter()
                            .map(|sample| (*sample as f32 - 32768.0) / 32768.0),
                        &device_id,
                        sample_rate_hz,
                        channels,
                        &shared_state,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        unsupported => Err(anyhow::anyhow!(
            "Unsupported microphone sample format: {unsupported:?}"
        )),
    }
}

fn run_microphone_capture_thread(
    app_handle: AppHandle,
    system_device_id: String,
    microphone_device_id: String,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    stop_rx: mpsc::Receiver<()>,
    ready_tx: mpsc::Sender<Result<AudioCaptureState, String>>,
) {
    let result = (|| -> anyhow::Result<cpal::Stream> {
        let host = cpal::default_host();
        let device = resolve_input_device(&host, &microphone_device_id)
            .ok_or_else(|| anyhow::anyhow!("No microphone input device is available"))?;
        let selected_microphone_id = resolve_device_id(&host, &device, &microphone_device_id);
        let supported_config = device.default_input_config()?;
        let sample_rate_hz = supported_config.sample_rate().0;
        let channels = supported_config.channels();
        let stream_config = supported_config.clone().into();

        if let Ok(mut state) = shared_state.lock() {
            *state = AudioCaptureState {
                running: true,
                system_device_id,
                microphone_device_id: selected_microphone_id.clone(),
                sample_rate_hz,
                channels,
                microphone_level: 0.0,
                system_level: 0.0,
                system_capture_supported: false,
                error: None,
            };
        }

        let stream = build_input_stream(
            &device,
            supported_config.sample_format(),
            &stream_config,
            selected_microphone_id,
            sample_rate_hz,
            channels,
            shared_state.clone(),
            app_handle,
        )?;
        stream.play()?;
        Ok(stream)
    })();

    match result {
        Ok(stream) => {
            let ready_state = shared_state
                .lock()
                .map(|state| state.clone())
                .unwrap_or_else(|_| stopped_state());
            let _ = ready_tx.send(Ok(ready_state));
            let _ = stop_rx.recv();
            drop(stream);
        }
        Err(error) => {
            if let Ok(mut state) = shared_state.lock() {
                *state = stopped_state();
                state.error = Some(error.to_string());
            }
            let _ = ready_tx.send(Err(error.to_string()));
        }
    }

    if let Ok(mut state) = shared_state.lock() {
        state.running = false;
        state.microphone_level = 0.0;
        state.system_level = 0.0;
    }
}

fn update_stream_error(shared_state: &Arc<Mutex<AudioCaptureState>>, error: cpal::StreamError) {
    if let Ok(mut state) = shared_state.lock() {
        state.error = Some(error.to_string());
    }
}

fn process_microphone_samples(
    samples: impl Iterator<Item = f32>,
    device_id: &str,
    sample_rate_hz: u32,
    channels: u16,
    shared_state: &Arc<Mutex<AudioCaptureState>>,
    app_handle: &AppHandle,
) {
    let samples = samples
        .map(|sample| sample.clamp(-1.0, 1.0))
        .collect::<Vec<_>>();
    let event =
        AudioLevelEvent::from_samples("microphone", device_id, &samples, sample_rate_hz, channels);

    if let Ok(mut state) = shared_state.lock() {
        state.microphone_level = event.level;
    }

    let _ = app_handle.emit("audio-level", event);
}

fn resolve_input_device(host: &cpal::Host, requested_id: &str) -> Option<cpal::Device> {
    if requested_id == "default" || requested_id == "microphone-default" {
        return host.default_input_device();
    }

    let inputs = host.input_devices().ok()?;
    for (index, device) in inputs.enumerate() {
        let label = device.name().ok()?;
        let kind = classify_device_kind(&label, "microphone");
        if stable_device_id(&kind, &label, index) == requested_id || label == requested_id {
            return Some(device);
        }
    }

    host.default_input_device()
}

fn resolve_device_id(host: &cpal::Host, device: &cpal::Device, requested_id: &str) -> String {
    if requested_id != "default" && requested_id != "microphone-default" {
        return requested_id.to_string();
    }

    let Ok(target_name) = device.name() else {
        return requested_id.to_string();
    };

    if let Ok(inputs) = host.input_devices() {
        for (index, candidate) in inputs.enumerate() {
            if candidate.name().ok().as_deref() == Some(target_name.as_str()) {
                let kind = classify_device_kind(&target_name, "microphone");
                return stable_device_id(&kind, &target_name, index);
            }
        }
    }

    requested_id.to_string()
}

impl Default for AudioCaptureState {
    fn default() -> Self {
        stopped_state()
    }
}

fn stopped_state() -> AudioCaptureState {
    AudioCaptureState {
        running: false,
        system_device_id: "default".to_string(),
        microphone_device_id: "default".to_string(),
        sample_rate_hz: 16_000,
        channels: 1,
        microphone_level: 0.0,
        system_level: 0.0,
        system_capture_supported: false,
        error: None,
    }
}
