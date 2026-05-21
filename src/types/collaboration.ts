export interface CollaborationSessionSummary {
  id: string;
  title: string;
  company?: string;
  role?: string;
}

export interface CollaborationTranscript {
  speaker: string;
  content: string;
  timestampMs: number;
}

export interface CollaborationResponse {
  response: string;
  model: string;
  provider: string;
  createdAt: string;
}

export interface CollaborationSnapshot {
  session?: CollaborationSessionSummary;
  transcripts: CollaborationTranscript[];
  responses: CollaborationResponse[];
  updatedAtMs: number;
}

export interface CollaborationHint {
  id: string;
  message: string;
  createdAtMs: number;
}

export interface CollaborationServerStatus {
  running: boolean;
  url?: string;
  token?: string;
  hintCount: number;
  message?: string;
}
