use caveman_lib::db::{
    Database, NewAiResponse, NewKnowledgeChunk, NewKnowledgeDocument, NewSecurityEvent, NewSession,
    TranscriptCursor, UpdateSession,
};
use rusqlite::Connection;

#[test]
fn session_and_transcript_records_round_trip_through_sqlite() {
    let db = Database::in_memory().expect("in-memory database");
    let session = db
        .create_session(NewSession {
            title: "DSA Round".to_string(),
            company: Some("Acme".to_string()),
            role: Some("Backend Engineer".to_string()),
            interview_type: "dsa".to_string(),
            tags: vec!["hashmap".to_string()],
            notes: Some("Focus on clarity".to_string()),
        })
        .expect("create session");

    db.add_transcript(
        &session.id,
        "interviewer",
        "Explain HashMap internals",
        1500,
        Some(0.98),
    )
    .expect("add transcript");

    let sessions = db.list_sessions().expect("list sessions");
    let transcripts = db.list_transcripts(&session.id).expect("list transcripts");

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].company.as_deref(), Some("Acme"));
    assert_eq!(sessions[0].tags, vec!["hashmap"]);
    assert_eq!(transcripts.len(), 1);
    assert_eq!(transcripts[0].speaker, "interviewer");
    assert_eq!(transcripts[0].content, "Explain HashMap internals");
}

#[test]
fn session_metadata_can_be_updated_after_an_interview() {
    let db = Database::in_memory().expect("in-memory database");
    let session = db
        .create_session(NewSession {
            title: "Untitled interview".to_string(),
            company: None,
            role: None,
            interview_type: "mixed".to_string(),
            tags: vec![],
            notes: None,
        })
        .expect("create session");

    let updated = db
        .update_session(UpdateSession {
            id: session.id.clone(),
            title: "Stripe Final Round".to_string(),
            company: Some(" Stripe ".to_string()),
            role: Some(" Staff Backend Engineer ".to_string()),
            interview_type: "backend".to_string(),
            tags: vec![
                "onsite".to_string(),
                " backend ".to_string(),
                "onsite".to_string(),
                " ".to_string(),
            ],
            status: "completed".to_string(),
            notes: Some(" Follow up on cache invalidation examples. ".to_string()),
        })
        .expect("update session metadata");

    assert_eq!(updated.id, session.id);
    assert_eq!(updated.title, "Stripe Final Round");
    assert_eq!(updated.company.as_deref(), Some("Stripe"));
    assert_eq!(updated.role.as_deref(), Some("Staff Backend Engineer"));
    assert_eq!(updated.interview_type, "backend");
    assert_eq!(updated.status, "completed");
    assert_eq!(updated.tags, vec!["onsite", "backend"]);
    assert_eq!(
        updated.notes.as_deref(),
        Some("Follow up on cache invalidation examples.")
    );
    assert!(updated.ended_at.is_some());
}

#[test]
fn transcript_records_can_be_corrected_and_deleted() {
    let db = Database::in_memory().expect("in-memory database");
    let session = db
        .create_session(NewSession {
            title: "Correction Round".to_string(),
            company: None,
            role: None,
            interview_type: "mixed".to_string(),
            tags: vec![],
            notes: None,
        })
        .expect("create session");
    let transcript = db
        .add_transcript(
            &session.id,
            "interviewer",
            "How do retrys work?",
            900,
            Some(0.72),
        )
        .expect("add transcript");

    let updated = db
        .update_transcript(
            transcript.id,
            "candidate",
            "How do retries work?",
            1200,
            Some(0.94),
        )
        .expect("update transcript");

    assert_eq!(updated.speaker, "candidate");
    assert_eq!(updated.content, "How do retries work?");
    assert_eq!(updated.timestamp_ms, 1200);
    assert_eq!(updated.confidence, Some(0.94));

    db.delete_transcript(transcript.id)
        .expect("delete transcript");

    assert!(db
        .list_transcripts(&session.id)
        .expect("list transcripts")
        .is_empty());
}

