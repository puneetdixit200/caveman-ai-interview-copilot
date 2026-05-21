use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter, Manager};

const TARGET_SAMPLE_RATE_HZ: u32 = 16_000;
const TARGET_CHANNELS: u16 = 1;
const AUDIO_CHUNK_TARGET_MS: u32 = 250;

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
    pub gain_db: f32,
    pub noise_gate_db: f32,
    pub system_capture_supported: bool,
    pub error: Option<String>,
}

#[derive(Debug, Copy, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProcessingSettings {
    pub gain_db: f32,
    pub noise_gate_db: f32,
}

impl AudioProcessingSettings {
    pub fn from_optional(gain_db: Option<f32>, noise_gate_db: Option<f32>) -> Self {
        Self::new(gain_db.unwrap_or(0.0), noise_gate_db.unwrap_or(-80.0))
    }

    fn new(gain_db: f32, noise_gate_db: f32) -> Self {
        Self {
            gain_db: gain_db.clamp(-24.0, 12.0),
            noise_gate_db: noise_gate_db.clamp(-80.0, 0.0),
        }
    }
}

impl Default for AudioProcessingSettings {
    fn default() -> Self {
        Self::new(0.0, -80.0)
    }
}

#[derive(Debug, Copy, Clone)]
pub struct CaptureSourceSelection {
    pub microphone: bool,
    pub system: bool,
}

impl CaptureSourceSelection {
    pub fn from_mode(capture_mode: Option<&str>, dual_stream_enabled: Option<bool>) -> Self {
        match capture_mode.unwrap_or("dual") {
            "manual" => Self {
                microphone: false,
                system: false,
            },
            "microphone" => Self {
                microphone: true,
                system: false,
            },
            "system" => Self {
                microphone: false,
                system: true,
            },
            "dual" => {
                if dual_stream_enabled.unwrap_or(true) {
                    Self {
                        microphone: true,
                        system: true,
                    }
                } else {
                    Self {
                        microphone: true,
                        system: false,
                    }
                }
            }
            _ => Self {
                microphone: true,
                system: true,
            },
        }
    }

