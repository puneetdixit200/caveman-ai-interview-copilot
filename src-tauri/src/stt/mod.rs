use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttProviderStatus {
    pub id: String,
    pub label: String,
    pub mode: String,
    pub available: bool,
    pub latency_target_ms: u16,
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
