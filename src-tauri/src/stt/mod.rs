use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttProviderStatus {
    pub id: String,
    pub label: String,
    pub mode: String,
    pub available: bool,
    pub latency_target_ms: u16,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperRequest {
    pub binary_path: String,
    pub model_path: String,
    pub audio_path: String,
    pub language: Option<String>,
    pub diarization_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEvent {
    pub speaker: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub confidence: Option<f32>,
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WhisperJson {
    result: Option<WhisperResult>,
    transcription: Vec<WhisperSegment>,
}

#[derive(Debug, Deserialize)]
struct WhisperResult {
    language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WhisperSegment {
    offsets: Option<WhisperOffsets>,
    text: String,
    speaker: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WhisperOffsets {
    from: i64,
    to: i64,
}

pub fn list_stt_providers() -> Vec<SttProviderStatus> {
    vec![
        SttProviderStatus {
            id: "local-whisper".to_string(),
            label: "whisper.cpp sidecar".to_string(),
            mode: "local".to_string(),
            available: true,
            latency_target_ms: 500,
        },
        SttProviderStatus {
            id: "deepgram".to_string(),
            label: "Deepgram WebSocket".to_string(),
            mode: "cloud".to_string(),
            available: false,
            latency_target_ms: 250,
        },
    ]
}

pub fn transcribe_with_local_whisper(
    request: LocalWhisperRequest,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    validate_local_whisper_request(&request)?;

    let output_base = whisper_output_base(&request.audio_path);
    let output_json = output_base.with_extension("json");
    let mut command = Command::new(&request.binary_path);
    command
        .arg("-m")
        .arg(&request.model_path)
        .arg("-f")
        .arg(&request.audio_path)
        .arg("-l")
        .arg(request.language.as_deref().unwrap_or("auto"))
        .arg("-oj")
        .arg("-ojf")
        .arg("-of")
        .arg(&output_base)
        .arg("-np");

    if request.diarization_enabled.unwrap_or(false) {
        command.arg("-di");
    }

    let output = command.output()?;
    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "Whisper failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let json = std::fs::read_to_string(&output_json).or_else(|_| {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if stdout.trim().starts_with('{') {
            Ok(stdout)
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!(
                    "Whisper JSON output was not found at {}",
                    output_json.display()
                ),
            ))
        }
    })?;

    parse_whisper_json(&json)
}

pub fn validate_local_whisper_request(request: &LocalWhisperRequest) -> anyhow::Result<()> {
    validate_required_file(
        &request.binary_path,
        "Whisper binary path is required",
        "Whisper binary path does not exist",
    )?;
    validate_required_file(
        &request.model_path,
        "Whisper model path is required",
        "Whisper model path does not exist",
    )?;
    validate_required_file(
        &request.audio_path,
        "Audio file path is required",
        "Audio file path does not exist",
    )?;
    Ok(())
}

pub fn parse_whisper_json(json: &str) -> anyhow::Result<Vec<TranscriptEvent>> {
    let parsed: WhisperJson = serde_json::from_str(json)?;
    let language = parsed.result.and_then(|result| result.language);

    Ok(parsed
        .transcription
        .into_iter()
        .filter_map(|segment| {
            let text = segment.text.trim().to_string();
            if text.is_empty() {
                return None;
            }

            let offsets = segment.offsets.unwrap_or(WhisperOffsets { from: 0, to: 0 });
            Some(TranscriptEvent {
                speaker: whisper_speaker_to_caveman(segment.speaker.as_deref()),
                text,
                start_ms: offsets.from,
                end_ms: offsets.to,
                confidence: None,
                language: language.clone(),
            })
        })
        .collect())
}

fn validate_required_file(
    value: &str,
    missing_message: &str,
    not_found_message: &str,
) -> anyhow::Result<()> {
    if value.trim().is_empty() {
        return Err(anyhow::anyhow!(missing_message.to_string()));
    }

    if !Path::new(value).exists() {
        return Err(anyhow::anyhow!(not_found_message.to_string()));
    }

    Ok(())
}

fn whisper_output_base(audio_path: &str) -> PathBuf {
    let path = Path::new(audio_path);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("caveman-whisper");
    path.with_file_name(format!("{stem}.caveman-whisper"))
}

fn whisper_speaker_to_caveman(speaker: Option<&str>) -> String {
    match speaker.map(str::trim) {
        Some("0") | Some("SPEAKER_00") | Some("[SPEAKER_00]") => "interviewer".to_string(),
        Some("1") | Some("SPEAKER_01") | Some("[SPEAKER_01]") => "candidate".to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_whisper_json, validate_local_whisper_request, LocalWhisperRequest, TranscriptEvent,
    };

    #[test]
    fn parses_whisper_json_segments_with_language_and_speaker() {
        let json = r#"{
            "result": { "language": "en" },
            "transcription": [
                {
                    "timestamps": { "from": "00:00:00,000", "to": "00:00:01,420" },
                    "offsets": { "from": 0, "to": 1420 },
                    "text": " Explain HashMap internals",
                    "speaker": "0"
                },
                {
                    "offsets": { "from": 1500, "to": 2300 },
                    "text": " It uses buckets."
                }
            ]
        }"#;

        assert_eq!(
            parse_whisper_json(json).unwrap(),
            vec![
                TranscriptEvent {
                    speaker: "interviewer".to_string(),
                    text: "Explain HashMap internals".to_string(),
                    start_ms: 0,
                    end_ms: 1420,
                    confidence: None,
                    language: Some("en".to_string())
                },
                TranscriptEvent {
                    speaker: "unknown".to_string(),
                    text: "It uses buckets.".to_string(),
                    start_ms: 1500,
                    end_ms: 2300,
                    confidence: None,
                    language: Some("en".to_string())
                }
            ]
        );
    }

    #[test]
    fn validates_local_whisper_paths_before_running_sidecar() {
        let request = LocalWhisperRequest {
            binary_path: "".to_string(),
            model_path: "model.bin".to_string(),
            audio_path: "audio.wav".to_string(),
            language: Some("auto".to_string()),
            diarization_enabled: Some(true),
        };

        assert_eq!(
            validate_local_whisper_request(&request)
                .unwrap_err()
                .to_string(),
            "Whisper binary path is required"
        );
    }
}
