use caveman_lib::db::{Database, NewSession};

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
