import assert from "node:assert/strict";
import test from "node:test";

import { parseMacAudioDevices, summarizeAudioEnvironment } from "./audio-environment-smoke.mjs";

test("parses macOS system_profiler audio devices", () => {
  const devices = parseMacAudioDevices(`Audio:

    Devices:

        MacBook Air Microphone:

          Default Input Device: Yes
          Input Channels: 1
          Manufacturer: Apple Inc.

        MacBook Air Speakers:

          Default Output Device: Yes
          Output Channels: 2
          Manufacturer: Apple Inc.
`);

  assert.deepEqual(devices, [
    {
      name: "MacBook Air Microphone",
      defaultInput: true,
      defaultOutput: false,
      inputChannels: 1,
      outputChannels: 0
    },
    {
      name: "MacBook Air Speakers",
      defaultInput: false,
      defaultOutput: true,
      inputChannels: 0,
      outputChannels: 2
    }
  ]);
});

test("summarizes audio environment readiness", () => {
  assert.deepEqual(
    summarizeAudioEnvironment({
      devices: [
        { name: "Mic", defaultInput: true, defaultOutput: false, inputChannels: 1, outputChannels: 0 },
        { name: "Speakers", defaultInput: false, defaultOutput: true, inputChannels: 0, outputChannels: 2 }
      ],
      audioContractTestPassed: true
    }),
    {
      status: "ready",
      messages: [
        "Detected 1 input audio device.",
        "Detected 1 output audio device.",
        "Native audio contract tests passed."
      ]
    }
  );

  assert.equal(
    summarizeAudioEnvironment({
      devices: [{ name: "Mic", defaultInput: true, defaultOutput: false, inputChannels: 1, outputChannels: 0 }],
      audioContractTestPassed: true
    }).status,
    "blocked"
  );
});
