import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SIDECAR_BASE_PATH,
  WHISPER_CPP_RELEASE_TAG,
  assertPreparedSidecars,
  copyPreparedSidecar,
  expectedSidecarFilename,
  expectedSidecarPath,
  mergeSidecarConfig,
  resolveCurrentTarget,
  renderSidecarConfig,
  resolveTargets,
  runWithTransientGitRetry,
  sourceBuildCmakeArgs
} from "./prepare-whisper-sidecars.mjs";

test("maps supported commercial desktop targets to Tauri sidecar filenames", () => {
  assert.equal(SIDECAR_BASE_PATH, "binaries/whisper-runtime/caveman-whisper");
  assert.equal(WHISPER_CPP_RELEASE_TAG, "v1.8.4");

  assert.equal(expectedSidecarFilename("windows-x64"), "caveman-whisper-x86_64-pc-windows-msvc.exe");
  assert.equal(expectedSidecarFilename("macos-x64"), "caveman-whisper-x86_64-apple-darwin");
  assert.equal(expectedSidecarFilename("macos-arm64"), "caveman-whisper-aarch64-apple-darwin");
  assert.equal(expectedSidecarFilename("linux-x64"), "caveman-whisper-x86_64-unknown-linux-gnu");
});

test("resolves current host target from Node platform and architecture", () => {
  assert.equal(resolveCurrentTarget("win32", "x64"), "windows-x64");
  assert.equal(resolveCurrentTarget("darwin", "x64"), "macos-x64");
  assert.equal(resolveCurrentTarget("darwin", "arm64"), "macos-arm64");
  assert.equal(resolveCurrentTarget("linux", "x64"), "linux-x64");
  assert.throws(() => resolveCurrentTarget("linux", "arm64"), /Unsupported sidecar host/);
});

test("renders a Tauri sidecar config without forcing Windows DLL resources on Unix builds", () => {
  assert.deepEqual(renderSidecarConfig({ includeWindowsRuntimeResources: false }), {
    bundle: {
      externalBin: [SIDECAR_BASE_PATH]
    }
  });

  assert.deepEqual(renderSidecarConfig({ includeWindowsRuntimeResources: true }), {
    bundle: {
      externalBin: [SIDECAR_BASE_PATH],
      resources: ["binaries/whisper-runtime/*.dll"]
    }
  });
});

test("builds source sidecars as self-contained executables", () => {
  assert.ok(sourceBuildCmakeArgs("/src", "/build").includes("-DBUILD_SHARED_LIBS=OFF"));
});

test("merges sidecar config into release config without dropping signing settings", () => {
  const merged = mergeSidecarConfig(
    {
      bundle: {
        createUpdaterArtifacts: true,
        windows: {
          certificateThumbprint: "ABC123",
          timestampUrl: "http://timestamp.example"
        }
      }
    },
    { includeWindowsRuntimeResources: true }
  );

  assert.deepEqual(merged, {
    bundle: {
      createUpdaterArtifacts: true,
      windows: {
        certificateThumbprint: "ABC123",
        timestampUrl: "http://timestamp.example"
      },
      externalBin: [SIDECAR_BASE_PATH],
      resources: ["binaries/whisper-runtime/*.dll"]
    }
  });
});

test("copies a prepared sidecar into the expected target-triple path", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-sidecars-"));
  try {
    const sourcePath = path.join(tempDir, "whisper-cli");
    await writeFile(sourcePath, "fake sidecar");

    const copiedPath = await copyPreparedSidecar({
      sourcePath,
      target: "linux-x64",
      tauriDir: tempDir
    });

    assert.equal(copiedPath, expectedSidecarPath("linux-x64", tempDir));
    assert.equal(await readFile(copiedPath, "utf8"), "fake sidecar");

    if (process.platform !== "win32") {
      const mode = (await stat(copiedPath)).mode;
      assert.ok((mode & 0o111) > 0, "copied Unix sidecar should be executable");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("checks every requested target before claiming all-platform sidecars are ready", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-sidecars-check-"));
  try {
    const linuxSidecarPath = expectedSidecarPath("linux-x64", tempDir);
    await mkdir(path.dirname(linuxSidecarPath), { recursive: true });
    await writeFile(linuxSidecarPath, "fake sidecar");

    await assert.rejects(
      () => assertPreparedSidecars(["linux-x64", "macos-arm64"], tempDir),
      /Missing prepared Whisper sidecar for macos-arm64/
    );

    await assert.doesNotReject(() => assertPreparedSidecars(["linux-x64"], tempDir));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("expands current and all target selectors deterministically", () => {
  assert.deepEqual(resolveTargets("all", "linux-x64"), [
    "windows-x64",
    "macos-x64",
    "macos-arm64",
    "linux-x64"
  ]);
  assert.deepEqual(resolveTargets("current", "macos-arm64"), ["macos-arm64"]);
  assert.deepEqual(resolveTargets("windows-x64", "linux-x64"), ["windows-x64"]);
});

test("retries transient git network failures while preparing source sidecars", async () => {
  let attempts = 0;

  const result = await runWithTransientGitRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error(
          "fatal: unable to access 'https://github.com/ggml-org/whisper.cpp.git/': Could not resolve host: github.com"
        );
      }
      return "cloned";
    },
    { delayMs: 0 }
  );

  assert.equal(result, "cloned");
  assert.equal(attempts, 2);
});
