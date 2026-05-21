import { describe, expect, it } from "vitest";
import type { AudioRehearsalResult } from "./audioRehearsal";
import { buildPreflightReport, PREFLIGHT_REPORT_SETTING_KEY } from "./preflightReport";
import type { RealUseReadiness, RuntimeBudgetStatus } from "./readiness";

const readiness: RealUseReadiness = {
  overallStatus: "warning",
  readyCount: 5,
  warningCount: 2,
  blockedCount: 0,
  items: [
    {
      id: "audio",
      label: "Dual audio capture ready",
      status: "ready",
      detail: "Microphone and system streams are configured separately."
    },
    {
      id: "overlay",
      label: "Overlay protection not checked",
      status: "warning",
      detail: "Capture exclusion has not been verified.",
      action: "Open the overlay once before joining a call."
    }
  ]
};

const runtimeBudget: RuntimeBudgetStatus = {
  startupMs: 1200,
  workingSetMb: 220,
  processCpuPercent: 3,
  startupTargetMs: 3000,
  memoryTargetMb: 500,
  idleCpuTargetPercent: 15,
  activeCpuTargetPercent: 40,
  sampleCount: 2,
  source: "windows-process"
};

const audioRehearsal: AudioRehearsalResult = {
  status: "ready",
  started: true,
  durationMs: 500,
  expectedSources: ["microphone", "system"],
  microphonePeak: 0.32,
  systemPeak: 0.24,
  microphoneEvents: 3,
  systemEvents: 2,
  microphoneReady: true,
  systemReady: true,
  warnings: [],
  message: "Audio rehearsal detected microphone and system audio."
};

describe("preflightReport", () => {
  it("uses a stable setting key for the latest saved report", () => {
    expect(PREFLIGHT_REPORT_SETTING_KEY).toBe("preflight.latestReport");
  });

  it("renders a timestamped real-use validation report with actions and measured checks", () => {
    const report = buildPreflightReport({
      readiness,
      runtimeBudget,
      audioRehearsal,
      generatedAt: new Date("2026-05-21T16:30:00.000Z")
    });

    expect(report).toContain("# Caveman Preflight Report");
    expect(report).toContain("Generated: 2026-05-21T16:30:00.000Z");
    expect(report).toContain("Overall: warning");
    expect(report).toContain("Ready: 5 | Warnings: 2 | Blocked: 0");
    expect(report).toContain("Runtime: startup 1200ms / memory 220MB / idle CPU 3%");
    expect(report).toContain("Audio rehearsal: ready - Audio rehearsal detected microphone and system audio.");
    expect(report).toContain("- [ready] Dual audio capture ready: Microphone and system streams are configured separately.");
    expect(report).toContain("  Action: Open the overlay once before joining a call.");
    expect(report).toContain("- [ ] Confirm live transcript updates while the real call audio is playing.");
  });
});
