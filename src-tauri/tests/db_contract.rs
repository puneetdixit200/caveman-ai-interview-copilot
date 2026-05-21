use caveman_lib::db::{Database, NewAiResponse, NewSession, TranscriptCursor};

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
