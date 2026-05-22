use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_HINTS: usize = 100;
const MAX_REQUEST_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationSessionSummary {
    pub id: String,
    pub title: String,
    pub company: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationTranscript {
    pub speaker: String,
    pub content: String,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationResponse {
    pub response: String,
    pub model: String,
    pub provider: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationSnapshot {
    pub session: Option<CollaborationSessionSummary>,
    pub transcripts: Vec<CollaborationTranscript>,
    pub responses: Vec<CollaborationResponse>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationHint {
    pub id: String,
    pub message: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationServerStatus {
    pub running: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub hint_count: usize,
    pub message: Option<String>,
}

#[derive(Clone)]
pub struct CollaborationManager {
    inner: Arc<Mutex<CollaborationInner>>,
}

struct CollaborationInner {
    running: bool,
    bind_host: String,
    port: u16,
    token: String,
    url: Option<String>,
    snapshot: CollaborationSnapshot,
    hints: VecDeque<CollaborationHint>,
    shutdown: Option<Arc<AtomicBool>>,
    thread: Option<JoinHandle<()>>,
    message: Option<String>,
}

impl Default for CollaborationManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CollaborationInner {
                running: false,
                bind_host: "127.0.0.1".to_string(),
                port: 0,
                token: String::new(),
                url: None,
                snapshot: CollaborationSnapshot::default(),
                hints: VecDeque::new(),
                shutdown: None,
                thread: None,
                message: None,
            })),
        }
    }
}

impl CollaborationManager {
    pub fn start_server(
        &self,
        bind_host: Option<String>,
        port: Option<u16>,
        token: Option<String>,
    ) -> Result<CollaborationServerStatus> {
        {
            let inner = self.inner.lock().expect("collaboration manager lock");
            if inner.running {
                return Ok(status_from_inner(&inner));
            }
        }

        let bind_host = sanitize_bind_host(bind_host);
        let listener = TcpListener::bind((bind_host.as_str(), port.unwrap_or(0)))
            .with_context(|| format!("could not bind collaboration helper on {bind_host}"))?;
        listener
            .set_nonblocking(true)
            .context("could not configure collaboration helper listener")?;
        let actual_port = listener
            .local_addr()
            .context("could not read collaboration helper port")?
            .port();
        let token = token
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
        let display_host = if bind_host == "0.0.0.0" {
            "127.0.0.1"
        } else {
            bind_host.as_str()
        };
        let url = format!("http://{display_host}:{actual_port}/?token={token}");
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_state = Arc::clone(&self.inner);
        let thread_shutdown = Arc::clone(&shutdown);

        let handle = thread::spawn(move || serve_loop(listener, thread_state, thread_shutdown));

        let mut inner = self.inner.lock().expect("collaboration manager lock");
        inner.running = true;
        inner.bind_host = bind_host;
        inner.port = actual_port;
        inner.token = token;
        inner.url = Some(url);
        inner.shutdown = Some(shutdown);
        inner.thread = Some(handle);
        inner.message = Some("Helper link started".to_string());
        Ok(status_from_inner(&inner))
    }

    pub fn stop_server(&self) -> CollaborationServerStatus {
        let handle = {
            let mut inner = self.inner.lock().expect("collaboration manager lock");
            inner.running = false;
            if let Some(shutdown) = &inner.shutdown {
                shutdown.store(true, Ordering::SeqCst);
            }
            inner.shutdown = None;
            inner.url = None;
            inner.message = Some("Helper link stopped".to_string());
            inner.thread.take()
        };

        if let Some(handle) = handle {
            let _ = handle.join();
        }

        let inner = self.inner.lock().expect("collaboration manager lock");
        status_from_inner(&inner)
    }

    pub fn status(&self) -> CollaborationServerStatus {
        let inner = self.inner.lock().expect("collaboration manager lock");
        status_from_inner(&inner)
    }

    pub fn publish_snapshot(&self, snapshot: CollaborationSnapshot) -> Result<()> {
        let mut inner = self.inner.lock().expect("collaboration manager lock");
        inner.snapshot = snapshot;
        Ok(())
    }

    pub fn list_hints(&self) -> Vec<CollaborationHint> {
        let inner = self.inner.lock().expect("collaboration manager lock");
        inner.hints.iter().cloned().collect()
    }

    pub fn clear_hint(&self, id: &str) -> Result<()> {
        let mut inner = self.inner.lock().expect("collaboration manager lock");
        let original_len = inner.hints.len();
        inner.hints.retain(|hint| hint.id != id);
        if inner.hints.len() == original_len {
            return Err(anyhow!("helper hint not found"));
        }
        Ok(())
    }
}

