import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMON_PRIVACY_SHIELD_MARKERS,
  FRONTEND_PRIVACY_SHIELD_MARKERS,
  MACOS_COMPANION_WINDOW_REPAIR_MARKERS,
  MACOS_NATIVE_PRIVACY_SHIELD_MARKERS,
  TARGET_PRIVACY_SHIELD_MARKERS,
  evaluateBinaryPrivacyMarkers,
  evaluatePackagePrivacyMarkers,
  privacyShieldAttestationName,
  verifyPrivacyShieldPackage,
  writePrivacyShieldAttestation
} from "./verify-privacy-shield-package.mjs";

const DESKTOP_PROCESS_TARGETS = ["windows-x64", "macos-x64", "macos-arm64"];
const MACOS_LIBPROC_CAPTURE_MARKER =
  "Native privacy shield enumerates macOS capture processes through libproc before shell fallbacks.";
const MACOS_PGREP_FAIL_CLOSED_MARKER =
  "Native privacy shield treats unexpected macOS pgrep errors as fail-closed before slower process parsing.";

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

test("validates packaged frontend privacy markers across built app assets", () => {
  const result = evaluatePackagePrivacyMarkers(
    ["native binary without UI text", `assets ${FRONTEND_PRIVACY_SHIELD_MARKERS.join(" middle ")}`],
    FRONTEND_PRIVACY_SHIELD_MARKERS
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(result.missingMarkers, []);
});

test("requires packaged WebView privacy command timeout marker", () => {
  assert.ok(
    FRONTEND_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield WebView command timeout failed closed before overlay visibility could drift."
    )
  );
});

