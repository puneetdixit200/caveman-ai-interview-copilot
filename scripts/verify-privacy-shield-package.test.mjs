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

const DESKTOP_PROCESS_TARGETS = ["windows-x64", "macos-x64", "macos-arm64"];

function assertDesktopProcessMarker(marker) {
  for (const target of DESKTOP_PROCESS_TARGETS) {
    assert.ok(TARGET_PRIVACY_SHIELD_MARKERS[target].includes(marker), `${target} must require ${marker}`);
  }
  assert.ok(!TARGET_PRIVACY_SHIELD_MARKERS["linux-x64"].includes(marker), `linux-x64 must not require ${marker}`);
}

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
  assertDesktopProcessMarker("teamviewer.exe");
  assertDesktopProcessMarker("anydesk.exe");
  assertDesktopProcessMarker("rustdesk.exe");
  assertDesktopProcessMarker("remoting_host.exe");
  assertDesktopProcessMarker("chrome remote desktop");
  assertDesktopProcessMarker("vnc viewer");
  assertDesktopProcessMarker("parsec");
  assertDesktopProcessMarker("splashtop streamer");
  assertDesktopProcessMarker("quickassist.exe");
  assertDesktopProcessMarker("msra.exe");
  assertDesktopProcessMarker("mstsc.exe");
  assertDesktopProcessMarker("remotehelp.exe");
  assertDesktopProcessMarker("logmein");
  assertDesktopProcessMarker("bomgar-scc.exe");
  assertDesktopProcessMarker("beyondtrust");
  assertDesktopProcessMarker("jump desktop");
  assertDesktopProcessMarker("nomachine");
  assertDesktopProcessMarker("connectwisecontrol.client.exe");
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenconnect.windowsclient.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screenconnect.client.exe"));
  assertDesktopProcessMarker("screenconnect.clientservice.exe");
});

test("requires packaged desktop meeting app detector markers", () => {
  assertDesktopProcessMarker("skype.exe");
  assertDesktopProcessMarker("gotomeeting.exe");
  assertDesktopProcessMarker("g2mcomm.exe");
  assertDesktopProcessMarker("g2mstart.exe");
  assertDesktopProcessMarker("bluejeans.exe");
  assertDesktopProcessMarker("ringcentral.exe");
  assertDesktopProcessMarker("jitsi meet");
  assertDesktopProcessMarker("join.me");
  assertDesktopProcessMarker("around.exe");
  assertDesktopProcessMarker("mmhmm.exe");
  assertDesktopProcessMarker("telegram.exe");
  assertDesktopProcessMarker("signal.exe");
  assertDesktopProcessMarker("facetime");
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
  assertDesktopProcessMarker("obs64.exe");
  assertDesktopProcessMarker("obs32.exe");
  assertDesktopProcessMarker("streamlabs obs");
  assertDesktopProcessMarker("streamlabs desktop");
  assertDesktopProcessMarker("quicktime player");
  assertDesktopProcessMarker("loom.exe");
  assertDesktopProcessMarker("camtasia.exe");
  assertDesktopProcessMarker("snagit64.exe");
  assertDesktopProcessMarker("screenflow");
  assertDesktopProcessMarker("xsplit.core.exe");
  assertDesktopProcessMarker("sharex.exe");
  assertDesktopProcessMarker("bandicam.exe");
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
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this tab is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this window is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this screen is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("stop sharing"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you are presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you're presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting this tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting a window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen recording"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen is being recorded"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("being recorded"));
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
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield denied active-window typing because capture exclusion was not proven."
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
    COMMON_PRIVACY_SHIELD_MARKERS.includes("Startup privacy shield denied initial companion window show.")
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows stayed hidden because capture exclusion was not proven."
    )
  );
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("Companion window capture exclusion is unsafe."));
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes("Overlay bounds update refused before capture exclusion was proven.")
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Overlay show was reverted because capture exclusion was not proven after visibility changed."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app window show was reverted because capture exclusion was not proven after visibility changed."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Overlay show was reverted because screen-share risk was detected after visibility changed."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app window show was reverted because screen-share risk was detected after visibility changed."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes("Native privacy shield starts before startup companion window show.")
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
