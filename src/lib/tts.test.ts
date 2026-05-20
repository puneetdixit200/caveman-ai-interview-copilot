import { describe, expect, it } from "vitest";
import { enqueueTtsResponse, playTtsItem } from "./tts";
import type { SpeechUtteranceLike } from "./tts";
import type { TtsSettings } from "../types/settings";

const settings: TtsSettings = {
  enabled: true,
  autoPlay: false,
  voice: "default",
  language: "en-US",
  rate: 1,
  volume: 0.8,
  muteInStealth: true
};

describe("tts", () => {
  it("queues generated response text when not muted by stealth mode", () => {
    expect(enqueueTtsResponse([], "Use a load balancer.", settings, false)).toEqual([
      {
        id: expect.any(String),
        text: "Use a load balancer.",
        voice: "default",
        language: "en-US",
        rate: 1,
        volume: 0.8
      }
    ]);
  });

  it("does not queue playback while stealth mute is active", () => {
    expect(enqueueTtsResponse([], "Hidden hint", settings, true)).toEqual([]);
  });

  it("plays a queued item through the speech synthesis runtime", () => {
    const spoken: SpeechUtteranceLike[] = [];
    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      volume = 1;
      voice?: { name: string };

      constructor(text: string) {
        this.text = text;
      }
    }

    const played = playTtsItem(
      {
        id: "tts-1",
        text: "Use a queue for backpressure.",
        voice: "Caveman Voice",
        language: "en-US",
        rate: 1.2,
        volume: 0.7
      },
      {
        Utterance: FakeUtterance,
        synthesis: {
          getVoices: () => [{ name: "Caveman Voice", lang: "en-US" }],
          speak: (utterance) => spoken.push(utterance),
          cancel: () => undefined
        }
      }
    );

    expect(played).toBe(true);
    expect(spoken[0]).toMatchObject({
      text: "Use a queue for backpressure.",
      lang: "en-US",
      rate: 1.2,
      volume: 0.7,
      voice: { name: "Caveman Voice" }
    });
  });

  it("does not throw when speech synthesis is unavailable", () => {
    const item = enqueueTtsResponse([], "Read this", settings, false)[0];

    expect(playTtsItem(item, null)).toBe(false);
  });
});
