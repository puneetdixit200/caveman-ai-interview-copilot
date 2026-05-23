import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhisperSmokeArgs,
  parseWhisperTranscriptionText,
  resolveDefaultWhisperBinaryPath,
  summarizeLocalWhisperSmoke
} from "./local-whisper-smoke.mjs";

test("resolves the current host bundled Whisper sidecar path", () => {
  assert.equal(
    resolveDefaultWhisperBinaryPath({ platform: "darwin", arch: "arm64" }).replace(/\\/g, "/"),
    "src-tauri/binaries/whisper-runtime/caveman-whisper-aarch64-apple-darwin"
  );
  assert.equal(
    resolveDefaultWhisperBinaryPath({ platform: "win32", arch: "x64" }).replace(/\\/g, "/"),
    "src-tauri/binaries/whisper-runtime/caveman-whisper-x86_64-pc-windows-msvc.exe"
  );
});

test("builds a local Whisper command that loads the configured model and writes JSON", () => {
  assert.deepEqual(
    buildWhisperSmokeArgs({
      modelPath: "models/ggml-base.en.bin",
      audioPath: "/tmp/input.wav",
      outputBase: "/tmp/result"
    }),
    [
      "-m",
      "models/ggml-base.en.bin",
      "-f",
      "/tmp/input.wav",
      "-l",
      "en",
      "-nt",
      "-oj",
      "-of",
      "/tmp/result"
    ]
  );
});

test("parses local Whisper JSON transcription text", () => {
  const text = parseWhisperTranscriptionText(
    JSON.stringify({
      transcription: [{ text: " Hello" }, { text: " World!" }]
    })
  );

  assert.equal(text, "Hello World!");
});

test("summarizes a successful local Whisper smoke", () => {
  assert.deepEqual(
    summarizeLocalWhisperSmoke({
      binaryPath: "src-tauri/binaries/whisper-runtime/caveman-whisper-aarch64-apple-darwin",
      modelPath: "models/ggml-base.en.bin",
      text: "Hello World!",
      durationMs: 383
    }),
    {
      status: "ready",
      detail:
        "Bundled local Whisper transcribed generated speech with models/ggml-base.en.bin: \"Hello World!\" in 383ms."
    }
  );
});
