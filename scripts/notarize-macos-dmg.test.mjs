import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodesignArgs,
  buildNotarytoolSubmitArgs,
  buildStaplerArgs,
  buildSpctlAssessArgs
} from "./notarize-macos-dmg.mjs";

test("builds the commercial DMG signing, notarization, stapling, and assessment commands", () => {
  const dmgPath = "/tmp/Caveman_0.1.1_aarch64.dmg";

  assert.deepEqual(buildCodesignArgs({
    dmgPath,
    signingIdentity: "Developer ID Application: Example LLC (TEAMID1234)"
  }), ["--force", "--sign", "Developer ID Application: Example LLC (TEAMID1234)", "--timestamp", dmgPath]);

  assert.deepEqual(buildNotarytoolSubmitArgs({
    dmgPath,
    appleApiIssuer: "issuer-id",
    appleApiKey: "key-id",
    appleApiKeyPath: "/tmp/AuthKey_key-id.p8"
  }), [
    "notarytool",
    "submit",
    dmgPath,
    "--wait",
    "--issuer",
    "issuer-id",
    "--key-id",
    "key-id",
    "--key",
    "/tmp/AuthKey_key-id.p8"
  ]);

  assert.deepEqual(buildStaplerArgs("staple", dmgPath), ["stapler", "staple", dmgPath]);
  assert.deepEqual(buildStaplerArgs("validate", dmgPath), ["stapler", "validate", dmgPath]);
  assert.deepEqual(buildSpctlAssessArgs(dmgPath), [
    "--assess",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    "--verbose",
    dmgPath
  ]);
});

test("supports Apple ID notarization credentials when API key credentials are absent", () => {
  assert.deepEqual(buildNotarytoolSubmitArgs({
    dmgPath: "/tmp/Caveman_0.1.1_x64.dmg",
    appleId: "developer@example.com",
    applePassword: "app-specific-password",
    appleTeamId: "TEAMID1234"
  }), [
    "notarytool",
    "submit",
    "/tmp/Caveman_0.1.1_x64.dmg",
    "--wait",
    "--apple-id",
    "developer@example.com",
    "--password",
    "app-specific-password",
    "--team-id",
    "TEAMID1234"
  ]);
});