    fn has_any_source(self) -> bool {
        self.microphone || self.system
    }
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChunkEvent {
    pub source: String,
    pub device_id: String,
    pub sequence: u64,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub duration_ms: u64,
    pub sample_count: usize,
    pub pcm16_base64: String,
    pub timestamp_ms: i64,
}

impl AudioChunkEvent {
    fn from_samples(
        source: &str,
        device_id: &str,
        sequence: u64,
        samples: &[f32],
        sample_rate_hz: u32,
        channels: u16,
    ) -> Self {
        Self {
            source: source.to_string(),
            device_id: device_id.to_string(),
            sequence,
            sample_rate_hz,
            channels,
            duration_ms: samples_duration_ms(samples.len(), sample_rate_hz, channels),
            sample_count: samples.len(),
            pcm16_base64: encode_pcm16_base64(samples),
            timestamp_ms: chrono::Utc::now().timestamp_millis(),
        }
    }
}

pub struct AudioCaptureManager {
    runtime: Mutex<CaptureRuntime>,
    state: Arc<Mutex<AudioCaptureState>>,
    samples: Arc<Mutex<RollingAudioBuffer>>,
    chunks: Arc<Mutex<AudioChunkAccumulator>>,
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
            samples: Arc::new(Mutex::new(RollingAudioBuffer::new(48_000 * 2 * 12))),
            chunks: Arc::new(Mutex::new(AudioChunkAccumulator::new(
                AUDIO_CHUNK_TARGET_MS,
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSnapshot {
    pub source: String,
    pub audio_path: String,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub duration_ms: u64,
    pub sample_count: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AudioSampleSnapshot {
    pub samples: Vec<f32>,
    pub sample_rate_hz: u32,
    pub channels: u16,
}

#[derive(Debug)]
pub struct RollingAudioBuffer {
    capacity_samples_per_source: usize,
    sources: HashMap<String, BufferedAudioSource>,
}

#[derive(Debug)]
struct AudioChunkAccumulator {
    target_duration_ms: u32,
    sources: HashMap<String, BufferedAudioChunkSource>,
}

#[derive(Debug)]
struct BufferedAudioChunkSource {
    samples: VecDeque<f32>,
    sample_rate_hz: u32,
    channels: u16,
    sequence: u64,
}

impl AudioChunkAccumulator {
    fn new(target_duration_ms: u32) -> Self {
        Self {
            target_duration_ms: target_duration_ms.max(1),
            sources: HashMap::new(),
        }
    }

    fn clear(&mut self) {
        self.sources.clear();
    }

    fn push(
        &mut self,
        source: &str,
        device_id: &str,
        snapshot: &AudioSampleSnapshot,
    ) -> Vec<AudioChunkEvent> {
        let entry =
            self.sources
                .entry(source.to_string())
                .or_insert_with(|| BufferedAudioChunkSource {
                    samples: VecDeque::new(),
                    sample_rate_hz: snapshot.sample_rate_hz,
                    channels: snapshot.channels,
                    sequence: 0,
                });

        if entry.sample_rate_hz != snapshot.sample_rate_hz || entry.channels != snapshot.channels {
            entry.samples.clear();
            entry.sample_rate_hz = snapshot.sample_rate_hz;
            entry.channels = snapshot.channels;
            entry.sequence = 0;
        }

        entry.samples.extend(
            snapshot
                .samples
                .iter()
                .map(|sample| sample.clamp(-1.0, 1.0)),
        );

        let target_samples = chunk_target_sample_count(
            self.target_duration_ms,
            entry.sample_rate_hz,
            entry.channels,
        );
        let mut events = Vec::new();

        while entry.samples.len() >= target_samples {
            let samples = entry.samples.drain(..target_samples).collect::<Vec<_>>();
            entry.sequence += 1;
            events.push(AudioChunkEvent::from_samples(
                source,
                device_id,
                entry.sequence,
                &samples,
                entry.sample_rate_hz,
                entry.channels,
            ));
        }

        events
    }
}

#[derive(Debug)]
struct BufferedAudioSource {
    samples: VecDeque<f32>,
    sample_rate_hz: u32,
    channels: u16,
}

impl RollingAudioBuffer {
    pub fn new(capacity_samples_per_source: usize) -> Self {
        Self {
            capacity_samples_per_source: capacity_samples_per_source.max(1),
            sources: HashMap::new(),
        }
    }

    pub fn push(&mut self, source: &str, sample_rate_hz: u32, channels: u16, samples: &[f32]) {
        let entry = self
            .sources
            .entry(source.to_string())
            .or_insert_with(|| BufferedAudioSource {
                samples: VecDeque::with_capacity(self.capacity_samples_per_source),
                sample_rate_hz,
                channels,
            });
        entry.sample_rate_hz = sample_rate_hz;
        entry.channels = channels;

        for sample in samples {
            if entry.samples.len() == self.capacity_samples_per_source {
                let _ = entry.samples.pop_front();
            }
            entry.samples.push_back(sample.clamp(-1.0, 1.0));
        }
    }

    pub fn snapshot(&self, source: &str) -> Option<AudioSampleSnapshot> {
        let entry = self.sources.get(source)?;
        if entry.samples.is_empty() {
            return None;
        }

        Some(AudioSampleSnapshot {
            samples: entry.samples.iter().copied().collect(),
            sample_rate_hz: entry.sample_rate_hz,
            channels: entry.channels,
        })
    }

    pub fn clear(&mut self) {
        self.sources.clear();
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
        source_selection: CaptureSourceSelection,
        processing_settings: AudioProcessingSettings,
    ) -> anyhow::Result<AudioCaptureState> {
        self.stop();

        if !source_selection.has_any_source() {
            return Err(anyhow::anyhow!(
                "No audio capture source selected for manual transcript mode"
            ));
        }

        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let shared_state = self.state.clone();
        let shared_samples = self.samples.clone();
        let shared_chunks = self.chunks.clone();
        if let Ok(mut samples) = shared_samples.lock() {
            samples.clear();
        }
        if let Ok(mut chunks) = shared_chunks.lock() {
            chunks.clear();
        }
        let system_device_id = system_device_id.to_string();
        let microphone_device_id = microphone_device_id.to_string();
        let thread = thread::spawn(move || {
            run_audio_capture_thread(
                app_handle,
                system_device_id,
                microphone_device_id,
                source_selection,
                processing_settings,
                shared_state,
                shared_samples,
                shared_chunks,
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

    pub fn save_snapshot(
        &self,
        app_handle: AppHandle,
        source: &str,
        max_seconds: u32,
    ) -> anyhow::Result<CaptureSnapshot> {
        let snapshot = self
            .samples
            .lock()
            .map_err(|_| anyhow::anyhow!("Audio capture buffer is unavailable"))?
            .snapshot(source)
            .ok_or_else(|| anyhow::anyhow!("No {source} audio has been captured yet"))?;
        let snapshot = trim_snapshot(snapshot, max_seconds.max(1));
        let duration_ms = snapshot_duration_ms(&snapshot);
        let output_dir = app_handle.path().app_cache_dir()?.join("live-capture");
        std::fs::create_dir_all(&output_dir)?;
        let audio_path = output_dir.join(format!(
            "{}-{}.wav",
            source,
            chrono::Utc::now().timestamp_millis()
        ));
        write_wav_file(&audio_path, &snapshot)?;

        Ok(CaptureSnapshot {
            source: source.to_string(),
            audio_path: audio_path.display().to_string(),
            sample_rate_hz: snapshot.sample_rate_hz,
            channels: snapshot.channels,
            duration_ms,
            sample_count: snapshot.samples.len(),
        })
    }
}

pub fn delete_capture_snapshot_file(
    app_cache_dir: &Path,
    audio_path: &str,
) -> anyhow::Result<bool> {
    let trimmed = audio_path.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }

    let path = PathBuf::from(trimmed);
    if !path.exists() {
        return Ok(false);
    }

    let live_capture_dir = app_cache_dir.join("live-capture");
    let canonical_live_capture_dir = std::fs::canonicalize(&live_capture_dir)?;
    let canonical_path = std::fs::canonicalize(&path)?;

    if !canonical_path.starts_with(&canonical_live_capture_dir) {
        return Err(anyhow::anyhow!(
            "Refusing to delete capture snapshot outside the live-capture cache"
        ));
    }

    if !canonical_path.is_file() {
        return Err(anyhow::anyhow!("Capture snapshot path is not a file"));
    }

    let is_wav = canonical_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("wav"));
    if !is_wav {
        return Err(anyhow::anyhow!(
            "Capture snapshot cleanup only accepts WAV files"
        ));
    }

    std::fs::remove_file(canonical_path)?;
    Ok(true)
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
    use base64::Engine;

    use super::{
        apply_audio_level_to_state, apply_audio_processing, classify_device_kind,
        delete_capture_snapshot_file, prepare_stt_samples, stable_device_id, AudioCaptureManager,
        AudioCaptureState, AudioChunkAccumulator, AudioChunkEvent, AudioLevelEvent,
        AudioProcessingSettings, CaptureSourceSelection, RollingAudioBuffer, TARGET_CHANNELS,
        TARGET_SAMPLE_RATE_HZ,
    };

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

    #[test]
    fn applies_dual_stream_audio_events_to_capture_state() {
        let mut state = AudioCaptureState {
            running: true,
            system_device_id: "system-1".to_string(),
            microphone_device_id: "mic-1".to_string(),
            sample_rate_hz: 48_000,
            channels: 2,
            microphone_level: 0.0,
            system_level: 0.0,
            gain_db: 0.0,
            noise_gate_db: -80.0,
            system_capture_supported: true,
            error: None,
        };

        let microphone_event =
            AudioLevelEvent::from_samples("microphone", "mic-1", &[0.1, 0.4], 48_000, 2);
        let system_event =
            AudioLevelEvent::from_samples("system", "system-1", &[0.2, -0.8], 48_000, 2);

        apply_audio_level_to_state(&mut state, &microphone_event);
        apply_audio_level_to_state(&mut state, &system_event);

        assert!((state.microphone_level - 0.4).abs() < 0.001);
        assert!((state.system_level - 0.8).abs() < 0.001);
        assert!(state.system_capture_supported);
    }

    #[test]
    fn maps_capture_modes_to_requested_sources() {
        let microphone = CaptureSourceSelection::from_mode(Some("microphone"), Some(false));
        assert!(microphone.microphone);
        assert!(!microphone.system);

        let system = CaptureSourceSelection::from_mode(Some("system"), Some(false));
        assert!(!system.microphone);
        assert!(system.system);

        let dual = CaptureSourceSelection::from_mode(Some("dual"), Some(true));
        assert!(dual.microphone);
        assert!(dual.system);

        let manual = CaptureSourceSelection::from_mode(Some("manual"), Some(false));
        assert!(!manual.microphone);
        assert!(!manual.system);
    }

    #[test]
    fn applies_gain_and_noise_gate_to_pcm_samples() {
        let settings = AudioProcessingSettings {
            gain_db: 6.0,
            noise_gate_db: -40.0,
        };

        let processed = apply_audio_processing(&[0.005, 0.2, -0.6], settings);

        assert_eq!(processed[0], 0.0);
        assert!((processed[1] - 0.399).abs() < 0.001);
        assert_eq!(processed[2], -1.0);
    }

    #[test]
    fn rolling_audio_buffer_keeps_recent_capture_samples() {
        let mut buffer = RollingAudioBuffer::new(4);

        buffer.push("microphone", 16_000, 1, &[0.1, 0.2, 0.3]);
        buffer.push("microphone", 16_000, 1, &[0.4, 0.5, 0.6]);
        buffer.push("system", 48_000, 2, &[0.7]);

        let microphone = buffer.snapshot("microphone").expect("microphone snapshot");
        let system = buffer.snapshot("system").expect("system snapshot");

        assert_eq!(microphone.samples, vec![0.3, 0.4, 0.5, 0.6]);
        assert_eq!(microphone.sample_rate_hz, 16_000);
        assert_eq!(microphone.channels, 1);
        assert_eq!(system.samples, vec![0.7]);
        assert_eq!(system.sample_rate_hz, 48_000);
        assert_eq!(system.channels, 2);
    }

    #[test]
    fn prepares_stt_samples_by_downmixing_capture_to_mono() {
        let snapshot = prepare_stt_samples(
            &[0.5, -0.5, 0.25, 0.75],
            TARGET_SAMPLE_RATE_HZ,
            2,
            AudioProcessingSettings::default(),
        );

        assert_eq!(snapshot.sample_rate_hz, TARGET_SAMPLE_RATE_HZ);
        assert_eq!(snapshot.channels, TARGET_CHANNELS);
        assert_eq!(snapshot.samples, vec![0.0, 0.5]);
    }

    #[test]
    fn prepares_stt_samples_by_resampling_capture_to_sixteen_khz() {
        let snapshot = prepare_stt_samples(
            &[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
            48_000,
            1,
            AudioProcessingSettings::default(),
        );

        assert_eq!(snapshot.sample_rate_hz, TARGET_SAMPLE_RATE_HZ);
        assert_eq!(snapshot.channels, TARGET_CHANNELS);
        assert_eq!(snapshot.samples.len(), 3);
        assert!((snapshot.samples[0] - 0.0).abs() < 0.001);
        assert!((snapshot.samples[1] - 0.3).abs() < 0.001);
        assert!((snapshot.samples[2] - 0.6).abs() < 0.001);
    }

    #[test]
    fn builds_streaming_audio_chunk_events_as_pcm16_base64() {
        let event = AudioChunkEvent::from_samples(
            "microphone",
            "mic-1",
            7,
            &vec![0.25; 1_600],
            TARGET_SAMPLE_RATE_HZ,
            TARGET_CHANNELS,
        );

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(event.pcm16_base64.as_bytes())
            .expect("valid base64 PCM");

        assert_eq!(event.source, "microphone");
        assert_eq!(event.device_id, "mic-1");
        assert_eq!(event.sequence, 7);
        assert_eq!(event.sample_rate_hz, TARGET_SAMPLE_RATE_HZ);
        assert_eq!(event.channels, TARGET_CHANNELS);
        assert_eq!(event.duration_ms, 100);
        assert_eq!(event.sample_count, 1_600);
        assert_eq!(decoded.len(), 3_200);
    }

    #[test]
    fn accumulates_low_latency_audio_chunks_per_source() {
        let mut accumulator = AudioChunkAccumulator::new(250);
        let first_half = super::AudioSampleSnapshot {
            samples: vec![0.1; 2_000],
            sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
            channels: TARGET_CHANNELS,
        };
        let second_half = super::AudioSampleSnapshot {
            samples: vec![0.2; 2_000],
            sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
            channels: TARGET_CHANNELS,
        };
        let system_chunk = super::AudioSampleSnapshot {
            samples: vec![0.3; 4_000],
            sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
            channels: TARGET_CHANNELS,
        };

        assert!(accumulator
            .push("microphone", "mic-1", &first_half)
            .is_empty());

        let microphone_events = accumulator.push("microphone", "mic-1", &second_half);
        let system_events = accumulator.push("system", "system-1", &system_chunk);

        assert_eq!(microphone_events.len(), 1);
        assert_eq!(microphone_events[0].sequence, 1);
        assert_eq!(microphone_events[0].sample_count, 4_000);
        assert_eq!(microphone_events[0].duration_ms, 250);
        assert_eq!(system_events.len(), 1);
        assert_eq!(system_events[0].sequence, 1);
        assert_eq!(system_events[0].source, "system");
    }

    #[test]
    fn deletes_only_live_capture_snapshot_files() {
        let cache_dir =
            std::env::temp_dir().join(format!("caveman-audio-cleanup-{}", uuid::Uuid::new_v4()));
        let live_capture_dir = cache_dir.join("live-capture");
        std::fs::create_dir_all(&live_capture_dir).expect("create live capture dir");
        let snapshot = live_capture_dir.join("microphone-123.wav");
        std::fs::write(&snapshot, b"wav").expect("write snapshot");
        let outside = cache_dir.join("keep.wav");
        std::fs::write(&outside, b"keep").expect("write outside file");

        assert!(
            delete_capture_snapshot_file(&cache_dir, &snapshot.display().to_string())
                .expect("delete snapshot")
        );
        assert!(!snapshot.exists());
        assert!(
            delete_capture_snapshot_file(&cache_dir, &snapshot.display().to_string())
                .expect("ignore missing snapshot")
                == false
        );
        assert!(delete_capture_snapshot_file(&cache_dir, &outside.display().to_string()).is_err());
        assert!(outside.exists());

        std::fs::remove_dir_all(cache_dir).expect("clean temp dir");
    }
}

fn build_input_stream(
    device: &cpal::Device,
    source: &'static str,
    sample_format: cpal::SampleFormat,
    config: &cpal::StreamConfig,
    device_id: String,
    sample_rate_hz: u32,
    channels: u16,
    processing_settings: AudioProcessingSettings,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    shared_samples: Arc<Mutex<RollingAudioBuffer>>,
    shared_chunks: Arc<Mutex<AudioChunkAccumulator>>,
    app_handle: AppHandle,
) -> anyhow::Result<cpal::Stream> {
    match sample_format {
        cpal::SampleFormat::F32 => {
            let error_state = shared_state.clone();
            let callback_device_id = device_id.clone();
            let callback_samples = shared_samples.clone();
            let callback_chunks = shared_chunks.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[f32], _| {
                    process_capture_samples(
                        source,
                        data.iter().copied(),
                        &callback_device_id,
                        sample_rate_hz,
                        channels,
                        processing_settings,
                        &shared_state,
                        &callback_samples,
                        &callback_chunks,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        cpal::SampleFormat::I16 => {
            let error_state = shared_state.clone();
            let callback_device_id = device_id.clone();
            let callback_samples = shared_samples.clone();
            let callback_chunks = shared_chunks.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[i16], _| {
                    process_capture_samples(
                        source,
                        data.iter().map(|sample| *sample as f32 / i16::MAX as f32),
                        &callback_device_id,
                        sample_rate_hz,
                        channels,
                        processing_settings,
                        &shared_state,
                        &callback_samples,
                        &callback_chunks,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        cpal::SampleFormat::U16 => {
            let error_state = shared_state.clone();
            let callback_device_id = device_id.clone();
            let callback_samples = shared_samples.clone();
            let callback_chunks = shared_chunks.clone();
            Ok(device.build_input_stream(
                config,
                move |data: &[u16], _| {
                    process_capture_samples(
                        source,
                        data.iter()
                            .map(|sample| (*sample as f32 - 32768.0) / 32768.0),
                        &callback_device_id,
                        sample_rate_hz,
                        channels,
                        processing_settings,
                        &shared_state,
                        &callback_samples,
                        &callback_chunks,
                        &app_handle,
                    );
                },
                move |error| update_stream_error(&error_state, error),
                None,
            )?)
        }
        unsupported => Err(anyhow::anyhow!(
            "Unsupported {source} sample format: {unsupported:?}"
        )),
    }
}

fn run_audio_capture_thread(
    app_handle: AppHandle,
    system_device_id: String,
    microphone_device_id: String,
    source_selection: CaptureSourceSelection,
    processing_settings: AudioProcessingSettings,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    shared_samples: Arc<Mutex<RollingAudioBuffer>>,
    shared_chunks: Arc<Mutex<AudioChunkAccumulator>>,
    stop_rx: mpsc::Receiver<()>,
    ready_tx: mpsc::Sender<Result<AudioCaptureState, String>>,
) {
    let result = (|| -> anyhow::Result<Vec<cpal::Stream>> {
        let host = cpal::default_host();
        let mut streams = Vec::new();
        let mut errors = Vec::new();
        let mut state = AudioCaptureState {
            running: true,
            system_device_id: if source_selection.system {
                system_device_id.clone()
            } else {
                String::new()
            },
            microphone_device_id: if source_selection.microphone {
                microphone_device_id.clone()
            } else {
                String::new()
            },
            sample_rate_hz: 16_000,
            channels: 1,
            microphone_level: 0.0,
            system_level: 0.0,
            gain_db: processing_settings.gain_db,
            noise_gate_db: processing_settings.noise_gate_db,
            system_capture_supported: false,
            error: None,
        };

        if source_selection.microphone {
            match build_microphone_stream(
                &host,
                &microphone_device_id,
                processing_settings,
                shared_state.clone(),
                shared_samples.clone(),
                shared_chunks.clone(),
                app_handle.clone(),
            ) {
                Ok(spec) => {
                    state.microphone_device_id = spec.device_id;
                    streams.push(spec.stream);
                }
                Err(error) => errors.push(format!("microphone: {error}")),
            }
        }

        if source_selection.system {
            match build_system_loopback_stream(
                &host,
                &system_device_id,
                processing_settings,
                shared_state.clone(),
                shared_samples,
                shared_chunks,
                app_handle,
            ) {
                Ok(spec) => {
                    state.system_device_id = spec.device_id;
                    state.system_capture_supported = true;
                    streams.push(spec.stream);
                }
                Err(error) => errors.push(format!("system audio: {error}")),
            }
        }

        if streams.is_empty() {
            return Err(anyhow::anyhow!(errors.join("; ")));
        }

        if !errors.is_empty() {
            state.error = Some(errors.join("; "));
        }
        state.sample_rate_hz = TARGET_SAMPLE_RATE_HZ;
        state.channels = TARGET_CHANNELS;

        if let Ok(mut shared) = shared_state.lock() {
            *shared = state;
        }

        for stream in &streams {
            stream.play()?;
        }

        Ok(streams)
    })();

    match result {
        Ok(streams) => {
            let ready_state = shared_state
                .lock()
                .map(|state| state.clone())
                .unwrap_or_else(|_| stopped_state());
            let _ = ready_tx.send(Ok(ready_state));
            let _ = stop_rx.recv();
            drop(streams);
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

struct CaptureStreamSpec {
    stream: cpal::Stream,
    device_id: String,
}

fn build_microphone_stream(
    host: &cpal::Host,
    microphone_device_id: &str,
    processing_settings: AudioProcessingSettings,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    shared_samples: Arc<Mutex<RollingAudioBuffer>>,
    shared_chunks: Arc<Mutex<AudioChunkAccumulator>>,
    app_handle: AppHandle,
) -> anyhow::Result<CaptureStreamSpec> {
    let device = resolve_input_device(host, microphone_device_id)
        .ok_or_else(|| anyhow::anyhow!("No microphone input device is available"))?;
    let selected_device_id = resolve_input_device_id(host, &device, microphone_device_id);
    let supported_config = device.default_input_config()?;
    let sample_rate_hz = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let stream_config = supported_config.clone().into();
    let stream = build_input_stream(
        &device,
        "microphone",
        supported_config.sample_format(),
        &stream_config,
        selected_device_id.clone(),
        sample_rate_hz,
        channels,
        processing_settings,
        shared_state,
        shared_samples,
        shared_chunks,
        app_handle,
    )?;

    Ok(CaptureStreamSpec {
        stream,
        device_id: selected_device_id,
    })
}

fn build_system_loopback_stream(
    host: &cpal::Host,
    system_device_id: &str,
    processing_settings: AudioProcessingSettings,
    shared_state: Arc<Mutex<AudioCaptureState>>,
    shared_samples: Arc<Mutex<RollingAudioBuffer>>,
    shared_chunks: Arc<Mutex<AudioChunkAccumulator>>,
    app_handle: AppHandle,
) -> anyhow::Result<CaptureStreamSpec> {
    // CPAL's WASAPI backend enables loopback when an output device is opened as an input stream.
    let device = resolve_output_device(host, system_device_id)
        .ok_or_else(|| anyhow::anyhow!("No system output device is available"))?;
    let selected_device_id = resolve_output_device_id(host, &device, system_device_id);
    let supported_config = device.default_output_config()?;
    let sample_rate_hz = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let stream_config = supported_config.clone().into();
    let stream = build_input_stream(
        &device,
        "system",
        supported_config.sample_format(),
        &stream_config,
        selected_device_id.clone(),
        sample_rate_hz,
        channels,
        processing_settings,
        shared_state,
        shared_samples,
        shared_chunks,
        app_handle,
    )?;

    Ok(CaptureStreamSpec {
        stream,
        device_id: selected_device_id,
    })
}

fn update_stream_error(shared_state: &Arc<Mutex<AudioCaptureState>>, error: cpal::StreamError) {
    if let Ok(mut state) = shared_state.lock() {
        state.error = Some(error.to_string());
    }
}

fn process_capture_samples(
    source: &'static str,
    samples: impl Iterator<Item = f32>,
    device_id: &str,
    sample_rate_hz: u32,
    channels: u16,
    processing_settings: AudioProcessingSettings,
    shared_state: &Arc<Mutex<AudioCaptureState>>,
    shared_samples: &Arc<Mutex<RollingAudioBuffer>>,
    shared_chunks: &Arc<Mutex<AudioChunkAccumulator>>,
    app_handle: &AppHandle,
) {
    let samples = samples
        .map(|sample| sample.clamp(-1.0, 1.0))
        .collect::<Vec<_>>();
    let snapshot = prepare_stt_samples(&samples, sample_rate_hz, channels, processing_settings);
    let event = AudioLevelEvent::from_samples(
        source,
        device_id,
        &snapshot.samples,
        snapshot.sample_rate_hz,
        snapshot.channels,
    );

    if let Ok(mut buffer) = shared_samples.lock() {
        buffer.push(
            source,
            snapshot.sample_rate_hz,
            snapshot.channels,
            &snapshot.samples,
        );
    }

    if let Ok(mut state) = shared_state.lock() {
        apply_audio_level_to_state(&mut state, &event);
    }

    let _ = app_handle.emit("audio-level", event);

    let chunk_events = shared_chunks
        .lock()
        .map(|mut chunks| chunks.push(source, device_id, &snapshot))
        .unwrap_or_default();
    for chunk_event in chunk_events {
        let _ = app_handle.emit("audio-chunk", chunk_event);
    }
}

fn prepare_stt_samples(
    samples: &[f32],
    sample_rate_hz: u32,
    channels: u16,
    processing_settings: AudioProcessingSettings,
) -> AudioSampleSnapshot {
    let mono = downmix_interleaved_to_mono(samples, channels);
    let resampled = resample_mono_linear(&mono, sample_rate_hz, TARGET_SAMPLE_RATE_HZ);
    let processed = apply_audio_processing(&resampled, processing_settings);

    AudioSampleSnapshot {
        samples: processed,
        sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
        channels: TARGET_CHANNELS,
    }
}

fn downmix_interleaved_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    let channel_count = channels as usize;
    if channel_count <= 1 {
        return samples.to_vec();
    }

    samples
        .chunks(channel_count)
        .map(|frame| frame.iter().copied().sum::<f32>() / frame.len() as f32)
        .collect()
}

fn resample_mono_linear(samples: &[f32], input_rate_hz: u32, output_rate_hz: u32) -> Vec<f32> {
    if samples.is_empty() || input_rate_hz == 0 || input_rate_hz == output_rate_hz {
        return samples.to_vec();
    }

    let output_len =
        ((samples.len() as f64 * output_rate_hz as f64) / input_rate_hz as f64).floor() as usize;
    let output_len = output_len.max(1);
    let ratio = input_rate_hz as f64 / output_rate_hz as f64;

    (0..output_len)
        .map(|index| {
            let source_position = index as f64 * ratio;
            let left_index = source_position.floor() as usize;
            let right_index = (left_index + 1).min(samples.len() - 1);
            let fraction = (source_position - left_index as f64) as f32;
            let left = samples[left_index.min(samples.len() - 1)];
            let right = samples[right_index];
            left + (right - left) * fraction
        })
        .collect()
}

fn chunk_target_sample_count(target_duration_ms: u32, sample_rate_hz: u32, channels: u16) -> usize {
    let samples = sample_rate_hz as u64 * channels.max(1) as u64 * target_duration_ms.max(1) as u64;
    ((samples + 999) / 1000).max(1) as usize
}

fn samples_duration_ms(sample_count: usize, sample_rate_hz: u32, channels: u16) -> u64 {
    if sample_rate_hz == 0 || channels == 0 {
        return 0;
    }

    ((sample_count as f64 / channels as f64 / sample_rate_hz as f64) * 1000.0).round() as u64
}

fn encode_pcm16_base64(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        bytes.extend_from_slice(&pcm.to_le_bytes());
    }

    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn apply_audio_processing(
    samples: &[f32],
    processing_settings: AudioProcessingSettings,
) -> Vec<f32> {
    let gain = 10_f32.powf(processing_settings.gain_db / 20.0);
    let noise_gate = 10_f32.powf(processing_settings.noise_gate_db / 20.0);

    samples
        .iter()
        .map(|sample| {
            let sample = sample.clamp(-1.0, 1.0);
            if sample.abs() < noise_gate {
                0.0
            } else {
                (sample * gain).clamp(-1.0, 1.0)
            }
        })
        .collect()
}

fn trim_snapshot(mut snapshot: AudioSampleSnapshot, max_seconds: u32) -> AudioSampleSnapshot {
    let max_samples =
        snapshot.sample_rate_hz as usize * snapshot.channels as usize * max_seconds as usize;
    if snapshot.samples.len() > max_samples {
        snapshot.samples = snapshot.samples[snapshot.samples.len() - max_samples..].to_vec();
    }
    snapshot
}

fn snapshot_duration_ms(snapshot: &AudioSampleSnapshot) -> u64 {
    if snapshot.sample_rate_hz == 0 || snapshot.channels == 0 {
        return 0;
    }

    ((snapshot.samples.len() as f64 / snapshot.channels as f64 / snapshot.sample_rate_hz as f64)
        * 1000.0)
        .round() as u64
}

fn write_wav_file(path: &PathBuf, snapshot: &AudioSampleSnapshot) -> anyhow::Result<()> {
    let mut file = std::fs::File::create(path)?;
    let bytes_per_sample = 2_u16;
    let data_bytes = snapshot.samples.len() as u32 * bytes_per_sample as u32;
    let byte_rate = snapshot.sample_rate_hz * snapshot.channels as u32 * bytes_per_sample as u32;
    let block_align = snapshot.channels * bytes_per_sample;

    file.write_all(b"RIFF")?;
    file.write_all(&(36_u32 + data_bytes).to_le_bytes())?;
    file.write_all(b"WAVE")?;
    file.write_all(b"fmt ")?;
    file.write_all(&16_u32.to_le_bytes())?;
    file.write_all(&1_u16.to_le_bytes())?;
    file.write_all(&snapshot.channels.to_le_bytes())?;
    file.write_all(&snapshot.sample_rate_hz.to_le_bytes())?;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&block_align.to_le_bytes())?;
    file.write_all(&(bytes_per_sample * 8).to_le_bytes())?;
    file.write_all(b"data")?;
    file.write_all(&data_bytes.to_le_bytes())?;

    for sample in &snapshot.samples {
        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        file.write_all(&pcm.to_le_bytes())?;
    }

    Ok(())
}

fn apply_audio_level_to_state(state: &mut AudioCaptureState, event: &AudioLevelEvent) {
    match event.source.as_str() {
        "microphone" => state.microphone_level = event.level,
        "system" => {
            state.system_level = event.level;
            state.system_capture_supported = true;
        }
        _ => {}
    }
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

fn resolve_output_device(host: &cpal::Host, requested_id: &str) -> Option<cpal::Device> {
    if requested_id == "default" || requested_id == "system-default" {
        return host.default_output_device();
    }

    let outputs = host.output_devices().ok()?;
    for (index, device) in outputs.enumerate() {
        let label = device.name().ok()?;
        let kind = classify_device_kind(&label, "system");
        if stable_device_id(&kind, &label, index) == requested_id || label == requested_id {
            return Some(device);
        }
    }

    host.default_output_device()
}

fn resolve_input_device_id(host: &cpal::Host, device: &cpal::Device, requested_id: &str) -> String {
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

fn resolve_output_device_id(
    host: &cpal::Host,
    device: &cpal::Device,
    requested_id: &str,
) -> String {
    if requested_id != "default" && requested_id != "system-default" {
        return requested_id.to_string();
    }

    let Ok(target_name) = device.name() else {
        return requested_id.to_string();
    };

    if let Ok(outputs) = host.output_devices() {
        for (index, candidate) in outputs.enumerate() {
            if candidate.name().ok().as_deref() == Some(target_name.as_str()) {
                let kind = classify_device_kind(&target_name, "system");
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
        gain_db: 0.0,
        noise_gate_db: -80.0,
        system_capture_supported: false,
        error: None,
    }
}
