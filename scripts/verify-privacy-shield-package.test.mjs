import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMON_PRIVACY_SHIELD_MARKERS,
  TARGET_PRIVACY_SHIELD_MARKERS,
  evaluateBinaryPrivacyMarkers,
  privacyShieldAttestationName,
  verifyPrivacyShieldPackage,
  writePrivacyShieldAttestation
} from "./verify-privacy-shield-package.mjs";

test("validates packaged native privacy markers from binary content", () => {
  const binary = Buffer.from(`prefix ${COMMON_PRIVACY_SHIELD_MARKERS.join(" middle ")} suffix`);

  const result = evaluateBinaryPrivacyMarkers(binary, COMMON_PRIVACY_SHIELD_MARKERS);

  assert.equal(result.status, "ready");
  assert.deepEqual(result.missingMarkers, []);
});

test("requires packaged Teams and Google Meet WebView detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msedgewebview2.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msedge_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("chrome_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("brave_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("opera_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vivaldi_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("teams.microsoft.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("meet.google.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("meet - "));
});

test("requires packaged remote screen-share detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("webexhost.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("teamviewer.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("anydesk.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("rustdesk.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("remoting_host.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("chrome remote desktop"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vnc viewer"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("parsec"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("splashtop streamer"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("quickassist.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msra.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("mstsc.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("remotehelp.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("logmein"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("bomgar-scc.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("beyondtrust"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("jump desktop"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("nomachine"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("connectwisecontrol.client.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenconnect.windowsclient.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenconnect.client.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenconnect.clientservice.exe"));
});

test("requires packaged desktop meeting app detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("skype.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("gotomeeting.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("g2mcomm.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("g2mstart.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("bluejeans.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("ringcentral.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("jitsi meet"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("join.me"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("around.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("mmhmm.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("telegram.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("signal.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("facetime"));
});

test("requires packaged web meeting and recording title detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("whereby.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("zoom.us"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("app.slack.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("teams.live.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("teams.cloud.microsoft"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("discord.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("web.whatsapp.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("webex.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("meet.goto.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("meet.jit.si"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("app.chime.aws"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("riverside.fm"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("streamyard.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("livestorm.co"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("bigbluebutton"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("tella.tv"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenpal.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("veed.io"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("clipchamp.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vidyard.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("descript.com"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("studio.restream.io"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vdo.ninja"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("obs64.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("obs32.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("streamlabs obs"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("streamlabs desktop"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("quicktime player"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("loom.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("camtasia.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("snagit64.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenflow"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("xsplit.core.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharex.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("bandicam.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenpal.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screencast-o-matic"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("descript.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vidyard.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("clipchamp.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you are sharing"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you're sharing"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing this tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing a window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("stop sharing"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you are presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you're presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting this tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting a window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen recording"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording screen"));
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes("Screen-share window title guard normalizes UI punctuation before matching.")
  );
});

test("requires packaged remote-support service detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("zohoassist.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("za_connect.exe"));
});

test("requires packaged macOS system capture detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screencaptureui"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screencapture"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("replayd"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screencapturekitagent"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("macOS window title screen-share guard failed closed:"));
});

test("requires packaged Windows display-affinity readback marker", () => {
  assert.ok(TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes("SetWindowDisplayAffinity"));
  assert.ok(TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes("GetWindowDisplayAffinity"));
});

test("requires packaged OCR capture settle marker", () => {
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Waiting for app windows to leave capture surfaces before screen OCR capture."
    )
  );
});

test("requires packaged active-window typing privacy marker", () => {
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield denied active-window typing during screen-share risk."
    )
  );
});

test("requires packaged protection refresh fail-closed marker", () => {
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield hid app windows after protection refresh failed closed."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows stayed hidden because capture exclusion was not proven."
    )
  );
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("Companion window capture exclusion is unsafe."));
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard."
    )
  );
});

test("reports missing packaged native privacy markers", () => {
  const result = evaluateBinaryPrivacyMarkers(Buffer.from("Capture exclusion is not enforced."), [
    "Capture exclusion is not enforced.",
    "Native privacy shield denied showing",
    "SetWindowDisplayAffinity"
  ]);

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingMarkers, ["Native privacy shield denied showing", "SetWindowDisplayAffinity"]);
});

test("writes target-specific privacy shield attestations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-attestation-"));
  try {
    const attestationPath = path.join(dir, privacyShieldAttestationName("macos-arm64"));

    await writePrivacyShieldAttestation({
      outputPath: attestationPath,
      target: "macos-arm64",
      checked: ["/tmp/Caveman.app/Contents/MacOS/caveman"],
      markers: ["Capture exclusion is not enforced."]
    });

    const payload = JSON.parse(await readFile(attestationPath, "utf8"));
    assert.equal(payload.target, "macos-arm64");
    assert.equal(payload.status, "ready");
    assert.deepEqual(payload.checked, ["/tmp/Caveman.app/Contents/MacOS/caveman"]);
    assert.deepEqual(payload.markers, ["Capture exclusion is not enforced."]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifies downloaded macOS package-smoke artifact layout", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-downloaded-macos-"));
  try {
    const binaryPath = path.join(dir, "macos", "Caveman.app", "Contents", "MacOS", "caveman");
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));

    const result = await verifyPrivacyShieldPackage({
      targetSelector: "macos-arm64",
      releaseDir: dir
    });

    assert.equal(result.status, "ready");
    assert.deepEqual(result.checked, [binaryPath]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