fn sanitize_bind_host(bind_host: Option<String>) -> String {
    bind_host
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn status_from_inner(inner: &CollaborationInner) -> CollaborationServerStatus {
    CollaborationServerStatus {
        running: inner.running,
        url: inner.url.clone(),
        token: if inner.running {
            Some(inner.token.clone())
        } else {
            None
        },
        hint_count: inner.hints.len(),
        message: inner.message.clone(),
    }
}

fn serve_loop(
    listener: TcpListener,
    state: Arc<Mutex<CollaborationInner>>,
    shutdown: Arc<AtomicBool>,
) {
    while !shutdown.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => handle_stream(stream, &state),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => break,
        }
    }
}

fn handle_stream(mut stream: TcpStream, state: &Arc<Mutex<CollaborationInner>>) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = match read_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            let _ = write_response(
                &mut stream,
                400,
                "Bad Request",
                "text/plain; charset=utf-8",
                &error.to_string(),
            );
            return;
        }
    };

    let response = route_request(&request, state);
    let _ = write_response(
        &mut stream,
        response.status,
        response.reason,
        response.content_type,
        &response.body,
    );
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest> {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    let mut expected_body_len = None;

    loop {
        let read = stream.read(&mut buffer).context("could not read request")?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(anyhow!("request too large"));
        }

        if expected_body_len.is_none() {
            if let Some(header_end) = header_end_index(&bytes) {
                let header = String::from_utf8_lossy(&bytes[..header_end]).to_string();
                expected_body_len = content_length(&header);
            }
        }

        if let Some(header_end) = header_end_index(&bytes) {
            let body_start = header_end + 4;
            let body_len = bytes.len().saturating_sub(body_start);
            if body_len >= expected_body_len.unwrap_or(0) {
                break;
            }
        }
    }

    parse_request(&bytes)
}

fn header_end_index(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(header: &str) -> Option<usize> {
    header.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            value.trim().parse::<usize>().ok()
        } else {
            None
        }
    })
}

fn parse_request(bytes: &[u8]) -> Result<HttpRequest> {
    let header_end = header_end_index(bytes).ok_or_else(|| anyhow!("missing request headers"))?;
    let header = String::from_utf8_lossy(&bytes[..header_end]).to_string();
    let mut lines = header.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| anyhow!("missing request line"))?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| anyhow!("missing request method"))?
        .to_string();
    let target = request_parts
        .next()
        .ok_or_else(|| anyhow!("missing request target"))?
        .to_string();
    let body_start = header_end + 4;
    let body = String::from_utf8_lossy(&bytes[body_start..]).to_string();

    Ok(HttpRequest {
        method,
        target,
        body,
    })
}

struct HttpRequest {
    method: String,
    target: String,
    body: String,
}

struct HttpResponse {
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: String,
}

fn route_request(request: &HttpRequest, state: &Arc<Mutex<CollaborationInner>>) -> HttpResponse {
    let path = request.target.split('?').next().unwrap_or("/");
    if request.method == "OPTIONS" {
        return json_response(200, "OK", "{}".to_string());
    }

    if !is_authorized(&request.target, state) {
        return text_response(403, "Forbidden", "Invalid helper token".to_string());
    }

    match (request.method.as_str(), path) {
        ("GET", "/") => HttpResponse {
            status: 200,
            reason: "OK",
            content_type: "text/html; charset=utf-8",
            body: helper_page_html(),
        },
        ("GET", "/snapshot") => {
            let snapshot = {
                let inner = state.lock().expect("collaboration manager lock");
                inner.snapshot.clone()
            };
            match serde_json::to_string(&snapshot) {
                Ok(body) => json_response(200, "OK", body),
                Err(error) => text_response(500, "Internal Server Error", error.to_string()),
            }
        }
        ("POST", "/hint") => match read_hint_message(&request.body) {
            Ok(message) => {
                let hint = CollaborationHint {
                    id: Uuid::new_v4().simple().to_string(),
                    message,
                    created_at_ms: Utc::now().timestamp_millis(),
                };
                {
                    let mut inner = state.lock().expect("collaboration manager lock");
                    inner.hints.push_front(hint.clone());
                    while inner.hints.len() > MAX_HINTS {
                        inner.hints.pop_back();
                    }
                }
                json_response(
                    200,
                    "OK",
                    serde_json::to_string(&hint).unwrap_or_else(|_| "{}".to_string()),
                )
            }
            Err(error) => text_response(400, "Bad Request", error.to_string()),
        },
        _ => text_response(404, "Not Found", "Not found".to_string()),
    }
}

fn is_authorized(target: &str, state: &Arc<Mutex<CollaborationInner>>) -> bool {
    let request_token = query_param(target, "token");
    let expected = {
        let inner = state.lock().expect("collaboration manager lock");
        inner.token.clone()
    };
    request_token.as_deref() == Some(expected.as_str())
}

