use std::io::{Read, Write};
use std::net::TcpStream;

use caveman_lib::collaboration::{
    CollaborationManager, CollaborationResponse, CollaborationSessionSummary,
    CollaborationSnapshot, CollaborationTranscript,
};

#[test]
fn collaboration_server_serves_token_gated_snapshot_and_collects_hints() {
    let manager = CollaborationManager::default();
    let status = manager
        .start_server(
            Some("127.0.0.1".to_string()),
            Some(0),
            Some("secret-token".to_string()),
        )
        .expect("start collaboration server");
    let url = status.url.expect("server url");
    let origin = origin_from_url(&url);

    manager
        .publish_snapshot(CollaborationSnapshot {
            session: Some(CollaborationSessionSummary {
                id: "session-1".to_string(),
                title: "System Design Interview".to_string(),
                company: Some("Stripe".to_string()),
                role: Some("Backend Engineer".to_string()),
            }),
            transcripts: vec![CollaborationTranscript {
                speaker: "interviewer".to_string(),
                content: "How would you make retries idempotent?".to_string(),
                timestamp_ms: 1200,
            }],
            responses: vec![CollaborationResponse {
                response: "Use idempotency keys and retry budgets.".to_string(),
                model: "llama3.1:8b".to_string(),
                provider: "ollama".to_string(),
                created_at: "2026-05-21T00:00:00.000Z".to_string(),
            }],
            updated_at_ms: 2000,
        })
        .expect("publish snapshot");

    let forbidden = http_get(&origin, "/snapshot?token=wrong");
    assert!(forbidden.starts_with("HTTP/1.1 403"));

    let snapshot = http_get(&origin, "/snapshot?token=secret-token");
    assert!(snapshot.starts_with("HTTP/1.1 200"));
    assert!(snapshot.contains("System Design Interview"));
    assert!(snapshot.contains("How would you make retries idempotent?"));
    assert!(snapshot.contains("Use idempotency keys and retry budgets."));

    let hint_response = http_post(
        &origin,
        "/hint?token=secret-token",
        r#"{"message":"Mention exponential backoff tradeoffs."}"#,
    );
    assert!(hint_response.starts_with("HTTP/1.1 200"));

    let hints = manager.list_hints();
    assert_eq!(hints.len(), 1);
    assert_eq!(hints[0].message, "Mention exponential backoff tradeoffs.");

    manager.stop_server();
}

fn origin_from_url(url: &str) -> String {
    let without_scheme = url.strip_prefix("http://").expect("test server uses http");
    without_scheme
        .split('/')
        .next()
        .expect("host and port")
        .to_string()
}

fn http_get(origin: &str, path: &str) -> String {
    let mut stream = TcpStream::connect(origin).expect("connect to helper server");
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
    )
    .expect("write get request");

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .expect("read get response");
    response
}

fn http_post(origin: &str, path: &str, body: &str) -> String {
    let mut stream = TcpStream::connect(origin).expect("connect to helper server");
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
    .expect("write post request");

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .expect("read post response");
    response
}
