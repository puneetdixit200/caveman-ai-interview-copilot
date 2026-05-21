import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TranscriptFeed, type InterimTranscriptPreview } from "./TranscriptFeed";

describe("TranscriptFeed", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders provisional live transcript previews separately from saved transcript history", () => {
    const interim: InterimTranscriptPreview[] = [
      {
        id: "deepgram-system",
        speaker: "interviewer",
        content: "Explain binary",
        timestampMs: 2400,
        confidence: 0.72,
        source: "system"
      }
    ];

    render(
      <TranscriptFeed
        transcripts={[
          {
            id: 1,
            sessionId: "s1",
            speaker: "candidate",
            content: "I would start with constraints.",
            timestampMs: 1000,
            confidence: 0.91
          }
        ]}
        interimPreviews={interim}
      />
    );

    expect(screen.getByText("I would start with constraints.")).toBeInTheDocument();
    expect(screen.getByText("Explain binary")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
  });
});
