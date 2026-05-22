import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildHdiutilCreateArgs,
  dmgFileName,
  macosArchSuffix,
  resolveMacosDmgPaths
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
