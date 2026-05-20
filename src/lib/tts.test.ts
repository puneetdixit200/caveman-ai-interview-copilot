import { describe, expect, it } from "vitest";
import { enqueueTtsResponse } from "./tts";
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
});
