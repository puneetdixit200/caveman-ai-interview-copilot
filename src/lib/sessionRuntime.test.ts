import { describe, expect, it } from "vitest";
import { estimateTokens, mergeStreamingResponse, nextTranscriptTimestampMs } from "./sessionRuntime";

describe("sessionRuntime", () => {
  it("calculates elapsed transcript timestamp in milliseconds", () => {
    expect(
      nextTranscriptTimestampMs(
        new Date("2026-05-20T10:00:00.000Z"),
        new Date("2026-05-20T10:00:04.250Z")
      )
    ).toBe(4250);
  });

  it("never returns a negative transcript timestamp", () => {
    expect(
      nextTranscriptTimestampMs(
        new Date("2026-05-20T10:00:04.250Z"),
        new Date("2026-05-20T10:00:00.000Z")
      )
    ).toBe(0);
  });

  it("estimates at least one token for non-empty text and grows with length", () => {
    expect(estimateTokens("HashMap")).toBe(1);
    expect(estimateTokens("HashMap uses buckets and collision handling")).toBeGreaterThan(
      estimateTokens("HashMap")
    );
    expect(estimateTokens("   ")).toBe(0);
  });

  it("merges streaming chunks without altering model output", () => {
    expect(mergeStreamingResponse(["Use ", "Base62", " IDs."])).toBe("Use Base62 IDs.");
  });
});
