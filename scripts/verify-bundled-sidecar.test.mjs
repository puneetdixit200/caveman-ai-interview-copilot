import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findFirstFileNamed,
  resolvePackageTarget,
  runtimeSidecarName,
  verifyBundledSidecar,
  verifyLinuxPackage,
  verifyMacosPackage,
  verifyWindowsPackage
} from "./verify-bundled-sidecar.mjs";

async function touchFile(filePath, contents = "x") {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

test("resolves current package target from platform and architecture", () => {
  assert.equal(resolvePackageTarget("current", "win32", "x64"), "windows-x64");
  assert.equal(resolvePackageTarget("current", "darwin", "x64"), "macos-x64");
  assert.equal(resolvePackageTarget("current", "darwin", "arm64"), "macos-arm64");
  assert.equal(resolvePackageTarget("current", "linux", "x64"), "linux-x64");
  assert.equal(runtimeSidecarName("windows-x64"), "caveman-whisper.exe");
  assert.equal(runtimeSidecarName("linux-x64"), "caveman-whisper");
});

test("verifies macOS app bundle contains the runtime sidecar and a DMG", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-macos-package-"));
  const releaseDir = path.join(tempDir, "release");
  await touchFile(path.join(releaseDir, "bundle", "macos", "Caveman.app", "Contents", "MacOS", "caveman-whisper"));
  await chmod(path.join(releaseDir, "bundle", "macos", "Caveman.app", "Contents", "MacOS", "caveman-whisper"), 0o755);
  await touchFile(path.join(releaseDir, "bundle", "dmg", "Caveman_0.1.1_aarch64.dmg"));

  const result = await verifyMacosPackage({ target: "macos-arm64", releaseDir });

  assert.equal(result.target, "macos-arm64");
  assert.ok(result.checked.some((checkedPath) => checkedPath.endsWith("caveman-whisper")));
});

test("extracts Windows MSI and verifies sidecar plus runtime DLLs", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-windows-package-"));
  const releaseDir = path.join(tempDir, "release");
  await touchFile(path.join(releaseDir, "bundle", "nsis", "Caveman_0.1.1_x64-setup.exe"));
  await touchFile(path.join(releaseDir, "bundle", "msi", "Caveman_0.1.1_x64_en-US.msi"));

  const commands = [];
  const commandRunner = async (command, args) => {
    commands.push([command, args]);
    const targetDir = args.find((arg) => String(arg).startsWith("TARGETDIR=")).slice("TARGETDIR=".length);
    await touchFile(path.join(targetDir, "Program Files", "Caveman", "caveman-whisper.exe"));
    for (const dll of ["ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll"]) {
      await touchFile(path.join(targetDir, "Program Files", "Caveman", dll));
    }
    return { stdout: "" };
  };

  const result = await verifyWindowsPackage({ releaseDir, commandRunner });

  assert.equal(result.target, "windows-x64");
  assert.equal(commands[0][0], "msiexec.exe");
  assert.ok(result.checked.some((checkedPath) => checkedPath.endsWith("caveman-whisper.exe")));
});

test("checks Linux DEB listing and extracts AppImage sidecar", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-linux-package-"));
  const releaseDir = path.join(tempDir, "release");
  const appImage = path.join(releaseDir, "bundle", "appimage", "Caveman_0.1.1_amd64.AppImage");
  const deb = path.join(releaseDir, "bundle", "deb", "Caveman_0.1.1_amd64.deb");
  await touchFile(appImage);
  await touchFile(deb);

  const commands = [];
  const commandRunner = async (command, args, options = {}) => {
    commands.push([command, args]);
    if (command === "dpkg-deb") {
      return { stdout: "./usr/bin/caveman-whisper\n" };
    }
    await touchFile(path.join(options.cwd, "squashfs-root", "usr", "bin", "caveman-whisper"));
    return { stdout: "" };
  };

  const result = await verifyLinuxPackage({ releaseDir, commandRunner });

  assert.equal(result.target, "linux-x64");
  assert.equal(commands[0][0], "dpkg-deb");
  assert.equal(commands[1][1][0], "--appimage-extract");
});

test("fails when a required package sidecar is missing", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-missing-sidecar-"));
  const releaseDir = path.join(tempDir, "release");
  await touchFile(path.join(releaseDir, "bundle", "macos", "Caveman.app", "Contents", "MacOS", "caveman"));
  await touchFile(path.join(releaseDir, "bundle", "dmg", "Caveman_0.1.1_aarch64.dmg"));

  await assert.rejects(() => verifyMacosPackage({ target: "macos-arm64", releaseDir }), /caveman-whisper/);
});

test("dispatches by explicit target selector", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-dispatch-sidecar-"));
  const releaseDir = path.join(tempDir, "release");
  await touchFile(path.join(releaseDir, "bundle", "macos", "Caveman.app", "Contents", "MacOS", "caveman-whisper"));
  await touchFile(path.join(releaseDir, "bundle", "dmg", "Caveman_0.1.1_x64.dmg"));

  const result = await verifyBundledSidecar({ targetSelector: "macos-x64", releaseDir });

  assert.equal(result.target, "macos-x64");
});

test("finds a file recursively by exact runtime name", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "caveman-find-sidecar-"));
  const expectedPath = path.join(tempDir, "nested", "caveman-whisper");
  await touchFile(expectedPath);

  assert.equal(await findFirstFileNamed(tempDir, "caveman-whisper"), expectedPath);
});
