#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expectedSidecarPath, resolveCurrentTarget } from "./prepare-whisper-sidecars.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export const DEFAULT_MODEL_PATH = "models/ggml-base.en.bin";
export const DEFAULT_PHRASE = "hello world";

export function resolveDefaultWhisperBinaryPath({
  platform = process.platform,
  arch = process.arch,
  repoRoot = "."
} = {}) {
  const target = resolveCurrentTarget(platform, arch);
  return expectedSidecarPath(target, path.join(repoRoot, "src-tauri"));
}

export function buildWhisperSmokeArgs({
  modelPath,
  audioPath,
  outputBase,
  language = "en"
}) {
  return ["-m", modelPath, "-f", audioPath, "-l", language, "-nt", "-oj", "-of", outputBase];
}

export function parseWhisperTranscriptionText(json) {
  const payload = JSON.parse(json);
  const segments = Array.isArray(payload?.transcription) ? payload.transcription : [];
  const text = segments
    .map((segment) => (typeof segment?.text === "string" ? segment.text.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new Error("Local Whisper smoke produced an empty transcription");
  }

  return text;
}

export function summarizeLocalWhisperSmoke({ binaryPath, modelPath, text, durationMs }) {
  return {
    status: "ready",
    detail: `Bundled local Whisper transcribed generated speech with ${modelPath}: "${text}" in ${durationMs}ms.`
  };
}

export async function runLocalWhisperSmoke({
  binaryPath = resolveDefaultWhisperBinaryPath({ repoRoot: REPO_ROOT }),
  modelPath = DEFAULT_MODEL_PATH,
  audioPath,
  phrase = DEFAULT_PHRASE,
  timeoutMs = 30_000
} = {}) {
  const resolvedBinaryPath = path.resolve(REPO_ROOT, binaryPath);
  const resolvedModelPath = path.resolve(REPO_ROOT, modelPath);
  await assertFileExists(resolvedBinaryPath, "Local Whisper sidecar");
  await assertFileExists(resolvedModelPath, "Local Whisper model");

  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-local-whisper-smoke-"));
  try {
    const resolvedAudioPath =
      audioPath ? path.resolve(REPO_ROOT, audioPath) : await generateSpeechWav({ tempDir, phrase, timeoutMs });
    await assertFileExists(resolvedAudioPath, "Local Whisper smoke audio");

    const outputBase = path.join(tempDir, "result");
    const startedAt = Date.now();
    await execFileAsync(
      resolvedBinaryPath,
      buildWhisperSmokeArgs({
        modelPath: resolvedModelPath,
        audioPath: resolvedAudioPath,
        outputBase
      }),
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20 }
    );
    const durationMs = Date.now() - startedAt;
    const text = parseWhisperTranscriptionText(await readFile(`${outputBase}.json`, "utf8"));
    const summary = summarizeLocalWhisperSmoke({ binaryPath, modelPath, text, durationMs });

    return {
      ...summary,
      binaryPath,
      modelPath,
      audioPath: resolvedAudioPath,
      text,
      durationMs
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function generateSpeechWav({ tempDir, phrase, timeoutMs }) {
  if (process.platform !== "darwin") {
    throw new Error("Pass --audio-path on non-macOS hosts to live-test local Whisper STT.");
  }

  const aiffPath = path.join(tempDir, "input.aiff");
  const wavPath = path.join(tempDir, "input.wav");
  await execFileAsync("say", ["-o", aiffPath, phrase], { timeout: timeoutMs });
  await execFileAsync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", aiffPath, wavPath], {
    timeout: timeoutMs
  });
  return wavPath;
}

async function assertFileExists(candidate, label) {
  try {
    await access(candidate);
  } catch (error) {
    throw new Error(`${label} is missing: ${candidate}`, { cause: error });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--binary-path":
        options.binaryPath = next();
        break;
      case "--model-path":
        options.modelPath = next();
        break;
      case "--audio-path":
        options.audioPath = next();
        break;
      case "--phrase":
        options.phrase = next();
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next());
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/local-whisper-smoke.mjs [options]

Options:
  --binary-path <path>  Whisper sidecar path. Defaults to the current host bundled sidecar.
  --model-path <path>   ggml model path. Defaults to models/ggml-base.en.bin.
  --audio-path <path>   Existing WAV/MP3/FLAC/OGG input. Required on non-macOS hosts.
  --phrase <text>       Generated macOS speech phrase. Defaults to "hello world".
  --timeout-ms <ms>     Per-command timeout. Defaults to 30000.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  try {
    const result = await runLocalWhisperSmoke(options);
    console.log("READY");
    console.log(`- ${result.detail}`);
    console.log(`- Whisper binary: ${result.binaryPath}`);
    console.log(`- Whisper model: ${result.modelPath}`);
  } catch (error) {
    console.log("BLOCKED");
    console.log(`- ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
