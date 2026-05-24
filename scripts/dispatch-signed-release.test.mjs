import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowDispatchArgs,
  runSignedReleaseDispatch,
  validateReleaseTag
} from "./dispatch-signed-release.mjs";

const COMPLETE_SECRET_NAMES = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "WINDOWS_CODESIGN_CERTIFICATE_BASE64",
  "WINDOWS_CODESIGN_CERTIFICATE_PASSWORD",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "KEYCHAIN_PASSWORD",
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_PRIVATE_KEY_BASE64"
];

test("validates signed release tags before workflow dispatch", () => {
  assert.equal(validateReleaseTag("v0.1.1"), "v0.1.1");
  assert.equal(validateReleaseTag("v1.2.3-beta.1"), "v1.2.3-beta.1");
  assert.throws(() => validateReleaseTag("0.1.1"), /Release tag must look like v1.2.3/);
  assert.throws(() => validateReleaseTag("latest"), /Release tag must look like v1.2.3/);
});

test("builds a GitHub workflow dispatch command for signed desktop release", () => {
  assert.deepEqual(buildWorkflowDispatchArgs({
    tag: "v0.1.1",
    releaseNotes: "Caveman v0.1.1 signed desktop update.",
    ref: "main"
  }), [
    "workflow",
    "run",
    "Release Signed Desktop Builds",
    "--ref",
    "main",
    "-f",
    "tag=v0.1.1",
    "-f",
    "release_notes=Caveman v0.1.1 signed desktop update."
  ]);
});

test("blocks signed release dispatch when commercial signing secrets are incomplete", async () => {
  await assert.rejects(
    () => runSignedReleaseDispatch({
      tag: "v0.1.1",
      secretNames: ["TAURI_SIGNING_PRIVATE_KEY"]
    }),
    /Missing commercial release secrets: WINDOWS_CODESIGN_CERTIFICATE_BASE64/
  );
});

test("dry-runs signed release dispatch without launching the workflow", async () => {
  const commands = [];
  const result = await runSignedReleaseDispatch({
    tag: "v0.1.1",
    releaseNotes: "Ship it.",
    secretNames: COMPLETE_SECRET_NAMES,
    commandRunner: async (command, args) => {
      commands.push([command, args]);
      return { stdout: "" };
    }
  });

  assert.equal(result.status, "ready");
  assert.equal(result.dispatched, false);
  assert.deepEqual(commands, []);
  assert.deepEqual(result.args, [
    "workflow",
    "run",
    "Release Signed Desktop Builds",
    "--ref",
    "main",
    "-f",
    "tag=v0.1.1",
    "-f",
    "release_notes=Ship it."
  ]);
});

test("dispatches signed release workflow only when apply is set", async () => {
  const commands = [];
  const result = await runSignedReleaseDispatch({
    tag: "v0.1.1",
    releaseNotes: "Ship it.",
    apply: true,
    secretNames: COMPLETE_SECRET_NAMES,
    commandRunner: async (command, args) => {
      commands.push([command, args]);
      return { stdout: "" };
    }
  });

  assert.equal(result.status, "dispatched");
  assert.equal(result.dispatched, true);
  assert.deepEqual(commands, [["gh", result.args]]);
});
