import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  MACOS_DMG_MEETING_RISK_SMOKE_MARKER,
  findSingleMacosDmg,
  runMacosDmgMeetingRiskSmoke
} from "./macos-dmg-meeting-risk-smoke.mjs";

test("finds the generated macOS DMG for package meeting-risk smoke", async () => {
  const dir = await mkdtemp(join(tmpdir(), "caveman-dmg-risk-find-"));
  try {
    const dmgDir = join(dir, "bundle", "dmg");
    await mkdir(dmgDir, { recursive: true });
    const dmgPath = join(dmgDir, "Caveman_0.1.1_aarch64.dmg");
    await writeFile(dmgPath, "fake dmg");

    assert.equal(await findSingleMacosDmg(dir), dmgPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runs meeting-risk smoke against the mounted DMG app bundle", async () => {
  assert.ok(MACOS_DMG_MEETING_RISK_SMOKE_MARKER.includes("DMG"));
  assert.ok(MACOS_DMG_MEETING_RISK_SMOKE_MARKER.includes("Google Meet"));
  assert.ok(MACOS_DMG_MEETING_RISK_SMOKE_MARKER.includes("Teams"));

  const dir = await mkdtemp(join(tmpdir(), "caveman-dmg-risk-run-"));
  const commands = [];
  try {
    const dmgDir = join(dir, "bundle", "dmg");
    await mkdir(dmgDir, { recursive: true });
    const dmgPath = join(dmgDir, "Caveman_0.1.1_x64.dmg");
    await writeFile(dmgPath, "fake dmg");

    const result = await runMacosDmgMeetingRiskSmoke({
      platform: "darwin",
      releaseDir: dir,
      commandRunner: async (command, args) => {
        commands.push([command, args]);
        if (command === "hdiutil" && args[0] === "attach") {
          await mkdir(join(args[3], "Caveman.app"), { recursive: true });
        }
        return { stdout: "", stderr: "" };
      },
      meetingRiskRunner: async ({ appPath, requireRestore, restoreWaitMs }) => {
        assert.match(appPath, /Caveman\.app$/);
        assert.equal(requireRestore, false);
        assert.equal(restoreWaitMs, 5_000);
        return {
          status: "ready",
          messages: [`ran against ${appPath}`]
        };
      }
    });

    assert.equal(result.status, "ready");
    assert.match(result.messages[0], /Mounted DMG/);
    assert.ok(commands.some(([command, args]) => command === "hdiutil" && args[0] === "attach"));
    assert.ok(commands.some(([command, args]) => command === "hdiutil" && args[0] === "detach"));
    assert.ok(commands.some(([command]) => command === "osascript"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips DMG meeting-risk smoke outside macOS", async () => {
  const result = await runMacosDmgMeetingRiskSmoke({ platform: "linux" });

  assert.equal(result.status, "skipped");
});