#[test]
fn transcript_records_page_by_timestamp_cursor() {
    let db = Database::in_memory().expect("in-memory database");
    let session = db
        .create_session(NewSession {
            title: "Long Replay".to_string(),
            company: None,
            role: None,
            interview_type: "mixed".to_string(),
            tags: vec![],
            notes: None,
        })
        .expect("create session");

    let first = db
        .add_transcript(&session.id, "interviewer", "Question one?", 1000, None)
        .expect("add first transcript");
    let second = db
        .add_transcript(&session.id, "candidate", "Answer one.", 2000, None)
        .expect("add second transcript");
    let third = db
        .add_transcript(&session.id, "interviewer", "Question two?", 3000, None)
        .expect("add third transcript");

    let first_page = db
        .list_transcripts_page(&session.id, None, "after", 2)
        .expect("first page");

    assert_eq!(first_page.items.len(), 2);
    assert_eq!(first_page.total_count, 3);
    assert_eq!(first_page.items[0].id, first.id);
    assert_eq!(first_page.items[1].id, second.id);
    assert!(!first_page.has_more_before);
    assert!(first_page.has_more_after);

    let next_page = db
        .list_transcripts_page(
            &session.id,
            Some(TranscriptCursor {
                timestamp_ms: second.timestamp_ms,
                id: second.id,
            }),
            "after",
            2,
        )
        .expect("next page");

    assert_eq!(next_page.items.len(), 1);
    assert_eq!(next_page.items[0].id, third.id);
    assert!(next_page.has_more_before);
    assert!(!next_page.has_more_after);

    let previous_page = db
        .list_transcripts_page(&session.id, next_page.previous_cursor.clone(), "before", 2)
        .expect("previous page");

    assert_eq!(previous_page.items.len(), 2);
    assert_eq!(previous_page.items[0].id, first.id);
    assert_eq!(previous_page.items[1].id, second.id);
}

#[test]
fn settings_round_trip_by_key() {
    let db = Database::in_memory().expect("in-memory database");

    db.save_setting("overlay.opacity", "0.72")
        .expect("save setting");
    db.save_setting("overlay.opacity", "0.64")
        .expect("update setting");

    assert_eq!(
        db.get_setting("overlay.opacity").expect("get setting"),
        Some("0.64".to_string())
    );
}

#[test]
fn security_events_round_trip_without_storing_secrets() {
    let db = Database::in_memory().expect("in-memory database");

    db.record_security_event(NewSecurityEvent {
        category: " secret ".to_string(),
        action: " provider_key_saved ".to_string(),
        target: Some(" openai ".to_string()),
        details: Some("Stored provider key in OS keychain".to_string()),
    })
    .expect("record provider key event");
    db.record_security_event(NewSecurityEvent {
        category: "automation".to_string(),
        action: "active_window_typing".to_string(),
        target: None,
        details: Some("Typed 42 characters".to_string()),
    })
    .expect("record typing event");

    let events = db.list_security_events(10).expect("list security events");

    assert_eq!(events.len(), 2);
    assert_eq!(events[0].category, "automation");
    assert_eq!(events[0].action, "active_window_typing");
    assert_eq!(events[1].category, "secret");
    assert_eq!(events[1].target.as_deref(), Some("openai"));
    assert!(!serde_json::to_string(&events)
        .expect("serialize events")
        .contains("sk-"));
}

#[test]
fn knowledge_documents_and_chunks_persist_locally() {
    let db = Database::in_memory().expect("in-memory database");

    db.upsert_knowledge_document(NewKnowledgeDocument {
        id: "payments".to_string(),
        title: " Payments Project ".to_string(),
        source_type: " project ".to_string(),
        text: "Built Stripe webhook retries with queue backoff.".to_string(),
        created_at_ms: Some(500),
        chunks: vec![NewKnowledgeChunk {
            id: "payments-1".to_string(),
            source_label: "project: Payments Project".to_string(),
            text: "Built Stripe webhook retries with queue backoff.".to_string(),
            created_at_ms: Some(500),
        }],
    })
    .expect("upsert knowledge document");

    let base = db.list_knowledge_base().expect("list knowledge base");
    assert_eq!(base.documents.len(), 1);
    assert_eq!(base.documents[0].id, "payments");
    assert_eq!(base.documents[0].title, "Payments Project");
    assert_eq!(base.documents[0].source_type, "project");
    assert_eq!(
        base.documents[0].character_count,
        "Built Stripe webhook retries with queue backoff.".len() as i64
    );
    assert_eq!(base.chunks.len(), 1);
    assert_eq!(base.chunks[0].document_id, "payments");
    assert_eq!(base.chunks[0].source_label, "project: Payments Project");

    db.delete_knowledge_document("payments")
        .expect("delete knowledge document");
    assert!(db
        .list_knowledge_base()
        .expect("list after delete")
        .documents
        .is_empty());

    db.upsert_knowledge_document(NewKnowledgeDocument {
        id: "resume".to_string(),
        title: "Resume".to_string(),
        source_type: "resume".to_string(),
        text: "Led platform migrations.".to_string(),
        created_at_ms: Some(700),
        chunks: vec![],
    })
    .expect("upsert second document");
    db.clear_knowledge_base().expect("clear knowledge base");
    assert!(db
        .list_knowledge_base()
        .expect("list after clear")
        .chunks
        .is_empty());
}

