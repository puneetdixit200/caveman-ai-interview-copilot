import { describe, expect, it, vi } from "vitest";
import {
  DeepgramLiveTranscriber,
  buildDeepgramLiveUrl,
  parseDeepgramLiveMessage,
  parseDeepgramLiveResult
} from "./deepgramStreaming";
import type { AudioChunkEvent } from "./audioEvents";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols: string[];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = Array.isArray(protocols) ? protocols : protocols ? [protocols] : [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("deepgramStreaming", () => {
  it("builds a live transcription URL for 16 kHz linear16 chunks", () => {
    expect(
      buildDeepgramLiveUrl({
        language: "en-US",
        diarizationEnabled: true,
        endpoint: "wss://api.deepgram.com/v1/listen"
      }).toString()
    ).toBe(
      "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true&endpointing=300&utterance_end_ms=1000&vad_events=true&diarize=true&language=en-US"
    );
  });

  it("parses final Deepgram result messages into transcript events", () => {
    expect(
      parseDeepgramLiveResult(
        JSON.stringify({
          type: "Results",
          is_final: true,
          speech_final: true,
          start: 1.2,
          duration: 0.8,
          channel: {
            alternatives: [
              {
                transcript: "Explain indexes.",
                confidence: 0.93,
                languages: ["en-US"],
                words: [{ speaker: 0 }]
              }
            ]
          }
        }),
        "system"
      )
    ).toEqual([
      {
        speaker: "interviewer",
        text: "Explain indexes.",
        startMs: 1200,
        endMs: 2000,
        confidence: 0.93,
        language: "en-US"
      }
    ]);
  });

  it("parses interim Deepgram result messages for live word streaming previews", () => {
    expect(
      parseDeepgramLiveMessage(
        JSON.stringify({
          type: "Results",
          is_final: false,
          speech_final: false,
          start: 2.4,
          duration: 0.7,
          channel: {
            alternatives: [
              {
                transcript: "Walk me through",
                confidence: 0.72,
                languages: ["en-US"],
                words: [{ speaker: 0 }]
              }
            ]
          }
        }),
        "system"
      )
    ).toEqual([
      {
        speaker: "interviewer",
        text: "Walk me through",
        startMs: 2400,
        endMs: 3100,
        confidence: 0.72,
        language: "en-US",
        isFinal: false,
        speechFinal: false
      }
    ]);
  });

  it("opens a browser WebSocket with token subprotocol auth and sends PCM chunks as binary", () => {
    FakeWebSocket.instances = [];
    const onTranscript = vi.fn();
    const transcriber = new DeepgramLiveTranscriber({
      apiKey: "dg_key",
      language: "auto",
      diarizationEnabled: true,
      source: "microphone",
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      onTranscript
    });

    transcriber.sendChunk(makeChunk("AQIDBA=="));
    const socket = FakeWebSocket.instances[0];
    socket.open();
    transcriber.sendChunk(makeChunk("AQIDBA=="));
    socket.emitMessage(
      JSON.stringify({
        type: "Results",
        is_final: true,
        start: 0,
        duration: 0.25,
        channel: {
          alternatives: [{ transcript: "I would use a B-tree.", confidence: 0.9 }]
        }
      })
    );
    transcriber.close();

    expect(socket.url).toContain("wss://api.deepgram.com/v1/listen?");
    expect(socket.protocols).toEqual(["token", "dg_key"]);
    expect(socket.sent[0]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(socket.sent[0] as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(socket.sent[socket.sent.length - 1]).toBe(JSON.stringify({ type: "CloseStream" }));
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        speaker: "candidate",
        text: "I would use a B-tree.",
        startMs: 0,
        endMs: 250
      })
    );
  });

  it("routes interim messages to live preview callbacks without saving final transcripts", () => {
    FakeWebSocket.instances = [];
    const onTranscript = vi.fn();
    const onInterimTranscript = vi.fn();
    const transcriber = new DeepgramLiveTranscriber({
      apiKey: "dg_key",
      language: "auto",
      diarizationEnabled: true,
      source: "system",
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      onTranscript,
      onInterimTranscript
    });

    transcriber.sendChunk({ ...makeChunk("AQIDBA=="), source: "system" });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.emitMessage(
      JSON.stringify({
        type: "Results",
        is_final: false,
        speech_final: false,
        start: 0,
        duration: 0.25,
        channel: {
          alternatives: [{ transcript: "Explain", confidence: 0.5 }]
        }
      })
    );

    expect(onInterimTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        speaker: "interviewer",
        text: "Explain",
        isFinal: false
      })
    );
    expect(onTranscript).not.toHaveBeenCalled();
  });
});

function makeChunk(pcm16Base64: string): AudioChunkEvent {
  return {
    source: "microphone",
    deviceId: "mic-1",
    sequence: 1,
    sampleRateHz: 16000,
    channels: 1,
    durationMs: 250,
    sampleCount: 4000,
    pcm16Base64,
    timestampMs: 1000
  };
}