fn query_param(target: &str, name: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode(key) == name {
            Some(percent_decode(value))
        } else {
            None
        }
    })
}

fn percent_decode(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars();
    while let Some(ch) = chars.next() {
        if ch == '+' {
            output.push(' ');
            continue;
        }
        if ch == '%' {
            let first = chars.next();
            let second = chars.next();
            if let (Some(first), Some(second)) = (first, second) {
                let hex = format!("{first}{second}");
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    output.push(byte as char);
                    continue;
                }
                output.push('%');
                output.push(first);
                output.push(second);
                continue;
            }
            output.push('%');
            if let Some(first) = first {
                output.push(first);
            }
            if let Some(second) = second {
                output.push(second);
            }
            continue;
        }
        output.push(ch);
    }
    output
}

fn read_hint_message(body: &str) -> Result<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("hint message is required"));
    }

    let message = serde_json::from_str::<serde_json::Value>(trimmed)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(|message| message.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| trimmed.to_string());
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err(anyhow!("hint message is required"));
    }
    Ok(message.chars().take(4000).collect())
}

fn json_response(status: u16, reason: &'static str, body: String) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: "application/json; charset=utf-8",
        body,
    }
}

fn text_response(status: u16, reason: &'static str, body: String) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: "text/plain; charset=utf-8",
        body,
    }
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &str,
) -> Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    )
    .context("could not write response")
}

fn helper_page_html() -> String {
    r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Caveman Helper</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; background: #0d1210; color: #f3faf6; }
    body { margin: 0; padding: 20px; }
    main { display: grid; gap: 16px; max-width: 980px; margin: 0 auto; }
    header, section { border: 1px solid #31413b; border-radius: 8px; background: #151c19; padding: 16px; }
    h1, h2 { margin: 0; font-size: 1.05rem; }
    small { color: #9db0a8; }
    .grid { display: grid; gap: 10px; }
    .row { border-left: 3px solid #5b9cff; padding: 10px 12px; background: #101613; }
    .response { border: 1px solid #26342f; border-radius: 8px; padding: 12px; background: #101613; white-space: pre-wrap; }
    textarea { width: 100%; min-height: 90px; box-sizing: border-box; border: 1px solid #3a4a43; border-radius: 8px; padding: 10px; color: #f3faf6; background: #0f1412; }
    button { min-height: 38px; border: 0; border-radius: 8px; padding: 0 14px; color: #07110a; background: #58df7b; font-weight: 800; }
    .muted { color: #9db0a8; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1 id="title">Caveman Helper</h1>
      <small id="meta">Waiting for live session</small>
    </header>
    <section>
      <h2>Transcript</h2>
      <div id="transcript" class="grid"></div>
    </section>
    <section>
      <h2>AI Responses</h2>
      <div id="responses" class="grid"></div>
    </section>
    <section>
      <h2>Hint</h2>
      <textarea id="hint" aria-label="Hint"></textarea>
      <button id="send" type="button">Send Hint</button>
      <p id="status" class="muted"></p>
    </section>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    const transcript = document.getElementById("transcript");
    const responses = document.getElementById("responses");
    const status = document.getElementById("status");

    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    function row(text, className) {
      const item = document.createElement("div");
      item.className = className;
      item.textContent = text;
      return item;
    }

    async function refresh() {
      const res = await fetch("/snapshot?token=" + encodeURIComponent(token), { cache: "no-store" });
      if (!res.ok) {
        status.textContent = "Helper link not authorized";
        return;
      }
      const snapshot = await res.json();
      document.getElementById("title").textContent = snapshot.session?.title || "Live Session";
      document.getElementById("meta").textContent = [snapshot.session?.company, snapshot.session?.role].filter(Boolean).join(" / ") || "Active";
      clear(transcript);
      clear(responses);
      for (const line of snapshot.transcripts || []) {
        transcript.appendChild(row(`${line.speaker}: ${line.content}`, "row"));
      }
      for (const answer of snapshot.responses || []) {
        responses.appendChild(row(`${answer.provider} / ${answer.model}\n${answer.response}`, "response"));
      }
    }

    document.getElementById("send").addEventListener("click", async () => {
      const input = document.getElementById("hint");
      const message = input.value.trim();
      if (!message) return;
      const res = await fetch("/hint?token=" + encodeURIComponent(token), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message })
      });
      status.textContent = res.ok ? "Hint sent" : "Hint failed";
      if (res.ok) input.value = "";
    });

    refresh();
    setInterval(refresh, 1500);
  </script>
</body>
</html>
"#
    .to_string()
}