#[test]
fn legacy_knowledge_setting_migrates_to_sqlite_tables() {
    let db = Database::in_memory().expect("in-memory database");
    db.save_setting(
        "knowledge.base",
        r#"{
          "documents": [
            {
              "id": "legacy-payments",
              "title": "Legacy Payments",
              "sourceType": "project",
              "characterCount": 32,
              "createdAtMs": 800
            }
          ],
          "chunks": [
            {
              "id": "legacy-payments-1",
              "documentId": "legacy-payments",
              "sourceLabel": "project: Legacy Payments",
              "text": "Old stored Stripe notes.",
              "createdAtMs": 800
            }
          ]
        }"#,
    )
    .expect("save legacy setting");

    let base = db.list_knowledge_base().expect("legacy knowledge migrated");

    assert_eq!(base.documents.len(), 1);
    assert_eq!(base.documents[0].id, "legacy-payments");
    assert_eq!(base.documents[0].source_type, "project");
    assert_eq!(base.chunks.len(), 1);
    assert_eq!(base.chunks[0].document_id, "legacy-payments");

    assert_eq!(
        db.list_knowledge_base()
            .expect("second list does not duplicate")
            .chunks
            .len(),
        1
    );
}

#[test]
fn ai_response_records_round_trip_through_sqlite() {
    let db = Database::in_memory().expect("in-memory database");
    let session = db
        .create_session(NewSession {
            title: "Real Provider Session".to_string(),
            company: Some("Acme".to_string()),
            role: Some("Backend Engineer".to_string()),
            interview_type: "system_design".to_string(),
            tags: vec!["real-provider".to_string()],
            notes: None,
        })
        .expect("create session");

    db.add_ai_response(NewAiResponse {
        session_id: session.id.clone(),
        trigger_transcript_id: None,
        prompt_messages: r#"[{"role":"user","content":"Explain sharding"}]"#.to_string(),
        response: "Use consistent hashing when you need smoother shard movement.".to_string(),
        model: "llama3.1:8b".to_string(),
        provider: "ollama".to_string(),
        input_tokens: Some(42),
        output_tokens: Some(16),
        latency_ms: Some(820),
    })
    .expect("add ai response");

    let responses = db
        .list_ai_responses(&session.id)
        .expect("list ai responses");

    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0].session_id, session.id);
    assert_eq!(
        responses[0].prompt_messages,
        r#"[{"role":"user","content":"Explain sharding"}]"#
    );
    assert_eq!(
        responses[0].response,
        "Use consistent hashing when you need smoother shard movement."
    );
    assert_eq!(responses[0].model, "llama3.1:8b");
    assert_eq!(responses[0].provider, "ollama");
    assert_eq!(responses[0].latency_ms, Some(820));
}

#[test]
fn sessions_accept_goal_interview_types() {
    let db = Database::in_memory().expect("in-memory database");

    for interview_type in ["frontend", "backend", "devops_cloud"] {
        let session = db
            .create_session(NewSession {
                title: format!("{interview_type} Round"),
                company: None,
                role: None,
                interview_type: interview_type.to_string(),
                tags: vec![],
                notes: None,
            })
            .expect("create session with goal interview type");

        assert_eq!(session.interview_type, interview_type);
    }
}

#[test]
fn existing_databases_migrate_session_interview_type_check() {
    let path = std::env::temp_dir().join(format!(
        "caveman-session-type-migration-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    {
        let connection = Connection::open(&path).expect("create old sqlite database");
        connection
            .execute_batch(
                "
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    company TEXT,
                    role TEXT,
                    interview_type TEXT NOT NULL CHECK(interview_type IN ('dsa','system_design','behavioral','hr','mixed')),
                    tags TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
                    model_used TEXT,
                    provider TEXT,
                    total_tokens INTEGER NOT NULL DEFAULT 0,
                    duration_seconds INTEGER NOT NULL DEFAULT 0,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    ended_at TEXT
                );

                INSERT INTO sessions (
                    id, title, company, role, interview_type, tags, status, total_tokens,
                    duration_seconds, created_at
                )
                VALUES (
                    'legacy', 'Legacy System Design', NULL, NULL, 'system_design', '[]', 'active', 0,
                    0, '2026-05-21T00:00:00Z'
                );
                ",
            )
            .expect("seed old schema");
    }

    let db = Database::open(&path).expect("open migrated database");
    let frontend_session = db
        .create_session(NewSession {
            title: "Frontend Round".to_string(),
            company: None,
            role: None,
            interview_type: "frontend".to_string(),
            tags: vec![],
            notes: None,
        })
        .expect("create frontend session after migration");
    let sessions = db.list_sessions().expect("list migrated sessions");

    assert_eq!(frontend_session.interview_type, "frontend");
    assert!(sessions.iter().any(|session| session.id == "legacy"));

    drop(db);
    std::fs::remove_file(path).expect("clean temp sqlite database");
}
