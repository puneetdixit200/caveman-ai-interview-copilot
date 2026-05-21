import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildLatestJson,
  findWindowsUpdateArtifact,
  normalizeBaseUrl,
  selectPreferredWindowsArtifact
} from "./generate-latest-json.mjs";

test("builds a Tauri v2 latest.json manifest from signed Windows artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "caveman-release-"));
  try {
    const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle");
    const nsisDir = path.join(bundleDir, "nsis");
    await mkdir(nsisDir, { recursive: true });
    await mkdir(path.join(root, "src-tauri"), { recursive: true });
    await writeFile(path.join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: "0.2.0" }));
    await writeFile(path.join(nsisDir, "Caveman_0.2.0_x64-setup.exe"), "installer");
    await writeFile(path.join(nsisDir, "Caveman_0.2.0_x64-setup.exe.sig"), "signed-payload\n");

    const manifest = await buildLatestJson({
      projectRoot: root,
      bundleDir,
      baseUrl: "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download/",
      pubDate: "2026-05-21T00:00:00.000Z",
      notes: "Release notes"
    });

    assert.equal(manifest.version, "0.2.0");
    assert.equal(manifest.notes, "Release notes");
    assert.equal(manifest.pub_date, "2026-05-21T00:00:00.000Z");
    assert.deepEqual(manifest.platforms["windows-x86_64"], {
      signature: "signed-payload",
      url: "https://github.com/puneetdixit200/caveman-ai-interview-copilot/releases/latest/download/Caveman_0.2.0_x64-setup.exe"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires signatures before writing a release manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "caveman-release-"));
  try {
    const bundleDir = path.join(root, "bundle");
    await mkdir(path.join(bundleDir, "nsis"), { recursive: true });
    await writeFile(path.join(bundleDir, "nsis", "Caveman_0.2.0_x64-setup.exe"), "installer");

    await assert.rejects(() => findWindowsUpdateArtifact(bundleDir), /No signed Windows updater artifact/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prefers NSIS setup artifacts and normalizes release URLs", () => {
  const selected = selectPreferredWindowsArtifact([
    "C:/repo/src-tauri/target/release/bundle/msi/Caveman_0.2.0_x64_en-US.msi",
    "C:/repo/src-tauri/target/release/bundle/nsis/Caveman_0.2.0_x64-setup.exe"
  ]);

  assert.equal(selected.endsWith("Caveman_0.2.0_x64-setup.exe"), true);
  assert.equal(normalizeBaseUrl("https://example.com/releases/latest/download///"), "https://example.com/releases/latest/download");
});
