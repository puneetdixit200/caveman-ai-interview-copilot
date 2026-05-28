import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_HDIUTIL_CREATE_ATTEMPTS,
  DEFAULT_HDIUTIL_CREATE_RETRY_DELAY_MS,
  HDIUTIL_RESOURCE_BUSY_RETRY_MARKER,
  buildHdiutilCreateArgs,
  dmgFileName,
  macosArchSuffix,
  resolveMacosDmgPaths,
  runHdiutilCreateWithRetry
} from "./create-macos-dmg.mjs";

test("names macOS DMG artifacts with Tauri-compatible architecture suffixes", () => {
  assert.equal(macosArchSuffix("arm64"), "aarch64");
  assert.equal(macosArchSuffix("x64"), "x64");
  assert.equal(dmgFileName({ productName: "Caveman", version: "0.1.0", arch: "arm64" }), "Caveman_0.1.0_aarch64.dmg");
});

test("resolves macOS app, dmg, and staging paths under the Tauri bundle directory", () => {
  const paths = resolveMacosDmgPaths({
    projectRoot: "/repo",
    productName: "Caveman",
    version: "0.1.0",
    arch: "x64"
  });

  assert.equal(paths.appPath, path.join("/repo", "src-tauri", "target", "release", "bundle", "macos", "Caveman.app"));
  assert.equal(paths.dmgPath, path.join("/repo", "src-tauri", "target", "release", "bundle", "dmg", "Caveman_0.1.0_x64.dmg"));
  assert.equal(paths.stagingDir, path.join("/repo", "src-tauri", "target", "release", "bundle", "dmg", "Caveman.dmg-staging"));
});

test("builds a direct hdiutil create command without Finder AppleScript decoration", () => {
  assert.deepEqual(
    buildHdiutilCreateArgs({
      volumeName: "Caveman",
      sourceFolder: "/tmp/Caveman.dmg-staging",
      outputPath: "/tmp/Caveman_0.1.0_aarch64.dmg"
    }),
    [
      "create",
      "-volname",
      "Caveman",
      "-srcfolder",
      "/tmp/Caveman.dmg-staging",
      "-ov",
      "-format",
      "UDZO",
      "/tmp/Caveman_0.1.0_aarch64.dmg"
    ]
  );
});

test("retries transient hdiutil DMG creation failures before failing package smoke", async () => {
  const calls = [];
  const waits = [];
  const spawn = (program, args, options) => {
    calls.push({ program, args, options });
    if (calls.length === 1) {
      return { status: 1, stdout: Buffer.from(""), stderr: Buffer.from("hdiutil: create failed - Resource busy\n") };
    }
    return { status: 0, stdout: Buffer.from("created\n"), stderr: Buffer.from("") };
  };

  await runHdiutilCreateWithRetry({
    productName: "Caveman",
    paths: {
      stagingDir: "/tmp/Caveman.dmg-staging",
      dmgPath: "/tmp/Caveman_0.1.0_x64.dmg"
    },
    spawn,
    wait: async (delayMs) => {
      waits.push(delayMs);
    }
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [DEFAULT_HDIUTIL_CREATE_RETRY_DELAY_MS]);
  assert.equal(calls[0].program, "hdiutil");
  assert.deepEqual(calls[0].options, { stdio: "pipe" });
});

test("reports the hdiutil retry marker when every DMG creation attempt fails", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    await assert.rejects(
      runHdiutilCreateWithRetry({
        productName: "Caveman",
        paths: {
          stagingDir: "/tmp/Caveman.dmg-staging",
          dmgPath: "/tmp/Caveman_0.1.0_x64.dmg"
        },
        spawn: () => ({
          status: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from("hdiutil: create failed - Resource busy\n")
        }),
        wait: async () => undefined
      }),
      /hdiutil failed while creating .* after 3 attempt/
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, DEFAULT_HDIUTIL_CREATE_ATTEMPTS - 1);
  assert.ok(warnings.every((message) => message.includes(HDIUTIL_RESOURCE_BUSY_RETRY_MARKER)));
});
