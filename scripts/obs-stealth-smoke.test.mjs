import assert from "node:assert/strict";
import test from "node:test";

import {
  OBS_BUNDLE_PATH,
  buildObsLaunchCommand,
  parsePgrepOutput,
  summarizeObsSmoke
} from "./obs-stealth-smoke.mjs";

test("uses the standard macOS OBS bundle path for local validation", () => {
  assert.equal(OBS_BUNDLE_PATH, "/Applications/OBS.app");
  assert.deepEqual(buildObsLaunchCommand(), ["open", ["-gj", "-a", "OBS"]]);
});

test("parses running OBS process output from pgrep", () => {
  assert.deepEqual(
    parsePgrepOutput("123 /Applications/OBS.app/Contents/MacOS/OBS\n456 /opt/homebrew/bin/obs\n"),
    [
      { pid: 123, command: "/Applications/OBS.app/Contents/MacOS/OBS" },
      { pid: 456, command: "/opt/homebrew/bin/obs" }
    ]
  );
});

test("summarizes OBS stealth validation state", () => {
  assert.deepEqual(
    summarizeObsSmoke({
      appInstalled: true,
      cliInstalled: true,
      launchedForSmoke: true,
      processCount: 1,
      screenShareGuardTestPassed: true
    }),
    {
      status: "ready",
      messages: [
        "OBS app bundle is installed.",
        "OBS CLI wrapper is available.",
        "OBS launch smoke detected a running process.",
        "Screen-share guard contract test passed for OBS process names."
      ]
    }
  );

  assert.equal(
    summarizeObsSmoke({
      appInstalled: false,
      cliInstalled: false,
      launchedForSmoke: false,
      processCount: 0,
      screenShareGuardTestPassed: false
    }).status,
    "blocked"
  );
});
