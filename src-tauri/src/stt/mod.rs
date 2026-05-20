use base64::Engine;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSttRequest {
    pub provider: String,
    pub api_key: String,
    pub audio_path: String,
    pub language: Option<String>,
    pub diarization_enabled: Option<bool>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepgramResponse {
    results: Option<DeepgramResults>,
}

#[derive(Debug, Deserialize)]
struct DeepgramResults {
    channels: Vec<DeepgramChannel>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    alternatives: Vec<DeepgramAlternative>,
    detected_language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepgramAlternative {
    transcript: Option<String>,
    confidence: Option<f32>,
    words: Option<Vec<DeepgramWord>>,
}

#[derive(Debug, Deserialize)]
struct DeepgramWord {
    word: String,
    punctuated_word: Option<String>,
    start: f64,
    end: f64,
    confidence: Option<f32>,
    speaker: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct AssemblyAiResponse {
    status: Option<String>,
    error: Option<String>,
    text: Option<String>,
    confidence: Option<f32>,
    language_code: Option<String>,
    utterances: Option<Vec<AssemblyAiUtterance>>,
}

#[derive(Debug, Deserialize)]
struct AssemblyAiUploadResponse {
    upload_url: String,
}

#[derive(Debug, Deserialize)]
struct AssemblyAiCreateResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct AssemblyAiUtterance {
    speaker: Option<String>,
    text: String,
    start: i64,
    end: i64,
    confidence: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct GoogleRecognizeResponse {
    results: Option<Vec<GoogleResult>>,
}

#[derive(Debug, Deserialize)]
struct GoogleResult {
    alternatives: Vec<GoogleAlternative>,
    #[serde(rename = "languageCode")]
    language_code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleAlternative {
    transcript: Option<String>,
    confidence: Option<f32>,
    words: Option<Vec<GoogleWord>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleWord {
    word: String,
    start_time: Option<String>,
    end_time: Option<String>,
    speaker_tag: Option<i64>,
}

#[derive(Debug)]
struct ParsedWord {
    speaker: String,
    text: String,
    start_ms: i64,
    end_ms: i64,
    confidence: Option<f32>,
}

#[derive(Debug, Clone, PartialEq)]
enum LanguageSelection {
    Auto,
    Single(String),
    Multiple {
        primary: String,
        alternatives: Vec<String>,
    },
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
            label: "Deepgram prerecorded API".to_string(),
            mode: "cloud".to_string(),
            available: true,
            latency_target_ms: 250,
        },
        SttProviderStatus {
            id: "assemblyai".to_string(),
            label: "AssemblyAI transcript API".to_string(),
            mode: "cloud".to_string(),
            available: true,
            latency_target_ms: 1000,
        },
        SttProviderStatus {
            id: "google".to_string(),
            label: "Google Speech-to-Text recognize".to_string(),
            mode: "cloud".to_string(),
            available: true,
            latency_target_ms: 1000,
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

pub fn transcribe_with_cloud_stt(request: CloudSttRequest) -> anyhow::Result<Vec<TranscriptEvent>> {
    validate_cloud_stt_request(&request)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;

    match request.provider.trim().to_lowercase().as_str() {
        "deepgram" => transcribe_with_deepgram(&client, &request),
        "assemblyai" => transcribe_with_assemblyai(&client, &request),
        "google" => transcribe_with_google(&client, &request),
        provider => Err(anyhow::anyhow!(
            "Unsupported cloud STT provider: {provider}"
        )),
    }
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

pub fn validate_cloud_stt_request(request: &CloudSttRequest) -> anyhow::Result<()> {
    if request.api_key.trim().is_empty() {
        return Err(anyhow::anyhow!("Cloud STT API key is required"));
    }
    validate_required_file(
        &request.audio_path,
        "Audio file path is required",
        "Audio file path does not exist",
    )
}

fn transcribe_with_deepgram(
    client: &Client,
    request: &CloudSttRequest,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let audio = std::fs::read(&request.audio_path)?;
    let mut url = reqwest::Url::parse(
        request
            .endpoint
            .as_deref()
            .filter(|endpoint| !endpoint.trim().is_empty())
            .unwrap_or("https://api.deepgram.com/v1/listen"),
    )?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("model", "nova-2");
        query.append_pair("smart_format", "true");
        query.append_pair(
            "diarize",
            if request.diarization_enabled.unwrap_or(true) {
                "true"
            } else {
                "false"
            },
        );
        for (key, value) in deepgram_language_params(request.language.as_deref()) {
            query.append_pair(key, &value);
        }
    }

    let json = client
        .post(url)
        .header("Authorization", format!("Token {}", request.api_key.trim()))
        .header("Content-Type", "application/octet-stream")
        .body(audio)
        .send()?
        .error_for_status()?
        .text()?;

    let language_hint = language_hint(request.language.as_deref());
    parse_deepgram_json(&json, language_hint.as_deref())
}

fn transcribe_with_assemblyai(
    client: &Client,
    request: &CloudSttRequest,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let audio = std::fs::read(&request.audio_path)?;
    let base_endpoint = request
        .endpoint
        .as_deref()
        .filter(|endpoint| !endpoint.trim().is_empty())
        .unwrap_or("https://api.assemblyai.com/v2");
    let base_endpoint = base_endpoint.trim_end_matches('/');
    let upload: AssemblyAiUploadResponse = client
        .post(format!("{base_endpoint}/upload"))
        .header("authorization", request.api_key.trim())
        .body(audio)
        .send()?
        .error_for_status()?
        .json()?;

    let mut payload = json!({
        "audio_url": upload.upload_url,
        "speaker_labels": request.diarization_enabled.unwrap_or(true)
    });
    match parse_language_selection(request.language.as_deref()) {
        LanguageSelection::Auto => {
            payload["language_detection"] = json!(true);
        }
        LanguageSelection::Single(language) => {
            payload["language_code"] = json!(language);
        }
        LanguageSelection::Multiple {
            primary,
            alternatives: _,
        } => {
            payload["language_code"] = json!(primary);
        }
    }

    let created: AssemblyAiCreateResponse = client
        .post(format!("{base_endpoint}/transcript"))
        .header("authorization", request.api_key.trim())
        .json(&payload)
        .send()?
        .error_for_status()?
        .json()?;

    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        let text = client
            .get(format!("{base_endpoint}/transcript/{}", created.id))
            .header("authorization", request.api_key.trim())
            .send()?
            .error_for_status()?
            .text()?;
        let status: AssemblyAiResponse = serde_json::from_str(&text)?;

        match status.status.as_deref() {
            Some("completed") => {
                let language_hint = language_hint(request.language.as_deref());
                return parse_assemblyai_json(&text, language_hint.as_deref());
            }
            Some("error") => {
                return Err(anyhow::anyhow!(
                    "AssemblyAI transcription failed: {}",
                    status.error.unwrap_or_else(|| "unknown error".to_string())
                ));
            }
            _ if Instant::now() >= deadline => {
                return Err(anyhow::anyhow!("AssemblyAI transcription timed out"));
            }
            _ => std::thread::sleep(Duration::from_secs(2)),
        }
    }
}

fn transcribe_with_google(
    client: &Client,
    request: &CloudSttRequest,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let audio = std::fs::read(&request.audio_path)?;
    let mut url = reqwest::Url::parse(
        request
            .endpoint
            .as_deref()
            .filter(|endpoint| !endpoint.trim().is_empty())
            .unwrap_or("https://speech.googleapis.com/v1/speech:recognize"),
    )?;
    url.query_pairs_mut()
        .append_pair("key", request.api_key.trim());

    let language_config = google_language_config(request.language.as_deref());
    let mut config = json!({
        "languageCode": language_config.primary,
        "enableAutomaticPunctuation": true,
        "enableWordTimeOffsets": true,
        "maxAlternatives": 1
    });
    if !language_config.alternatives.is_empty() {
        config["alternativeLanguageCodes"] = json!(language_config.alternatives);
    }
    if request.diarization_enabled.unwrap_or(true) {
        config["diarizationConfig"] = json!({
            "enableSpeakerDiarization": true,
            "minSpeakerCount": 2,
            "maxSpeakerCount": 2
        });
    }

    let payload = json!({
        "config": config,
        "audio": {
            "content": base64::engine::general_purpose::STANDARD.encode(audio)
        }
    });
    let json = client
        .post(url)
        .json(&payload)
        .send()?
        .error_for_status()?
        .text()?;

    let language_hint = language_hint(request.language.as_deref());
    parse_google_json(&json, language_hint.as_deref())
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

pub fn parse_deepgram_json(
    json: &str,
    language: Option<&str>,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let parsed: DeepgramResponse = serde_json::from_str(json)?;
    let mut events = Vec::new();

    for channel in parsed
        .results
        .map(|results| results.channels)
        .unwrap_or_default()
    {
        let detected_language = channel.detected_language.clone();
        let event_language = detected_language.as_deref().or(language);
        let Some(alternative) = channel.alternatives.into_iter().next() else {
            continue;
        };

        if let Some(words) = alternative.words.filter(|words| !words.is_empty()) {
            let parsed_words = words
                .into_iter()
                .map(|word| ParsedWord {
                    speaker: numeric_speaker_to_caveman(word.speaker, 0),
                    text: word.punctuated_word.unwrap_or(word.word),
                    start_ms: seconds_to_ms(word.start),
                    end_ms: seconds_to_ms(word.end),
                    confidence: word.confidence,
                })
                .collect::<Vec<_>>();
            events.extend(group_words_by_speaker(parsed_words, event_language));
        } else if let Some(transcript) = alternative
            .transcript
            .filter(|text| !text.trim().is_empty())
        {
            events.push(TranscriptEvent {
                speaker: "unknown".to_string(),
                text: transcript.trim().to_string(),
                start_ms: 0,
                end_ms: 0,
                confidence: alternative.confidence,
                language: event_language.map(str::to_string),
            });
        }
    }

    Ok(events)
}

pub fn parse_assemblyai_json(
    json: &str,
    language: Option<&str>,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let parsed: AssemblyAiResponse = serde_json::from_str(json)?;
    let detected_language = parsed.language_code.clone();
    let event_language = detected_language.as_deref().or(language);

    if let Some(utterances) = parsed
        .utterances
        .filter(|utterances| !utterances.is_empty())
    {
        return Ok(utterances
            .into_iter()
            .filter_map(|utterance| {
                let text = utterance.text.trim();
                if text.is_empty() {
                    return None;
                }

                Some(TranscriptEvent {
                    speaker: assembly_speaker_to_caveman(utterance.speaker.as_deref()),
                    text: text.to_string(),
                    start_ms: utterance.start,
                    end_ms: utterance.end,
                    confidence: utterance.confidence,
                    language: event_language.map(str::to_string),
                })
            })
            .collect());
    }

    Ok(parsed
        .text
        .filter(|text| !text.trim().is_empty())
        .map(|text| {
            vec![TranscriptEvent {
                speaker: "unknown".to_string(),
                text: text.trim().to_string(),
                start_ms: 0,
                end_ms: 0,
                confidence: parsed.confidence,
                language: event_language.map(str::to_string),
            }]
        })
        .unwrap_or_default())
}

pub fn parse_google_json(
    json: &str,
    language: Option<&str>,
) -> anyhow::Result<Vec<TranscriptEvent>> {
    let parsed: GoogleRecognizeResponse = serde_json::from_str(json)?;
    let mut events = Vec::new();

    for result in parsed.results.unwrap_or_default() {
        let detected_language = result.language_code.clone();
        let event_language = detected_language.as_deref().or(language);
        let Some(alternative) = result.alternatives.into_iter().next() else {
            continue;
        };

        if let Some(words) = alternative.words.filter(|words| !words.is_empty()) {
            let parsed_words = words
                .into_iter()
                .map(|word| ParsedWord {
                    speaker: numeric_speaker_to_caveman(word.speaker_tag, 1),
                    text: word.word,
                    start_ms: duration_to_ms(word.start_time.as_deref()),
                    end_ms: duration_to_ms(word.end_time.as_deref()),
                    confidence: alternative.confidence,
                })
                .collect::<Vec<_>>();
            events.extend(group_words_by_speaker(parsed_words, event_language));
        } else if let Some(transcript) = alternative
            .transcript
            .filter(|text| !text.trim().is_empty())
        {
            events.push(TranscriptEvent {
                speaker: "unknown".to_string(),
                text: transcript.trim().to_string(),
                start_ms: 0,
                end_ms: 0,
                confidence: alternative.confidence,
                language: event_language.map(str::to_string),
            });
        }
    }

    Ok(events)
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

fn parse_language_selection(language: Option<&str>) -> LanguageSelection {
    let Some(language) = language
        .map(str::trim)
        .filter(|language| !language.is_empty())
    else {
        return LanguageSelection::Auto;
    };

    if language.eq_ignore_ascii_case("auto") {
        return LanguageSelection::Auto;
    }

    let languages = language
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    match languages.as_slice() {
        [] => LanguageSelection::Auto,
        [single] => LanguageSelection::Single(single.clone()),
        [primary, alternatives @ ..] => LanguageSelection::Multiple {
            primary: primary.clone(),
            alternatives: alternatives.iter().take(3).cloned().collect(),
        },
    }
}

fn deepgram_language_params(language: Option<&str>) -> Vec<(&'static str, String)> {
    match parse_language_selection(language) {
        LanguageSelection::Auto => vec![("detect_language", "true".to_string())],
        LanguageSelection::Single(language) => vec![("language", language)],
        LanguageSelection::Multiple {
            primary,
            alternatives,
        } => {
            let mut params = vec![("detect_language", primary)];
            params.extend(
                alternatives
                    .into_iter()
                    .map(|language| ("detect_language", language)),
            );
            params
        }
    }
}

fn language_hint(language: Option<&str>) -> Option<String> {
    match parse_language_selection(language) {
        LanguageSelection::Auto => None,
        LanguageSelection::Single(language) => Some(language),
        LanguageSelection::Multiple {
            primary,
            alternatives: _,
        } => Some(primary),
    }
}

#[derive(Debug, Clone, PartialEq)]
struct GoogleLanguageConfig {
    primary: String,
    alternatives: Vec<String>,
}

fn google_language_config(language: Option<&str>) -> GoogleLanguageConfig {
    match parse_language_selection(language) {
        LanguageSelection::Auto => GoogleLanguageConfig {
            primary: "en-US".to_string(),
            alternatives: vec![
                "hi-IN".to_string(),
                "es-ES".to_string(),
                "fr-FR".to_string(),
            ],
        },
        LanguageSelection::Single(language) => GoogleLanguageConfig {
            primary: normalize_google_language(language),
            alternatives: Vec::new(),
        },
        LanguageSelection::Multiple {
            primary,
            alternatives,
        } => GoogleLanguageConfig {
            primary: normalize_google_language(primary),
            alternatives: alternatives
                .into_iter()
                .map(normalize_google_language)
                .take(3)
                .collect(),
        },
    }
}

fn normalize_google_language(language: String) -> String {
    match language.as_str() {
        "en" => "en-US".to_string(),
        "hi" => "hi-IN".to_string(),
        _ => language,
    }
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

fn numeric_speaker_to_caveman(speaker: Option<i64>, interviewer_value: i64) -> String {
    match speaker {
        Some(value) if value == interviewer_value => "interviewer".to_string(),
        Some(value) if value == interviewer_value + 1 => "candidate".to_string(),
        _ => "unknown".to_string(),
    }
}

fn assembly_speaker_to_caveman(speaker: Option<&str>) -> String {
    match speaker.map(str::trim) {
        Some("A") | Some("0") => "interviewer".to_string(),
        Some("B") | Some("1") => "candidate".to_string(),
        _ => "unknown".to_string(),
    }
}

fn group_words_by_speaker(words: Vec<ParsedWord>, language: Option<&str>) -> Vec<TranscriptEvent> {
    let mut events = Vec::new();
    let mut current_speaker = String::new();
    let mut current_words = Vec::new();
    let mut start_ms = 0;
    let mut end_ms = 0;
    let mut confidences = Vec::new();

    for word in words {
        if current_speaker != word.speaker && !current_words.is_empty() {
            events.push(build_grouped_event(
                &current_speaker,
                &current_words,
                start_ms,
                end_ms,
                &confidences,
                language,
            ));
            current_words.clear();
            confidences.clear();
        }

        if current_words.is_empty() {
            current_speaker = word.speaker.clone();
            start_ms = word.start_ms;
        }

        end_ms = word.end_ms;
        current_words.push(word.text);
        if let Some(confidence) = word.confidence {
            confidences.push(confidence);
        }
    }

    if !current_words.is_empty() {
        events.push(build_grouped_event(
            &current_speaker,
            &current_words,
            start_ms,
            end_ms,
            &confidences,
            language,
        ));
    }

    events
}

fn build_grouped_event(
    speaker: &str,
    words: &[String],
    start_ms: i64,
    end_ms: i64,
    confidences: &[f32],
    language: Option<&str>,
) -> TranscriptEvent {
    let confidence = if confidences.is_empty() {
        None
    } else {
        Some(confidences.iter().sum::<f32>() / confidences.len() as f32)
    };

    TranscriptEvent {
        speaker: speaker.to_string(),
        text: words.join(" ").trim().to_string(),
        start_ms,
        end_ms,
        confidence,
        language: language.map(str::to_string),
    }
}

fn seconds_to_ms(seconds: f64) -> i64 {
    (seconds * 1000.0).round() as i64
}

fn duration_to_ms(duration: Option<&str>) -> i64 {
    duration
        .and_then(|value| value.trim_end_matches('s').parse::<f64>().ok())
        .map(seconds_to_ms)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{
        deepgram_language_params, google_language_config, parse_assemblyai_json,
        parse_deepgram_json, parse_google_json, parse_whisper_json, validate_local_whisper_request,
        GoogleLanguageConfig, LocalWhisperRequest, TranscriptEvent,
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

    #[test]
    fn configures_deepgram_auto_language_detection() {
        assert_eq!(
            deepgram_language_params(Some("auto")),
            vec![("detect_language", "true".to_string())]
        );
        assert_eq!(
            deepgram_language_params(Some("en,hi")),
            vec![
                ("detect_language", "en".to_string()),
                ("detect_language", "hi".to_string())
            ]
        );
    }

    #[test]
    fn configures_google_auto_language_detection_candidates() {
        assert_eq!(
            google_language_config(Some("auto")),
            GoogleLanguageConfig {
                primary: "en-US".to_string(),
                alternatives: vec![
                    "hi-IN".to_string(),
                    "es-ES".to_string(),
                    "fr-FR".to_string()
                ]
            }
        );
        assert_eq!(
            google_language_config(Some("en-US,hi-IN")),
            GoogleLanguageConfig {
                primary: "en-US".to_string(),
                alternatives: vec!["hi-IN".to_string()]
            }
        );
    }

    #[test]
    fn parses_deepgram_words_into_speaker_segments() {
        let json = r#"{
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "What is a hashmap? It stores key value pairs.",
                                "confidence": 0.94,
                                "words": [
                                    { "word": "what", "punctuated_word": "What", "start": 0.0, "end": 0.2, "confidence": 0.95, "speaker": 0 },
                                    { "word": "is", "punctuated_word": "is", "start": 0.2, "end": 0.3, "confidence": 0.95, "speaker": 0 },
                                    { "word": "a", "punctuated_word": "a", "start": 0.3, "end": 0.4, "confidence": 0.95, "speaker": 0 },
                                    { "word": "hashmap", "punctuated_word": "hashmap?", "start": 0.4, "end": 0.8, "confidence": 0.95, "speaker": 0 },
                                    { "word": "it", "punctuated_word": "It", "start": 1.2, "end": 1.4, "confidence": 0.9, "speaker": 1 },
                                    { "word": "stores", "punctuated_word": "stores", "start": 1.4, "end": 1.7, "confidence": 0.9, "speaker": 1 }
                                ]
                            }
                        ]
                    }
                ]
            }
        }"#;

        let events = parse_deepgram_json(json, Some("en")).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].speaker, "interviewer");
        assert_eq!(events[0].text, "What is a hashmap?");
        assert_eq!(events[1].speaker, "candidate");
        assert_eq!(events[1].text, "It stores");
    }

    #[test]
    fn parses_deepgram_detected_language() {
        let json = r#"{
            "results": {
                "channels": [
                    {
                        "detected_language": "hi",
                        "language_confidence": 0.98,
                        "alternatives": [
                            {
                                "transcript": "Namaste",
                                "confidence": 0.94
                            }
                        ]
                    }
                ]
            }
        }"#;

        let events = parse_deepgram_json(json, None).unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].language, Some("hi".to_string()));
    }

    #[test]
    fn parses_assemblyai_utterances() {
        let json = r#"{
            "status": "completed",
            "text": "Tell me about indexes. Indexes speed reads.",
            "language_code": "en",
            "confidence": 0.91,
            "utterances": [
                { "speaker": "A", "text": "Tell me about indexes.", "start": 0, "end": 1500, "confidence": 0.93 },
                { "speaker": "B", "text": "Indexes speed reads.", "start": 1800, "end": 3000, "confidence": 0.89 }
            ]
        }"#;

        let events = parse_assemblyai_json(json, Some("en")).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].speaker, "interviewer");
        assert_eq!(events[0].text, "Tell me about indexes.");
        assert_eq!(events[0].language, Some("en".to_string()));
        assert_eq!(events[1].speaker, "candidate");
    }

    #[test]
    fn parses_google_recognize_words_with_speaker_tags() {
        let json = r#"{
            "results": [
                {
                    "languageCode": "en-us",
                    "alternatives": [
                        {
                            "transcript": "Explain caching Redis keeps hot data",
                            "confidence": 0.88,
                            "words": [
                                { "word": "Explain", "startTime": "0s", "endTime": "0.300s", "speakerTag": 1 },
                                { "word": "caching", "startTime": "0.300s", "endTime": "0.700s", "speakerTag": 1 },
                                { "word": "Redis", "startTime": "1.100s", "endTime": "1.400s", "speakerTag": 2 },
                                { "word": "keeps", "startTime": "1.400s", "endTime": "1.700s", "speakerTag": 2 },
                                { "word": "hot", "startTime": "1.700s", "endTime": "2s", "speakerTag": 2 },
                                { "word": "data", "startTime": "2s", "endTime": "2.200s", "speakerTag": 2 }
                            ]
                        }
                    ]
                }
            ]
        }"#;

        let events = parse_google_json(json, Some("en")).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].speaker, "interviewer");
        assert_eq!(events[0].text, "Explain caching");
        assert_eq!(events[0].language, Some("en-us".to_string()));
        assert_eq!(events[1].speaker, "candidate");
        assert_eq!(events[1].start_ms, 1100);
        assert_eq!(events[1].end_ms, 2200);
    }
}