test("requires packaged Teams and Google Meet WebView detector markers", () => {
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msedgewebview2.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("msedge_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("applicationframehost.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("chrome_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("brave_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("opera_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("vivaldi_proxy.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("zen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("zen.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("chromium"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("chromium.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("librewolf"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("librewolf.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("waterfox"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("waterfox.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("floorp"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("floorp.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("duckduckgo"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("duckduckgo.exe"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("mullvad browser"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("mullvad-browser"));
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
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing your entire screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing entire screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing this tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing a browser tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing a chrome tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing a window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("sharing an application window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this tab is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this window is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("application window is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("this screen is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen is being shared"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("stop sharing"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you are presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("you're presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting this tab"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting a window"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("presenting to everyone"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("stop presenting"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen recording"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording your screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("recording screen"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("screen is being recorded"));
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("being recorded"));
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Screen-share guard command timeout failed closed before privacy polling could stall."
    )
  );
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
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "macOS window title screen-share guard permission denial falls back to OS capture protection."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "macOS window title screen-share guard skips transient System Events rows."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "macOS window title screen-share guard timeout falls back to OS capture protection."
    )
  );
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
      "Companion app window bounds are repaired before and after privacy-approved startup show."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows are restored and repaired while privacy shield stays clear."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion window bounds watchdog pauses repairs while screen-share risk is active."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows are focused only when unusable bounds need repair after privacy clears."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield exposes a nonblocking share-risk latch for bounds repair."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "macOS companion window repair reactivates the app only after unusable bounds are detected."
    )
  );
  assert.ok(
    MACOS_COMPANION_WINDOW_REPAIR_MARKERS.includes(
      "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
    )
  );
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].includes(
      "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
    )
  );
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-x64"].includes(
      "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
    )
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes(
      "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
    )
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["linux-x64"].includes(
      "macOS companion window repair forces native bounds when CoreGraphics reports collapsed windows."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "macOS process screen-share guard skips window-title scan after direct capture-process match."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "macOS window-title guard uses a short timeout so native privacy polling cannot stall."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield scans macOS window titles on a bounded background worker for browser Meet and Teams risk."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield checks macOS CoreGraphics visible window titles before app windows can show."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "macOS CoreGraphics title guard hides when a visible browser window title is unavailable."
    )
  );
  assert.ok(MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(MACOS_LIBPROC_CAPTURE_MARKER));
  assert.ok(TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].includes(MACOS_LIBPROC_CAPTURE_MARKER));
  assert.ok(TARGET_PRIVACY_SHIELD_MARKERS["macos-x64"].includes(MACOS_LIBPROC_CAPTURE_MARKER));
  assert.ok(!TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes(MACOS_LIBPROC_CAPTURE_MARKER));
  assert.ok(!TARGET_PRIVACY_SHIELD_MARKERS["linux-x64"].includes(MACOS_LIBPROC_CAPTURE_MARKER));
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].includes(
      "macOS process screen-share guard skips window-title scan after direct capture-process match."
    )
  );
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-x64"].includes(
      "macOS process screen-share guard skips window-title scan after direct capture-process match."
    )
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes(
      "macOS process screen-share guard skips window-title scan after direct capture-process match."
    )
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["linux-x64"].includes(
      "macOS process screen-share guard skips window-title scan after direct capture-process match."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows reactivate after screen-share risk clears to recover usable bounds."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Companion window bounds watchdog performs a visible restore only after privacy clears."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(
      "Companion app windows use a privacy-gated reopen restore when the bundle is reopened."
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
  assert.ok(COMMON_PRIVACY_SHIELD_MARKERS.includes("Native privacy shield polls every 50ms for new screen-share risk."));
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield keeps macOS window-title scans out of the fast poll so direct capture polling cannot stall."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield checks macOS capture processes with pgrep before slower process parsing."
    )
  );
  assert.ok(
    MACOS_NATIVE_PRIVACY_SHIELD_MARKERS.includes(MACOS_PGREP_FAIL_CLOSED_MARKER)
  );
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].includes(MACOS_PGREP_FAIL_CLOSED_MARKER)
  );
  assert.ok(
    TARGET_PRIVACY_SHIELD_MARKERS["macos-x64"].includes(MACOS_PGREP_FAIL_CLOSED_MARKER)
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].includes(MACOS_PGREP_FAIL_CLOSED_MARKER)
  );
  assert.ok(
    !TARGET_PRIVACY_SHIELD_MARKERS["linux-x64"].includes(MACOS_PGREP_FAIL_CLOSED_MARKER)
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield refreshes capture exclusion before hiding for screen-share risk."
    )
  );
  assert.ok(
    COMMON_PRIVACY_SHIELD_MARKERS.includes(
      "Native privacy shield applies app-window updates on the Tauri main thread."
    )
  );
  assert.ok(
    FRONTEND_PRIVACY_SHIELD_MARKERS.includes(
      "Overlay kept hidden until screen-share guard stays clear for repeated checks."
    )
  );
  assert.ok(
    FRONTEND_PRIVACY_SHIELD_MARKERS.includes(
      "Startup privacy shield defers macOS microphone device enumeration until explicit user audio action."
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
    const dmgPath = path.join(dir, "dmg", "Caveman_0.1.1_aarch64.dmg");
    const frontendDist = path.join(dir, "dist");
    const assetPath = path.join(frontendDist, "assets", "index.js");
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await mkdir(path.dirname(dmgPath), { recursive: true });
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));
    await writeFile(dmgPath, "fake dmg");
    await writeFile(assetPath, FRONTEND_PRIVACY_SHIELD_MARKERS.join("\n"));

    const result = await verifyPrivacyShieldPackage({
      targetSelector: "macos-arm64",
      releaseDir: dir,
      frontendDist,
      commandRunner: async (command, args) => {
        if (command !== "hdiutil") {
          throw new Error(`unexpected command: ${command}`);
        }

        if (args[0] === "attach") {
          const mountDir = args[args.indexOf("-mountpoint") + 1];
          const dmgBinaryPath = path.join(mountDir, "Caveman.app", "Contents", "MacOS", "caveman");
          await mkdir(path.dirname(dmgBinaryPath), { recursive: true });
          await writeFile(dmgBinaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));
        }

        return { stdout: "", stderr: "" };
      }
    });

    assert.equal(result.status, "ready");
    assert.equal(result.checked.length, 2);
    assert.equal(result.checked[0], binaryPath);
    assert.ok(result.checked[1].includes("caveman-privacy-dmg-"));
    assert.deepEqual(result.installersChecked, [dmgPath]);
    assert.equal(result.frontendRoot, frontendDist);
    assert.deepEqual(result.frontendRoots, [frontendDist]);
    assert.ok(result.frontendChecked.includes(assetPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails macOS package verification when the DMG installer is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-missing-dmg-"));
  try {
    const binaryPath = path.join(dir, "macos", "Caveman.app", "Contents", "MacOS", "caveman");
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));

    await assert.rejects(
      () =>
        verifyPrivacyShieldPackage({
          targetSelector: "macos-arm64",
          releaseDir: dir,
          frontendDist: path.join(dir, "missing-dist"),
          commandRunner: async () => {
            throw new Error("should not mount before the DMG is present");
          }
        }),
      /Missing macos-arm64 DMG installer/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifies Windows MSI and NSIS setup EXE extracted app binaries before attesting", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-downloaded-windows-"));
  try {
    const msiPath = path.join(dir, "bundle", "msi", "Caveman_0.1.1_x64_en-US.msi");
    const nsisPath = path.join(dir, "bundle", "nsis", "Caveman_0.1.1_x64-setup.exe");
    const frontendDist = path.join(dir, "dist");
    const assetPath = path.join(frontendDist, "assets", "index.js");
    await mkdir(path.dirname(msiPath), { recursive: true });
    await mkdir(path.dirname(nsisPath), { recursive: true });
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(msiPath, "fake msi installer");
    await writeFile(nsisPath, "fake nsis setup exe");
    await writeFile(assetPath, FRONTEND_PRIVACY_SHIELD_MARKERS.join("\n"));

    const result = await verifyPrivacyShieldPackage({
      targetSelector: "windows-x64",
      releaseDir: dir,
      frontendDist,
      commandRunner: async (command, args) => {
        if (command === "msiexec.exe") {
          const extractDir = args.find((arg) => arg.startsWith("TARGETDIR=")).slice("TARGETDIR=".length);
          const binaryPath = path.join(extractDir, "Program Files", "Caveman", "caveman.exe");
          await mkdir(path.dirname(binaryPath), { recursive: true });
          await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].join("\n"));
          return { stdout: "", stderr: "" };
        }

        if (command === "7z") {
          const outputArg = args.find((arg) => arg.startsWith("-o"));
          const extractDir = outputArg.slice(2);
          const binaryPath = path.join(extractDir, "$PLUGINSDIR", "app", "caveman.exe");
          await mkdir(path.dirname(binaryPath), { recursive: true });
          await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].join("\n"));
          return { stdout: "", stderr: "" };
        }

        throw new Error(`unexpected command: ${command}`);
      }
    });

    assert.equal(result.status, "ready");
    assert.deepEqual(result.installersChecked, [msiPath, nsisPath]);
    assert.equal(result.checked.length, 2);
    assert.ok(result.checked.some((candidate) => candidate.includes("caveman-privacy-msi-")));
    assert.ok(result.checked.some((candidate) => candidate.includes("caveman-privacy-nsis-")));
    assert.equal(result.frontendRoot, frontendDist);
    assert.deepEqual(result.frontendRoots, [frontendDist]);
    assert.ok(result.frontendChecked.includes(assetPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails Windows package verification when the NSIS setup EXE app binary lacks privacy markers", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-nsis-missing-markers-"));
  try {
    const msiPath = path.join(dir, "bundle", "msi", "Caveman_0.1.1_x64_en-US.msi");
    const nsisPath = path.join(dir, "bundle", "nsis", "Caveman_0.1.1_x64-setup.exe");
    const frontendDist = path.join(dir, "dist");
    const assetPath = path.join(frontendDist, "assets", "index.js");
    await mkdir(path.dirname(msiPath), { recursive: true });
    await mkdir(path.dirname(nsisPath), { recursive: true });
    await mkdir(path.dirname(assetPath), { recursive: true });
    await writeFile(msiPath, "fake msi installer");
    await writeFile(nsisPath, "fake nsis setup exe");
    await writeFile(assetPath, FRONTEND_PRIVACY_SHIELD_MARKERS.join("\n"));

    await assert.rejects(
      () =>
        verifyPrivacyShieldPackage({
          targetSelector: "windows-x64",
          releaseDir: dir,
          frontendDist,
          commandRunner: async (command, args) => {
            if (command === "msiexec.exe") {
              const extractDir = args.find((arg) => arg.startsWith("TARGETDIR=")).slice("TARGETDIR=".length);
              const binaryPath = path.join(extractDir, "Program Files", "Caveman", "caveman.exe");
              await mkdir(path.dirname(binaryPath), { recursive: true });
              await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["windows-x64"].join("\n"));
              return { stdout: "", stderr: "" };
            }

            if (command === "7z") {
              const outputArg = args.find((arg) => arg.startsWith("-o"));
              const extractDir = outputArg.slice(2);
              const binaryPath = path.join(extractDir, "$PLUGINSDIR", "app", "caveman.exe");
              await mkdir(path.dirname(binaryPath), { recursive: true });
              await writeFile(binaryPath, "SetWindowDisplayAffinity only");
              return { stdout: "", stderr: "" };
            }

            throw new Error(`unexpected command: ${command}`);
          }
        }),
      /caveman-privacy-nsis-.+caveman\.exe is missing native privacy shield markers/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails Windows package verification when the NSIS setup EXE is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-missing-nsis-"));
  try {
    const msiPath = path.join(dir, "bundle", "msi", "Caveman_0.1.1_x64_en-US.msi");
    await mkdir(path.dirname(msiPath), { recursive: true });
    await writeFile(msiPath, "fake msi installer");

    await assert.rejects(
      () =>
        verifyPrivacyShieldPackage({
          targetSelector: "windows-x64",
          releaseDir: dir,
          frontendDist: path.join(dir, "missing-dist"),
          commandRunner: async () => {
            throw new Error("should not extract before all Windows installers are present");
          }
        }),
      /Missing Windows NSIS setup EXE installer/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails downloaded package verification when frontend restore gate marker is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "caveman-privacy-missing-frontend-"));
  try {
    const binaryPath = path.join(dir, "macos", "Caveman.app", "Contents", "MacOS", "caveman");
    const dmgPath = path.join(dir, "dmg", "Caveman_0.1.1_aarch64.dmg");
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await mkdir(path.dirname(dmgPath), { recursive: true });
    await writeFile(binaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));
    await writeFile(dmgPath, "fake dmg");

    await assert.rejects(
      () =>
        verifyPrivacyShieldPackage({
          targetSelector: "macos-arm64",
          releaseDir: dir,
          frontendDist: path.join(dir, "missing-dist"),
          commandRunner: async (command, args) => {
            if (command !== "hdiutil") {
              throw new Error(`unexpected command: ${command}`);
            }

            if (args[0] === "attach") {
              const mountDir = args[args.indexOf("-mountpoint") + 1];
              const dmgBinaryPath = path.join(mountDir, "Caveman.app", "Contents", "MacOS", "caveman");
              await mkdir(path.dirname(dmgBinaryPath), { recursive: true });
              await writeFile(dmgBinaryPath, TARGET_PRIVACY_SHIELD_MARKERS["macos-arm64"].join("\n"));
            }

            return { stdout: "", stderr: "" };
          }
        }),
      /missing frontend privacy shield markers/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
